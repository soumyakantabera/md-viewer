# C++ application

A small Win32 + [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) host for the UI in `../src/viewer.html`.
About 1 MB exe, 1.6 MB installer; uses Edge's WebView2 runtime (preinstalled on Windows 11 and current Windows 10).

| File | Purpose |
|---|---|
| `main.cpp` | Window, WebView2 start-up, the `window.mdv` bridge (open dialog, read, live-reload polling, HTML/PDF export), single-instance forwarding |
| `core.h` | Pure helpers (encodings, JSON, messages, file IO, **allow-list**, folder listing), unit-tested by `selftest.cpp` |
| `net.h` | WinHTTP download used by `fetchText` |
| `webview2_min.h` | **Generated** minimal WebView2 COM declarations (see `gen_header.py`) |
| `gen_header.py` | Regenerates the header from the `webview2-com-sys` Rust bindings (exact vtable layouts) |
| `mdviewer.rc`, `mdviewer.manifest` | Icon, version info (author), DPI / long-path manifest |
| `installer.nsi` | NSIS script: per-user install, shortcuts, `.md` association, uninstaller, upgrade cleanup |
| `third_party/WebView2Loader.dll` | Microsoft's redistributable loader |

## Build

```bash
sudo apt install g++-mingw-w64-x86-64-posix binutils-mingw-w64-x86-64 nsis zip
npm ci && ./cpp/build.sh      # from the repo root
```

Output in `cpp/dist/`: `mdviewer.exe` (+ `viewer.html`, `lib/`, `WebView2Loader.dll`), `MD-Viewer-Setup.exe`, `MD-Viewer-portable.zip`.
Run `mdviewer.exe README.md` to open a file; a second launch hands its files to the running window.

Self-test of the helpers: `x86_64-w64-mingw32-g++-posix -std=c++17 -static cpp/selftest.cpp -o selftest.exe` and run it on Windows (or Wine).

## How the page talks to C++

A script injected into every page defines `window.mdv`. Calls become tab-separated strings sent with `chrome.webview.postMessage`;
replies and events (`open`, `changed`) come back via `PostWebMessageAsString`.

| `mdv` call | What the host does |
|---|---|
| `openDialog`, `chooseFolder` | Shows the dialog and **approves** what you pick |
| `read(path)`, `list(dir)`, `watch(path)` | Only for approved Markdown files / folders (`Approvals` in `core.h`); anything else returns `null` |
| `writeFile(path, text)` | Only an existing, approved Markdown file |
| `fetchText(url)` | WinHTTP download on a worker thread (http/https only, 25 MB limit) |
| `openExternal(url)`, `reveal(path)` | Default browser (http/https/mailto only), Explorer |
| `save(name, base64)`, `exportHtml`, `exportPdf(name, "A4;15;1")` | Save dialog + write, WebView2 `PrintToPdf` with paper/margins |
| `fullscreen(on)` | Borderless full screen (presentation mode) |

Also in the host: `NavigationStarting` / `NewWindowRequested` handlers keep the window on the viewer and send web links to the browser,
and `WM_DROPFILES` handles dropped files (`AllowExternalDrop` is turned off in WebView2) so dropped files have real paths.

**Approvals** are the heart of the file-access model: picking a file approves it and its folder tree; only `.md/.markdown/.mdown/.mkd`
are readable through a folder approval (`.txt` only if picked explicitly); `..` is canonicalised; drive roots are never approved.
Approved folders persist in `%LOCALAPPDATA%\MDViewer\approved.dirs` so restored tabs and recents keep working.

## Tests

- `cpp/selftest.cpp`: encodings, base64, **allow-list including traversal attempts**, folder listing, URL rules, a live HTTPS fetch. Build with
  `x86_64-w64-mingw32-g++-posix -std=c++17 -static cpp/selftest.cpp -o selftest.exe -lwinhttp` and run on Windows or Wine.
- `tests/ui/`: the whole UI against a stand-in host that implements the same rules.

## Status

Verified: compiles warning-free; `core.h`/`net.h` self-test (42 checks) passes under Wine; the UI passes its test suite in Chromium; the installer installs, upgrades and uninstalls cleanly under Wine;
start-up reaches the WebView2 loader and reports a missing runtime gracefully. **Not verified on a real Windows machine:** the live
WebView2 calls (they need the runtime, which Wine lacks) - in particular drag-and-drop through `AllowExternalDrop`, the navigation guards, `PrintToPdf` settings and fullscreen. Please report issues; press F12 in the app for developer tools.
