// HTTP(S) GET through WinHTTP (system proxy, redirects, TLS). Used so the page needs no network access of its own.
#pragma once
#include <windows.h>
#include <winhttp.h>
#include <string>

namespace net {

// Returns true when a response was received (check `status`). On failure `err` says why.
inline bool HttpGet(const std::wstring& url, size_t maxBytes, DWORD& status, std::string& body, std::wstring& err) {
    status = 0; body.clear();
    URL_COMPONENTS uc{}; uc.dwStructSize = sizeof(uc);
    uc.dwSchemeLength = uc.dwHostNameLength = uc.dwUrlPathLength = uc.dwExtraInfoLength = (DWORD)-1;
    if (!WinHttpCrackUrl(url.c_str(), (DWORD)url.size(), 0, &uc) || !uc.lpszHostName) { err = L"Invalid URL"; return false; }
    std::wstring host(uc.lpszHostName, uc.dwHostNameLength);
    std::wstring path(uc.lpszUrlPath ? uc.lpszUrlPath : L"/", uc.lpszUrlPath ? uc.dwUrlPathLength + uc.dwExtraInfoLength : 1);
    if (path.empty()) path = L"/";
    bool secure = uc.nScheme == INTERNET_SCHEME_HTTPS;

    HINTERNET ses = WinHttpOpen(L"MDViewer/1.4", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!ses) { err = L"Network unavailable"; return false; }
    WinHttpSetTimeouts(ses, 10000, 10000, 30000, 30000);
    HINTERNET con = WinHttpConnect(ses, host.c_str(), uc.nPort, 0);
    HINTERNET req = con ? WinHttpOpenRequest(con, L"GET", path.c_str(), nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, secure ? WINHTTP_FLAG_SECURE : 0) : nullptr;
    bool ok = false;
    if (req) {
        const wchar_t* hdr = L"Accept: text/markdown, text/plain, text/*;q=0.9, */*;q=0.5";
        if (WinHttpSendRequest(req, hdr, (DWORD)-1, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) && WinHttpReceiveResponse(req, nullptr)) {
            DWORD sz = sizeof(status);
            WinHttpQueryHeaders(req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &status, &sz, WINHTTP_NO_HEADER_INDEX);
            ok = true;
            for (;;) {
                DWORD avail = 0;
                if (!WinHttpQueryDataAvailable(req, &avail) || !avail) break;
                if (body.size() + avail > maxBytes) { err = L"File too large"; ok = false; break; }
                size_t off = body.size(); body.resize(off + avail);
                DWORD got = 0;
                if (!WinHttpReadData(req, &body[off], avail, &got)) { err = L"Download interrupted"; ok = false; break; }
                body.resize(off + got);
            }
        } else err = L"Could not connect";
    } else err = L"Could not connect";
    if (req) WinHttpCloseHandle(req);
    if (con) WinHttpCloseHandle(con);
    WinHttpCloseHandle(ses);
    return ok;
}

} // namespace net
