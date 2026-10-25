// MD Viewer - a Win32 host for the viewer UI (../src/viewer.html) using WebView2.
// The page talks to this process through the window.mdv bridge defined in kShim below. Security model:
//  * the page may only read/write Markdown files the user picked (dialog / command line / drop / folder) - see Approvals
//  * the page has no network access of its own (CSP); remote documents are downloaded here with WinHTTP
//  * navigation away from the viewer and new windows are blocked; http(s)/mailto links open in the default browser
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <commdlg.h>
#include <shellapi.h>
#include <shlobj.h>
#include <atomic>
#include <functional>
#include <map>
#include <string>
#include <thread>
#include <vector>
#include "core.h"
#include "net.h"
#include "webview2_min.h"

using namespace core;

static const wchar_t* kClass = L"MdViewerWnd";
static const UINT_PTR kWatchTimer = 1;
static const UINT WM_REPLY = WM_APP + 1;           // worker thread -> UI thread

static HWND g_hwnd = nullptr;
static ICoreWebView2Controller* g_ctl = nullptr;
static ICoreWebView2* g_wv = nullptr;
static ICoreWebView2Environment* g_env = nullptr;
static bool g_ready = false;                       // page has loaded and registered its handlers
static std::wstring g_home;                        // URI of the viewer page (the only place the window may navigate)
static std::vector<std::wstring> g_pending;        // files to open once the page is ready
static std::map<std::wstring, FILETIME> g_watch;   // path -> last write time
static Approvals g_ok;                             // files/folders the user has chosen
static std::wstring g_dataDir;                     // %LOCALAPPDATA%\MDViewer

// ---- the JS bridge injected into every page ------------------------------------------------------
static const wchar_t* kShim = LR"JS(
(()=>{const P={};let n=0;const ls={open:[],changed:[]};
const call=(op,a1,a2)=>new Promise(r=>{const id=++n;P[id]=r;chrome.webview.postMessage(op+'\t'+id+'\t'+(a1||'')+'\t'+(a2||''))});
chrome.webview.addEventListener('message',e=>{const s=String(e.data),i=s.indexOf('\t'),j=s.indexOf('\t',i+1),t=s.slice(0,i);
 if(t==='R'){const id=s.slice(i+1,j),f=P[id];delete P[id];f&&f(JSON.parse(s.slice(j+1)))}
 else if(t==='E'){const name=s.slice(i+1,j),d=JSON.parse(s.slice(j+1));(ls[name]||[]).forEach(f=>f(d))}});
window.mdv={openDialog:()=>call('open'),read:p=>call('read',p),watch:p=>call('watch',p),unwatch:p=>call('unwatch',p),
 pathOf:f=>'',exportPdf:(n,o)=>call('pdf',n,o),exportHtml:(n,h)=>call('html',n,h),
 save:(n,b64)=>call('save',n,b64),writeFile:(p,t)=>call('write',p,t),openExternal:u=>call('openext',u),reveal:p=>call('reveal',p),
 chooseFolder:()=>call('folder'),list:p=>call('list',p),fetchText:u=>call('fetch',u),fullscreen:on=>call('fullscreen',on?'1':'0'),
 onOpen:cb=>ls.open.push(cb),onChanged:cb=>ls.changed.push(cb)};
addEventListener('load',()=>chrome.webview.postMessage('ready\t0\t\t'));
})();
)JS";

// ---- minimal COM event-handler object ------------------------------------------------------------
template <class I, class... A>
struct Handler final : I {
    std::atomic<ULONG> rc{1};
    const IID& iid;
    std::function<HRESULT(A...)> fn;
    Handler(const IID& i, std::function<HRESULT(A...)> f) : iid(i), fn(std::move(f)) {}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID r, void** o) override {
        if (IsEqualIID(r, IID_IUnknown) || IsEqualIID(r, iid)) { *o = static_cast<I*>(this); AddRef(); return S_OK; }
        *o = nullptr; return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++rc; }
    ULONG STDMETHODCALLTYPE Release() override { ULONG n = --rc; if (!n) delete this; return n; }
    HRESULT STDMETHODCALLTYPE Invoke(A... a) override { return fn(a...); }
};

// ---- helpers -------------------------------------------------------------------------------------
static std::wstring ExeDir() {
    wchar_t p[MAX_PATH * 2]; GetModuleFileNameW(nullptr, p, MAX_PATH * 2);
    std::wstring s(p); return s.substr(0, s.find_last_of(L'\\'));
}
static std::wstring FullPath(const std::wstring& p) {
    wchar_t b[MAX_PATH * 2]; DWORD n = GetFullPathNameW(p.c_str(), MAX_PATH * 2, b, nullptr);
    return n ? std::wstring(b, n) : p;
}
static void Post(const std::wstring& s) { if (g_wv) g_wv->PostWebMessageAsString(s.c_str()); }
static void Reply(const std::wstring& id, const std::wstring& json) { Post(L"R\t" + id + L"\t" + json); }

static void SaveApprovals() { CreateDirectoryW(g_dataDir.c_str(), nullptr); g_ok.Save(g_dataDir + L"\\approved.dirs"); }
static void Approve(const std::wstring& path) { g_ok.ApproveFile(path); SaveApprovals(); }

static void SendDoc(const wchar_t* evt, const std::wstring& path) {
    std::wstring d = DocJson(path);
    if (d != L"null") Post(std::wstring(L"E\t") + evt + L"\t" + d);
}
static void OpenPath(const std::wstring& path) {
    if (IsIconic(g_hwnd)) ShowWindow(g_hwnd, SW_RESTORE);
    SetForegroundWindow(g_hwnd);
    if (g_ready) SendDoc(L"open", path); else g_pending.push_back(path);
}
static void OpenExternal(const std::wstring& url) {
    if (IsOpenableExternal(url)) ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}

static FILETIME WriteTime(const std::wstring& p) {
    WIN32_FILE_ATTRIBUTE_DATA d{};
    if (!GetFileAttributesExW(p.c_str(), GetFileExInfoStandard, &d)) return FILETIME{};
    return d.ftLastWriteTime;
}
static void PollWatches() {
    for (auto& kv : g_watch) {
        FILETIME now = WriteTime(kv.first);
        if (now.dwLowDateTime == 0 && now.dwHighDateTime == 0) continue;   // missing / mid-save
        if (CompareFileTime(&now, &kv.second) != 0) { kv.second = now; SendDoc(L"changed", kv.first); }
    }
}

static std::vector<std::wstring> OpenDialog() {
    std::vector<wchar_t> buf(65536, 0);
    OPENFILENAMEW o{}; o.lStructSize = sizeof(o); o.hwndOwner = g_hwnd;
    o.lpstrFile = buf.data(); o.nMaxFile = (DWORD)buf.size();
    o.lpstrFilter = L"Markdown (*.md;*.markdown;*.mdown;*.mkd;*.txt)\0*.md;*.markdown;*.mdown;*.mkd;*.txt\0All files (*.*)\0*.*\0";
    o.Flags = OFN_EXPLORER | OFN_ALLOWMULTISELECT | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    std::vector<std::wstring> r;
    if (!GetOpenFileNameW(&o)) return r;
    std::wstring first = buf.data();
    wchar_t* p = buf.data() + first.size() + 1;
    if (!*p) { r.push_back(first); return r; }                       // single selection = full path
    std::wstring dir = first; if (!dir.empty() && dir.back() != L'\\') dir += L'\\';
    while (*p) { std::wstring n = p; r.push_back(dir + n); p += n.size() + 1; }
    return r;
}
static std::wstring MakeFilter(const std::wstring& label, const std::wstring& ext) {
    std::wstring f = label + L" (*." + ext + L")"; f.push_back(0); f += L"*." + ext; f.push_back(0);
    f += L"All files (*.*)"; f.push_back(0); f += L"*.*"; f.push_back(0);
    return f;
}
static std::wstring SaveDialog(const std::wstring& def, const std::wstring& label, const std::wstring& ext) {
    std::vector<wchar_t> buf(MAX_PATH * 4, 0);
    wcsncpy(buf.data(), def.c_str(), buf.size() - 1);
    std::wstring filter = MakeFilter(label, ext);
    OPENFILENAMEW o{}; o.lStructSize = sizeof(o); o.hwndOwner = g_hwnd;
    o.lpstrFile = buf.data(); o.nMaxFile = (DWORD)buf.size(); o.lpstrFilter = filter.c_str(); o.lpstrDefExt = ext.c_str();
    o.Flags = OFN_EXPLORER | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    return GetSaveFileNameW(&o) ? std::wstring(buf.data()) : std::wstring();
}
static std::wstring ChooseFolder() {
    BROWSEINFOW bi{}; bi.hwndOwner = g_hwnd; bi.lpszTitle = L"Choose a folder of Markdown files";
    bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
    PIDLIST_ABSOLUTE pidl = SHBrowseForFolderW(&bi);
    if (!pidl) return L"";
    wchar_t p[MAX_PATH * 2]; std::wstring r;
    if (SHGetPathFromIDListW(pidl, p)) r = p;
    CoTaskMemFree(pidl);
    return r;
}
static void SetFullscreen(bool on) {
    static WINDOWPLACEMENT wp = {}; static bool fs = false;
    if (on == fs) return;
    wp.length = sizeof(wp);
    LONG st = GetWindowLongW(g_hwnd, GWL_STYLE);
    if (on) {
        MONITORINFO mi = {}; mi.cbSize = sizeof(mi);
        if (GetWindowPlacement(g_hwnd, &wp) && GetMonitorInfoW(MonitorFromWindow(g_hwnd, MONITOR_DEFAULTTOPRIMARY), &mi)) {
            SetWindowLongW(g_hwnd, GWL_STYLE, st & ~WS_OVERLAPPEDWINDOW);
            SetWindowPos(g_hwnd, HWND_TOP, mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right - mi.rcMonitor.left,
                         mi.rcMonitor.bottom - mi.rcMonitor.top, SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
            fs = true;
        }
    } else {
        SetWindowLongW(g_hwnd, GWL_STYLE, st | WS_OVERLAPPEDWINDOW);
        SetWindowPlacement(g_hwnd, &wp);
        SetWindowPos(g_hwnd, nullptr, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
        fs = false;
    }
}

struct PendingReply { std::wstring id, json; };
static void StartFetch(const std::wstring& id, const std::wstring& url) {
    if (!IsHttpUrl(url)) { Reply(id, L"{\"ok\":false,\"error\":\"Only http(s) URLs can be loaded\"}"); return; }
    HWND hw = g_hwnd;
    std::thread([hw, id, url] {
        DWORD st = 0; std::string body; std::wstring err;
        bool ok = net::HttpGet(url, 25u << 20, st, body, err), good = ok && st >= 200 && st < 300;
        std::wstring j = good
            ? L"{\"ok\":true,\"status\":" + std::to_wstring(st) + L",\"text\":" + JsonStr(DecodeText(body)) + L"}"
            : L"{\"ok\":false,\"status\":" + std::to_wstring(st) + L",\"error\":" + JsonStr(ok ? L"HTTP " + std::to_wstring(st) : err) + L"}";
        PostMessageW(hw, WM_REPLY, 0, (LPARAM) new PendingReply{id, j});
    }).detach();
}

// ---- messages from the page ----------------------------------------------------------------------
static void OnMessage(const std::wstring& raw) {
    Msg m;
    if (!SplitMsg(raw, m)) return;
    const std::wstring& op = m.op;

    if (op == L"ready") {
        g_ready = true;
        for (auto& p : g_pending) SendDoc(L"open", p);
        g_pending.clear();
    } else if (op == L"open") {
        std::wstring arr = L"[";
        for (auto& p : OpenDialog()) {
            Approve(p);
            std::wstring d = DocJson(p); if (d != L"null") arr += (arr.size() > 1 ? L"," : L"") + d;
        }
        Reply(m.id, arr + L"]");
    } else if (op == L"read") {
        Reply(m.id, g_ok.Allowed(m.a1) ? DocJson(m.a1) : L"null");
    } else if (op == L"watch") {
        if (g_ok.Allowed(m.a1) && !g_watch.count(m.a1)) g_watch[m.a1] = WriteTime(m.a1);
        Reply(m.id, L"null");
    } else if (op == L"unwatch") {
        g_watch.erase(m.a1);
        Reply(m.id, L"null");
    } else if (op == L"write") {                                   // save an edited document back to its file
        bool ok = g_ok.Allowed(m.a1) && IsMarkdownExt(m.a1) && GetFileAttributesW(m.a1.c_str()) != INVALID_FILE_ATTRIBUTES
                  && WriteAll(m.a1, WToU8(m.a2));
        if (ok) g_watch[m.a1] = WriteTime(m.a1);                  // our own write must not look like an external change
        Reply(m.id, ok ? L"true" : L"false");
    } else if (op == L"html") {
        std::wstring path = SaveDialog(StripExt(m.a1) + L".html", L"HTML", L"html");
        Reply(m.id, path.empty() || !WriteAll(path, WToU8(m.a2)) ? L"false" : JsonStr(path));
    } else if (op == L"save") {                                    // generic binary save: a1 = file name, a2 = base64 data
        std::wstring ext = Ext(m.a1); if (ext.empty()) ext = L"bin";
        std::wstring path = SaveDialog(m.a1, ext + L" file", ext);
        Reply(m.id, path.empty() || !WriteAll(path, Base64Decode(WToU8(m.a2))) ? L"false" : JsonStr(path));
    } else if (op == L"pdf") {                                     // a1 = name, a2 = "A4|Letter;marginMm;backgrounds(0|1)"
        std::wstring path = SaveDialog(StripExt(m.a1) + L".pdf", L"PDF", L"pdf");
        ICoreWebView2_7* v7 = nullptr;
        if (path.empty() || !g_wv || FAILED(g_wv->QueryInterface(IID_ICoreWebView2_7, (void**)&v7)) || !v7) { Reply(m.id, L"false"); return; }
        ICoreWebView2PrintSettings* ps = nullptr; ICoreWebView2Environment6* e6 = nullptr;
        if (g_env && SUCCEEDED(g_env->QueryInterface(IID_ICoreWebView2Environment6, (void**)&e6)) && e6) {
            if (SUCCEEDED(e6->CreatePrintSettings(&ps)) && ps) {
                double mm = 15, w = 8.27, h = 11.69; int bg = 1;
                size_t p1 = m.a2.find(L';'), p2 = p1 == std::wstring::npos ? p1 : m.a2.find(L';', p1 + 1);
                if (p1 != std::wstring::npos) { if (m.a2.compare(0, p1, L"Letter") == 0) { w = 8.5; h = 11.0; } mm = _wtof(m.a2.c_str() + p1 + 1); }
                if (p2 != std::wstring::npos) bg = _wtoi(m.a2.c_str() + p2 + 1);
                double in = mm / 25.4;
                ps->put_PageWidth(w); ps->put_PageHeight(h);
                ps->put_MarginTop(in); ps->put_MarginBottom(in); ps->put_MarginLeft(in); ps->put_MarginRight(in);
                ps->put_ShouldPrintBackgrounds(bg ? TRUE : FALSE); ps->put_ShouldPrintHeaderAndFooter(FALSE);
            }
            e6->Release();
        }
        std::wstring id = m.id;
        auto* h = new Handler<ICoreWebView2PrintToPdfCompletedHandler, HRESULT, BOOL>(
            IID_ICoreWebView2PrintToPdfCompletedHandler,
            [id, path](HRESULT hr, BOOL ok) -> HRESULT { Reply(id, SUCCEEDED(hr) && ok ? JsonStr(path) : L"false"); return S_OK; });
        v7->PrintToPdf(path.c_str(), ps, h);
        h->Release(); v7->Release(); if (ps) ps->Release();
    } else if (op == L"openext") {
        bool ok = IsOpenableExternal(m.a1); if (ok) OpenExternal(m.a1);
        Reply(m.id, ok ? L"true" : L"false");
    } else if (op == L"reveal") {
        bool ok = g_ok.Allowed(m.a1);
        if (ok) { std::wstring arg = L"/select,\"" + FullPath(m.a1) + L"\""; ShellExecuteW(nullptr, L"open", L"explorer.exe", arg.c_str(), nullptr, SW_SHOWNORMAL); }
        Reply(m.id, ok ? L"true" : L"false");
    } else if (op == L"folder") {
        std::wstring dir = ChooseFolder();
        if (dir.empty()) { Reply(m.id, L"null"); return; }
        g_ok.ApproveDir(dir); SaveApprovals();
        Reply(m.id, L"{\"path\":" + JsonStr(dir) + L",\"files\":" + ListJson(dir) + L"}");
    } else if (op == L"list") {
        Reply(m.id, g_ok.DirAllowed(m.a1) ? L"{\"path\":" + JsonStr(m.a1) + L",\"files\":" + ListJson(m.a1) + L"}" : L"null");
    } else if (op == L"fetch") {
        StartFetch(m.id, m.a1);
    } else if (op == L"fullscreen") {
        SetFullscreen(m.a1 == L"1");
        Reply(m.id, L"null");
    }
}

// ---- WebView2 start-up ---------------------------------------------------------------------------
static void Fail(const std::wstring& text, bool offerRuntime) {
    if (offerRuntime) {
        if (MessageBoxW(g_hwnd, (text + L"\n\nOpen the download page?").c_str(), L"MD Viewer", MB_YESNO | MB_ICONERROR) == IDYES)
            ShellExecuteW(nullptr, L"open", L"https://developer.microsoft.com/microsoft-edge/webview2/", nullptr, nullptr, SW_SHOW);
    } else MessageBoxW(g_hwnd, text.c_str(), L"MD Viewer", MB_OK | MB_ICONERROR);
    PostQuitMessage(1);
}

static void OnController(ICoreWebView2Controller* c) {
    g_ctl = c; c->AddRef(); c->get_CoreWebView2(&g_wv);
    RECT rc; GetClientRect(g_hwnd, &rc); g_ctl->put_Bounds(rc); g_ctl->put_IsVisible(TRUE);

    // Let this window receive dropped files itself (WM_DROPFILES) so we get real paths.
    ICoreWebView2Controller4* c4 = nullptr;
    if (SUCCEEDED(c->QueryInterface(IID_ICoreWebView2Controller4, (void**)&c4)) && c4) { c4->put_AllowExternalDrop(FALSE); c4->Release(); }

    ICoreWebView2Settings* st = nullptr;
    if (SUCCEEDED(g_wv->get_Settings(&st)) && st) {
        st->put_IsStatusBarEnabled(FALSE);
        st->put_AreDevToolsEnabled(TRUE);              // F12 helps with bug reports
        st->put_AreDefaultContextMenusEnabled(TRUE);
        st->Release();
    }
    WV2Token t{};
    g_wv->add_WebMessageReceived(
        new Handler<ICoreWebView2WebMessageReceivedEventHandler, ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs*>(
            IID_ICoreWebView2WebMessageReceivedEventHandler,
            [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* a) -> HRESULT {
                LPWSTR s = nullptr;
                if (SUCCEEDED(a->TryGetWebMessageAsString(&s)) && s) { OnMessage(s); CoTaskMemFree(s); }
                return S_OK;
            }), &t);
    g_wv->add_DocumentTitleChanged(
        new Handler<ICoreWebView2DocumentTitleChangedEventHandler, ICoreWebView2*, IUnknown*>(
            IID_ICoreWebView2DocumentTitleChangedEventHandler,
            [](ICoreWebView2* wv, IUnknown*) -> HRESULT {
                LPWSTR s = nullptr;
                if (SUCCEEDED(wv->get_DocumentTitle(&s)) && s) { SetWindowTextW(g_hwnd, s); CoTaskMemFree(s); }
                return S_OK;
            }), &t);
    // Safety net 1: the window never navigates away from the viewer; web links go to the default browser.
    g_wv->add_NavigationStarting(
        new Handler<ICoreWebView2NavigationStartingEventHandler, ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs*>(
            IID_ICoreWebView2NavigationStartingEventHandler,
            [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* a) -> HRESULT {
                LPWSTR u = nullptr;
                if (FAILED(a->get_Uri(&u)) || !u) return S_OK;
                std::wstring uri = u; CoTaskMemFree(u);
                std::wstring base = uri.substr(0, uri.find(L'#'));
                if (g_home.empty()) { g_home = base; return S_OK; }                     // the first navigation defines "home"
                if (StartsWithI(base, g_home.c_str())) return S_OK;                    // reload / in-page anchors
                a->put_Cancel(TRUE);
                OpenExternal(uri);
                return S_OK;
            }), &t);
    // Safety net 2: target=_blank / window.open never create windows.
    g_wv->add_NewWindowRequested(
        new Handler<ICoreWebView2NewWindowRequestedEventHandler, ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs*>(
            IID_ICoreWebView2NewWindowRequestedEventHandler,
            [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* a) -> HRESULT {
                a->put_Handled(TRUE);
                LPWSTR u = nullptr;
                if (SUCCEEDED(a->get_Uri(&u)) && u) { OpenExternal(u); CoTaskMemFree(u); }
                return S_OK;
            }), &t);

    g_wv->AddScriptToExecuteOnDocumentCreated(kShim, nullptr);
    g_wv->Navigate(FileUrl(ExeDir() + L"\\viewer.html").c_str());
}

static void StartWebView() {
    SetEnvironmentVariableW(L"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", L"--autoplay-policy=no-user-gesture-required");
    HMODULE ldr = LoadLibraryW((ExeDir() + L"\\WebView2Loader.dll").c_str());
    typedef HRESULT(STDAPICALLTYPE * Create_t)(PCWSTR, PCWSTR, void*, ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*);
    Create_t create = ldr ? (Create_t)GetProcAddress(ldr, "CreateCoreWebView2EnvironmentWithOptions") : nullptr;
    if (!create) { Fail(L"WebView2Loader.dll is missing next to mdviewer.exe.", false); return; }

    auto* h = new Handler<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler, HRESULT, ICoreWebView2Environment*>(
        IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler,
        [](HRESULT hr, ICoreWebView2Environment* env) -> HRESULT {
            if (FAILED(hr) || !env) { Fail(L"The Microsoft Edge WebView2 Runtime is required but could not be started.", true); return S_OK; }
            g_env = env; env->AddRef();
            auto* ch = new Handler<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler, HRESULT, ICoreWebView2Controller*>(
                IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler,
                [](HRESULT hr2, ICoreWebView2Controller* c) -> HRESULT {
                    if (FAILED(hr2) || !c) { Fail(L"Could not create the WebView2 control.", true); return S_OK; }
                    OnController(c); return S_OK;
                });
            env->CreateCoreWebView2Controller(g_hwnd, ch);
            ch->Release();
            return S_OK;
        });
    HRESULT hr = create(nullptr, g_dataDir.c_str(), nullptr, h);
    h->Release();
    if (FAILED(hr)) Fail(L"The Microsoft Edge WebView2 Runtime is required but was not found.", true);
}

// ---- window --------------------------------------------------------------------------------------
static LRESULT CALLBACK WndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
    switch (m) {
        case WM_SIZE:
            if (g_ctl) { RECT rc; GetClientRect(h, &rc); g_ctl->put_Bounds(rc); }
            return 0;
        case WM_COPYDATA: {                                    // another instance forwarded a file to us
            auto* cds = (COPYDATASTRUCT*)l;
            if (cds && cds->dwData == 1 && cds->lpData) {
                std::wstring p((const wchar_t*)cds->lpData, cds->cbData / sizeof(wchar_t));
                while (!p.empty() && !p.back()) p.pop_back();
                if (IsDocExt(p)) { Approve(p); OpenPath(p); }
            }
            return TRUE;
        }
        case WM_DROPFILES: {                                   // files dropped on the window: real paths, live reload works
            HDROP d = (HDROP)w; UINT n = DragQueryFileW(d, 0xFFFFFFFF, nullptr, 0);
            for (UINT i = 0; i < n; i++) {
                wchar_t b[MAX_PATH * 2];
                if (DragQueryFileW(d, i, b, MAX_PATH * 2)) { std::wstring p = b; if (IsDocExt(p)) { Approve(p); OpenPath(p); } }
            }
            DragFinish(d);
            return 0;
        }
        case WM_REPLY: {
            auto* p = (PendingReply*)l; Reply(p->id, p->json); delete p;
            return 0;
        }
        case WM_TIMER:
            if (w == kWatchTimer) PollWatches();
            return 0;
        case WM_DESTROY:
            KillTimer(h, kWatchTimer);
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(h, m, w, l);
}

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE, PWSTR, int show) {
    std::vector<std::wstring> files;
    int argc = 0; LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    for (int i = 1; i < argc; i++) { std::wstring p = FullPath(argv[i]); if (IsDocExt(p) && GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES) files.push_back(p); }
    if (argv) LocalFree(argv);

    // Single instance: hand the files to the running window and exit.
    HANDLE mtx = CreateMutexW(nullptr, TRUE, L"Local\\MDViewerSingleton");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        HWND other = nullptr;
        for (int i = 0; i < 20 && !other; i++) { other = FindWindowW(kClass, nullptr); if (!other) Sleep(100); }
        if (other) {
            if (IsIconic(other)) ShowWindow(other, SW_RESTORE);
            SetForegroundWindow(other);
            for (auto& f : files) {
                COPYDATASTRUCT c{}; c.dwData = 1; c.cbData = (DWORD)((f.size() + 1) * sizeof(wchar_t)); c.lpData = (void*)f.c_str();
                SendMessageW(other, WM_COPYDATA, 0, (LPARAM)&c);
            }
        }
        return 0;
    }

    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    wchar_t la[MAX_PATH] = L""; GetEnvironmentVariableW(L"LOCALAPPDATA", la, MAX_PATH);
    g_dataDir = std::wstring(la) + L"\\MDViewer";
    g_ok.Load(g_dataDir + L"\\approved.dirs");
    for (auto& f : files) g_ok.ApproveFile(f);
    if (!files.empty()) SaveApprovals();
    g_pending = files;

    WNDCLASSEXW wc{}; wc.cbSize = sizeof(wc); wc.lpfnWndProc = WndProc; wc.hInstance = hi;
    wc.lpszClassName = kClass; wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hIcon = (HICON)LoadImageW(hi, MAKEINTRESOURCEW(1), IMAGE_ICON, GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), 0);
    wc.hIconSm = (HICON)LoadImageW(hi, MAKEINTRESOURCEW(1), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), 0);
    RegisterClassExW(&wc);
    g_hwnd = CreateWindowExW(0, kClass, L"MD Viewer", WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1280, 840,
                             nullptr, nullptr, hi, nullptr);
    DragAcceptFiles(g_hwnd, TRUE);
    ShowWindow(g_hwnd, show);
    UpdateWindow(g_hwnd);
    SetTimer(g_hwnd, kWatchTimer, 700, nullptr);
    StartWebView();

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    if (mtx) CloseHandle(mtx);
    return (int)msg.wParam;
}
