# Changelog

## 1.4.1
- Theme buttons in the Aa menu are laid out as an even 2x2 grid (the four buttons were cramped and uneven)

## 1.4.0
**Security**
- HTML in documents is sanitised; Mermaid runs in strict mode; strict Content-Security-Policy (page has no network access)
- Web security re-enabled; remote documents are fetched by the host (WinHTTP)
- Host-side allow-list: the page can only read/write Markdown files you chose; links to other folders are refused
- Navigation lock: external links open in the default browser instead of replacing the viewer
**Fixes**
- Anchor links (`#section`) work (GitHub-style heading ids)
- Large documents open about 4x faster (lazy highlighting, math and diagrams); the diagram library loads only when needed
- Dropped files now get real paths (live reload and Recent work); UTF-16 and ANSI files are read correctly
**New**
- Open folder with file tree and search across files; reopen tabs on start; recent files on the welcome screen
- Edit mode with live preview and save; clickable task-list tick boxes saved to the file
- Presentation mode; front matter card; footnotes; emoji shortcodes
- Mermaid zoom/pan and save as SVG/PNG; image viewer
- Tab pinning, drag-reorder, right-click menu
- Custom CSS; high-contrast theme; ARIA labels and keyboard focus
- PDF paper size and margins; Word (.docx) export; update check

## 1.3.0
- The C++ / WebView2 application is now the only build (~1 MB exe, ~1.6 MB installer)
- Product renamed to plain "MD Viewer" everywhere; the installer cleans up an older copy installed under the previous name
- Removed the Electron build

## 1.2.1
- Toolbar button (and `Alt+Z`) to wrap code lines in every snippet at once; applies instantly and is remembered

## 1.2.0
- New C++ / WebView2 build (`cpp/`): ~1 MB exe, ~1.6 MB installer, same UI
- Code blocks: line numbers, per-block and global line wrapping, richer multi-colour syntax highlighting in all themes
- Auto-detects the language of unlabeled snippets (shown as "sql · auto")
- 18 extra languages (PowerShell, Dockerfile, Nginx, Makefile, LaTeX, Haskell, Scala, Dart, Elixir, ...)
- Printing and PDF export wrap long code lines so nothing is cut off

## 1.1.2
- Relative images/videos resolve against the document (local folder or remote URL), including raw HTML tags
- Links to other local `.md` files open in a new tab
- Outline text for headings containing math is clean
- `\( \)` and `\[ \]` LaTeX delimiters

## 1.1.0
- Tabs, live reload, HTML/PDF export, KaTeX math, syntax highlighting
- Sepia theme, focus mode, Windows font picker, recent local files

## 1.0.0
- Initial release: Markdown rendering, Mermaid, URL loading, themes, installer
