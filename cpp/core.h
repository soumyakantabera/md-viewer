// Pure helpers shared by the app (main.cpp) and the self-test (selftest.cpp). No WebView2 here.
#pragma once
#include <windows.h>
#include <string>
#include <algorithm>
#include <vector>
#include <cwctype>
#include <cstdio>

namespace core {

inline std::wstring U8ToW(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
    std::wstring w(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n);
    return w;
}
inline std::string WToU8(const std::wstring& w) {
    if (w.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(n, 0);
    WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), &s[0], n, nullptr, nullptr);
    return s;
}

// JSON string literal (with quotes). Safe to embed in a single-line tab-separated message.
inline std::wstring JsonStr(const std::wstring& s) {
    std::wstring o = L"\"";
    for (wchar_t c : s) {
        switch (c) {
            case L'\\': o += L"\\\\"; break;
            case L'"':  o += L"\\\""; break;
            case L'\n': o += L"\\n";  break;
            case L'\r': o += L"\\r";  break;
            case L'\t': o += L"\\t";  break;
            case 0x2028: o += L"\\u2028"; break;
            case 0x2029: o += L"\\u2029"; break;
            default:
                if (c < 0x20) { wchar_t b[8]; swprintf(b, 8, L"\\u%04x", (unsigned)c); o += b; }
                else o += c;
        }
    }
    return o + L"\"";
}

inline bool ReadAll(const std::wstring& p, std::string& out) {
    HANDLE h = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                           nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER sz{}; GetFileSizeEx(h, &sz);
    out.assign((size_t)sz.QuadPart, '\0');
    size_t off = 0; DWORD got = 0;
    while (off < out.size()) {
        DWORD want = (DWORD)std::min<size_t>(out.size() - off, 1u << 24);
        if (!ReadFile(h, &out[off], want, &got, nullptr) || !got) break;
        off += got;
    }
    out.resize(off);
    CloseHandle(h);
    return true;
}
inline bool WriteAll(const std::wstring& p, const std::string& data) {
    HANDLE h = CreateFileW(p.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    size_t off = 0; DWORD put = 0; bool ok = true;
    while (off < data.size()) {
        DWORD want = (DWORD)std::min<size_t>(data.size() - off, 1u << 24);
        if (!WriteFile(h, data.data() + off, want, &put, nullptr) || !put) { ok = false; break; }
        off += put;
    }
    CloseHandle(h);
    return ok;
}

inline std::wstring BaseName(const std::wstring& p) {
    size_t i = p.find_last_of(L"\\/");
    return i == std::wstring::npos ? p : p.substr(i + 1);
}
inline std::wstring StripExt(const std::wstring& n) {
    size_t i = n.find_last_of(L'.');
    return i == std::wstring::npos || i == 0 ? n : n.substr(0, i);
}

// Decode file bytes: UTF-8/UTF-16 BOMs honoured; invalid UTF-8 falls back to the system ANSI code page.
inline std::wstring DecodeText(std::string raw) {
    auto u = [&](size_t i) { return (unsigned char)raw[i]; };
    if (raw.size() >= 3 && u(0) == 0xEF && u(1) == 0xBB && u(2) == 0xBF) return U8ToW(raw.substr(3));
    if (raw.size() >= 2 && ((u(0) == 0xFF && u(1) == 0xFE) || (u(0) == 0xFE && u(1) == 0xFF))) {
        bool be = u(0) == 0xFE;
        std::wstring w((raw.size() - 2) / 2, L'\0');
        for (size_t i = 0; i < w.size(); i++) {
            unsigned char lo = u(2 + i * 2 + (be ? 1 : 0)), hi = u(2 + i * 2 + (be ? 0 : 1));
            w[i] = (wchar_t)(lo | (hi << 8));
        }
        return w;
    }
    if (raw.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, raw.data(), (int)raw.size(), nullptr, 0);
    if (n > 0) return U8ToW(raw);
    n = MultiByteToWideChar(CP_ACP, 0, raw.data(), (int)raw.size(), nullptr, 0);
    std::wstring w(n, 0);
    MultiByteToWideChar(CP_ACP, 0, raw.data(), (int)raw.size(), &w[0], n);
    return w;
}

// {"path":...,"name":...,"text":...} or "null" when the file can't be read.
inline std::wstring DocJson(const std::wstring& p) {
    std::string raw;
    if (!ReadAll(p, raw)) return L"null";
    return L"{\"path\":" + JsonStr(p) + L",\"name\":" + JsonStr(BaseName(p)) + L",\"text\":" + JsonStr(DecodeText(raw)) + L"}";
}

// Page -> host messages are "op<TAB>id<TAB>arg1<TAB>arg2"; arg2 is the rest of the string (may contain tabs).
struct Msg { std::wstring op, id, a1, a2; };
inline bool SplitMsg(const std::wstring& m, Msg& o) {
    size_t p1 = m.find(L'\t');
    if (p1 == std::wstring::npos) return false;
    size_t p2 = m.find(L'\t', p1 + 1);
    size_t p3 = p2 == std::wstring::npos ? std::wstring::npos : m.find(L'\t', p2 + 1);
    o.op = m.substr(0, p1);
    o.id = p2 == std::wstring::npos ? m.substr(p1 + 1) : m.substr(p1 + 1, p2 - p1 - 1);
    o.a1 = p3 == std::wstring::npos ? L"" : m.substr(p2 + 1, p3 - p2 - 1);
    o.a2 = p3 == std::wstring::npos ? L"" : m.substr(p3 + 1);
    return true;
}

inline std::wstring FileUrl(const std::wstring& path) {
    std::wstring u = L"file:///";
    for (wchar_t c : path) {
        if (c == L'\\') u += L'/';
        else if (c == L' ') u += L"%20";
        else if (c == L'#') u += L"%23";
        else if (c == L'%') u += L"%25";
        else if (c == L'?') u += L"%3F";
        else u += c;
    }
    return u;
}


inline std::string Base64Decode(const std::string& in) {
    static int T[256]; static bool init = false;
    if (!init) { std::fill(T, T + 256, -1); const char* c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; for (int i = 0; i < 64; i++) T[(unsigned char)c[i]] = i; init = true; }
    std::string out; out.reserve(in.size() * 3 / 4);
    int val = 0, bits = -8;
    for (unsigned char ch : in) {
        if (T[ch] < 0) continue;                       // skips '=', whitespace
        val = (val << 6) + T[ch]; bits += 6;
        if (bits >= 0) { out.push_back((char)((val >> bits) & 0xFF)); bits -= 8; }
    }
    return out;
}

inline std::wstring LowerPath(std::wstring s) {
    for (auto& c : s) { if (c == L'/') c = L'\\'; c = (wchar_t)towlower(c); }
    return s;
}
inline std::wstring Canon(const std::wstring& p) {            // absolute, '..' resolved, lower-cased, no trailing slash
    wchar_t b[MAX_PATH * 4]; DWORD n = GetFullPathNameW(p.c_str(), MAX_PATH * 4, b, nullptr);
    std::wstring r = LowerPath(n && n < MAX_PATH * 4 ? std::wstring(b, n) : p);
    while (r.size() > 3 && r.back() == L'\\') r.pop_back();
    return r;
}
inline std::wstring Ext(const std::wstring& p) {
    size_t i = p.find_last_of(L'.'), j = p.find_last_of(L"\\/");
    if (i == std::wstring::npos || (j != std::wstring::npos && i < j)) return L"";
    std::wstring e = p.substr(i + 1); for (auto& c : e) c = (wchar_t)towlower(c); return e;
}
inline bool IsMarkdownExt(const std::wstring& p) { std::wstring e = Ext(p); return e == L"md" || e == L"markdown" || e == L"mdown" || e == L"mkd"; }
inline bool IsDocExt(const std::wstring& p) { return IsMarkdownExt(p) || Ext(p) == L"txt"; }

// Which files the page may read or write. Only paths the *user* picked (dialog, command line, drop, folder)
// are approved: the exact file plus the folder tree it lives in. Only Markdown files are ever readable through
// a folder approval; .txt only when that exact file was chosen. Nothing outside approved trees can be read.
struct Approvals {
    std::vector<std::wstring> dirs, files;
    static bool Under(const std::wstring& n, const std::wstring& d) {
        return n.size() > d.size() && n.compare(0, d.size(), d) == 0 && (d.back() == L'\\' || n[d.size()] == L'\\');
    }
    void ApproveDir(const std::wstring& d) {
        std::wstring c = Canon(d);
        if (c.size() <= 3) return;                                  // never approve a whole drive root
        if (std::find(dirs.begin(), dirs.end(), c) == dirs.end() && dirs.size() < 500) dirs.push_back(c);
    }
    void ApproveFile(const std::wstring& f) {
        std::wstring c = Canon(f);
        if (std::find(files.begin(), files.end(), c) == files.end() && files.size() < 2000) files.push_back(c);
        size_t i = c.find_last_of(L'\\'); if (i != std::wstring::npos && i > 2) ApproveDir(c.substr(0, i));
    }
    bool DirAllowed(const std::wstring& d) const {
        std::wstring c = Canon(d);
        for (auto& x : dirs) if (c == x || Under(c, x)) return true;
        return false;
    }
    bool Allowed(const std::wstring& p) const {
        if (!IsDocExt(p)) return false;
        std::wstring c = Canon(p);
        if (std::find(files.begin(), files.end(), c) != files.end()) return true;
        if (!IsMarkdownExt(p)) return false;
        for (auto& d : dirs) if (Under(c, d)) return true;
        return false;
    }
    void Load(const std::wstring& file) {
        std::string raw; if (!ReadAll(file, raw)) return;
        std::wstring w = DecodeText(raw), line;
        for (wchar_t ch : w) { if (ch == L'\n') { if (!line.empty()) ApproveDir(line); line.clear(); } else if (ch != L'\r') line += ch; }
        if (!line.empty()) ApproveDir(line);
    }
    void Save(const std::wstring& file) const {
        std::wstring w; for (auto& d : dirs) w += d + L"\r\n";
        WriteAll(file, WToU8(w));
    }
};

// Recursive list of Markdown files under root: [{"path":..,"rel":..}, ...] (skips dot-folders and node_modules).
inline void ListMd(const std::wstring& root, const std::wstring& rel, std::vector<std::pair<std::wstring, std::wstring>>& out, int depth = 0, size_t cap = 5000) {
    if (depth > 8 || out.size() >= cap) return;
    WIN32_FIND_DATAW f; std::wstring base = root; if (base.back() != L'\\') base += L'\\';
    HANDLE h = FindFirstFileW((base + rel + L"*").c_str(), &f);
    if (h == INVALID_HANDLE_VALUE) return;
    do {
        std::wstring n = f.cFileName;
        if (n == L"." || n == L".." || out.size() >= cap) continue;
        if (f.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) continue;
        if (f.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            if (n[0] == L'.' || LowerPath(n) == L"node_modules") continue;
            ListMd(root, rel + n + L"\\", out, depth + 1, cap);
        } else if (IsMarkdownExt(n)) out.push_back({base + rel + n, rel + n});
    } while (FindNextFileW(h, &f));
    FindClose(h);
}
inline std::wstring ListJson(const std::wstring& root) {
    std::vector<std::pair<std::wstring, std::wstring>> v; ListMd(root, L"", v);
    std::sort(v.begin(), v.end(), [](auto& a, auto& b) { return LowerPath(a.second) < LowerPath(b.second); });
    std::wstring o = L"[";
    for (size_t i = 0; i < v.size(); i++) {
        std::wstring r = v[i].second; for (auto& c : r) if (c == L'\\') c = L'/';
        o += (i ? L"," : L"") + std::wstring(L"{\"path\":") + JsonStr(v[i].first) + L",\"rel\":" + JsonStr(r) + L"}";
    }
    return o + L"]";
}

inline bool StartsWithI(const std::wstring& s, const wchar_t* p) {
    size_t n = wcslen(p); if (s.size() < n) return false;
    for (size_t i = 0; i < n; i++) if (towlower(s[i]) != towlower(p[i])) return false;
    return true;
}
inline bool IsHttpUrl(const std::wstring& u) { return StartsWithI(u, L"http://") || StartsWithI(u, L"https://"); }
inline bool IsOpenableExternal(const std::wstring& u) { return IsHttpUrl(u) || StartsWithI(u, L"mailto:"); }

} // namespace core
