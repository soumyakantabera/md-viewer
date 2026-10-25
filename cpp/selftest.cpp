// Console self-test for core.h (runs under Wine or on Windows):  selftest.exe
#include <cstdio>
#include "core.h"
#include "net.h"
using namespace core;
static int fails = 0;
#define CHECK(c) do{ if(!(c)){ printf("FAIL line %d: %s\n", __LINE__, #c); fails++; } else printf("PASS %s\n", #c);}while(0)
int main() {
    CHECK(JsonStr(L"a\"b\\c\nd\te") == L"\"a\\\"b\\\\c\\nd\\te\"");
    CHECK(JsonStr(std::wstring(1, (wchar_t)1)) == L"\"\\u0001\"");
    CHECK(JsonStr(std::wstring(1, (wchar_t)0x2028)) == L"\"\\u2028\"");
    std::string u8 = "caf\xC3\xA9 \xE2\x9C\x85";                       // "café ✅"
    CHECK(WToU8(U8ToW(u8)) == u8);
    CHECK(U8ToW(u8).size() == 6);
    wchar_t tmp[MAX_PATH]; GetTempPathW(MAX_PATH, tmp);
    std::wstring f = std::wstring(tmp) + L"mdv selftest \u00e9.md";
    CHECK(WriteAll(f, "\xEF\xBB\xBF# Title\r\nline \"two\"\t\xE2\x9C\x85\n"));
    std::wstring d = DocJson(f);
    CHECK(d.find(L"\"name\":\"mdv selftest \u00e9.md\"") != std::wstring::npos);
    CHECK(d.find(L"\"text\":\"# Title\\r\\nline \\\"two\\\"\\t\u2705\\n\"") != std::wstring::npos);   // BOM stripped
    CHECK(d.find(L'\n') == std::wstring::npos && d.find(L'\t') == std::wstring::npos);               // single-line, tab-free
    DeleteFileW(f.c_str());
    CHECK(DocJson(L"Z:\\definitely\\missing.md") == L"null");
    Msg m;
    CHECK(SplitMsg(L"html\t7\tdoc.md\t<p>a\tb</p>\n", m) && m.op == L"html" && m.id == L"7" && m.a1 == L"doc.md" && m.a2 == L"<p>a\tb</p>\n");
    CHECK(SplitMsg(L"ready\t0\t\t", m) && m.op == L"ready" && m.id == L"0" && m.a1.empty() && m.a2.empty());
    CHECK(!SplitMsg(L"garbage", m));
    CHECK(BaseName(L"C:\\docs\\a b.md") == L"a b.md" && StripExt(L"a.b.md") == L"a.b" && StripExt(L"noext") == L"noext");
    CHECK(FileUrl(L"C:\\Program Files\\MD Viewer\\viewer.html") == L"file:///C:/Program%20Files/MD%20Viewer/viewer.html");
    std::string big(5 * 1024 * 1024, 'x'); std::wstring bf = std::wstring(tmp) + L"mdv_big.bin";
    std::string back; CHECK(WriteAll(bf, big) && ReadAll(bf, back) && back == big); DeleteFileW(bf.c_str());

    // ---- encodings ----
    CHECK(DecodeText(std::string("\xEF\xBB\xBFhi \xE2\x9C\x85")) == L"hi \u2705");
    CHECK(DecodeText(std::string("\xFF\xFE" "h\0i\0\x05\x27", 8)) == L"hi\u2705");                  // UTF-16 LE BOM
    CHECK(DecodeText(std::string("\xFE\xFF\0h\0i\x27\x05", 8)) == L"hi\u2705");                    // UTF-16 BE BOM
    CHECK(DecodeText(std::string("plain ascii")) == L"plain ascii");
    CHECK(DecodeText(std::string("caf\xE9")).size() == 4);                                          // invalid UTF-8 -> ANSI fallback, no data loss
    CHECK(DecodeText(std::string()).empty());
    // ---- base64 ----
    CHECK(Base64Decode("SGVsbG8gV29ybGQ=") == "Hello World");
    CHECK(Base64Decode("YQ==") == "a" && Base64Decode("YWI=") == "ab" && Base64Decode("YWJj") == "abc");
    CHECK(Base64Decode("SGVs\nbG8=") == "Hello");                                                   // whitespace ignored
    CHECK(Base64Decode(std::string("AAECA/8=")) == std::string("\x00\x01\x02\x03\xFF", 5));        // binary safe
    // ---- allow-list ----
    {
        wchar_t t[MAX_PATH]; GetTempPathW(MAX_PATH, t);
        std::wstring root = std::wstring(t) + L"mdv_tree", sub = root + L"\\docs", hid = root + L"\\.git", nm = root + L"\\node_modules";
        CreateDirectoryW(root.c_str(), nullptr); CreateDirectoryW(sub.c_str(), nullptr); CreateDirectoryW(hid.c_str(), nullptr); CreateDirectoryW(nm.c_str(), nullptr);
        WriteAll(root + L"\\README.md", "# r"); WriteAll(sub + L"\\guide.MD", "# g"); WriteAll(sub + L"\\notes.txt", "t");
        WriteAll(hid + L"\\x.md", "h"); WriteAll(nm + L"\\y.md", "n"); WriteAll(root + L"\\secret.pdf", "p"); WriteAll(root + L"\\sibling.md", "s");
        Approvals a;
        CHECK(!a.Allowed(root + L"\\README.md"));                                                   // nothing approved yet
        a.ApproveFile(root + L"\\README.md");
        CHECK(a.Allowed(root + L"\\README.md") && a.Allowed(root + L"\\sibling.md"));              // same folder
        CHECK(a.Allowed(sub + L"\\guide.MD"));                                                      // subfolder, case-insensitive ext
        CHECK(!a.Allowed(sub + L"\\notes.txt"));                                                    // .txt only if chosen explicitly
        CHECK(!a.Allowed(root + L"\\secret.pdf"));                                                  // not a document type
        CHECK(!a.Allowed(sub + L"\\..\\..\\mdv_tree_evil\\a.md"));                                  // sibling folder with similar prefix
        CHECK(!a.Allowed(root + L"\\docs\\..\\..\\Windows\\win.md"));                               // traversal out of the tree
        CHECK(!a.Allowed(L"C:\\Windows\\System32\\drivers\\etc\\hosts"));
        a.ApproveFile(sub + L"\\notes.txt");
        CHECK(a.Allowed(sub + L"\\notes.txt"));                                                     // explicit .txt pick
        Approvals b; b.ApproveDir(L"C:\\"); CHECK(b.dirs.empty());                                  // drive roots refused
        std::wstring store = root + L"\\approved.dirs"; a.Save(store); Approvals c; c.Load(store);
        CHECK(c.Allowed(root + L"\\sibling.md") && !c.Allowed(sub + L"\\notes.txt"));               // dirs persist, explicit files don't
        // ---- folder listing ----
        std::wstring j = ListJson(root);
        CHECK(j.find(L"\"rel\":\"README.md\"") != std::wstring::npos && j.find(L"\"rel\":\"docs/guide.MD\"") != std::wstring::npos);
        CHECK(j.find(L"x.md") == std::wstring::npos && j.find(L"y.md") == std::wstring::npos && j.find(L"notes.txt") == std::wstring::npos);
        DeleteFileW((root + L"\\README.md").c_str()); DeleteFileW((root + L"\\sibling.md").c_str()); DeleteFileW((root + L"\\secret.pdf").c_str()); DeleteFileW(store.c_str());
        DeleteFileW((sub + L"\\guide.MD").c_str()); DeleteFileW((sub + L"\\notes.txt").c_str()); DeleteFileW((hid + L"\\x.md").c_str()); DeleteFileW((nm + L"\\y.md").c_str());
        RemoveDirectoryW(sub.c_str()); RemoveDirectoryW(hid.c_str()); RemoveDirectoryW(nm.c_str()); RemoveDirectoryW(root.c_str());
    }
    // ---- URL rules ----
    CHECK(IsOpenableExternal(L"https://example.com/a?b=1") && IsOpenableExternal(L"HTTP://x.y") && IsOpenableExternal(L"mailto:a@b.c"));
    CHECK(!IsOpenableExternal(L"file:///C:/Windows/System32/cmd.exe") && !IsOpenableExternal(L"javascript:alert(1)") && !IsOpenableExternal(L"ms-msdt:/id x") && !IsOpenableExternal(L"C:\\Windows\\cmd.exe"));
    // ---- HTTP (informational: depends on network access of the machine running the test) ----
    {
        DWORD st = 0; std::string body; std::wstring err;
        bool ok = net::HttpGet(L"https://raw.githubusercontent.com/github/explore/main/topics/markdown/index.md", 1 << 20, st, body, err);
        printf("INFO http fetch: ok=%d status=%lu bytes=%zu err=%ls\n", (int)ok, st, body.size(), err.c_str());
        bool bad = net::HttpGet(L"not a url", 1024, st, body, err);
        CHECK(!bad);
    }
    printf(fails ? "\n%d FAILED\n" : "\nALL PASSED\n", fails);
    return fails;
}
