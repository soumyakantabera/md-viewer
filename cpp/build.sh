#!/usr/bin/env bash
# Cross-compile MD Viewer with MinGW-w64 (Linux/WSL/MSYS2). Produces cpp/dist/ (exe, installer, portable zip).
# Needs: x86_64-w64-mingw32-g++ (apt: g++-mingw-w64-x86-64-posix), Node (for `npm ci` to vendor src/lib),
#        makensis (optional, for the installer), zip (optional, for the portable zip).
set -euo pipefail
cd "$(dirname "$0")"
CXX=${CXX:-x86_64-w64-mingw32-g++-posix}; RC=${WINDRES:-x86_64-w64-mingw32-windres}
[ -d ../src/lib ] || (cd .. && npm ci)
mkdir -p dist/lib
$RC -O coff mdviewer.rc -o dist/mdviewer.res.o
$CXX -std=c++17 -O2 -Wall -municode -mwindows -static -static-libgcc -static-libstdc++ \
  main.cpp dist/mdviewer.res.o -o dist/mdviewer.exe -lole32 -luuid -lcomdlg32 -lshell32 -luser32 -lwinhttp
cp ../src/viewer.html ../src/app.js dist/
cp -r ../src/lib/. dist/lib/
cp third_party/WebView2Loader.dll dist/
rm -f dist/mdviewer.res.o
echo "Built cpp/dist/mdviewer.exe"
if command -v makensis >/dev/null; then makensis -V1 installer.nsi && echo "Built cpp/dist/MD-Viewer-Setup.exe"; fi
if command -v zip >/dev/null; then (cd dist && rm -f MD-Viewer-portable.zip && mkdir -p MD-Viewer && cp -r mdviewer.exe WebView2Loader.dll viewer.html app.js lib ../../LICENSE MD-Viewer/ \
  && zip -qr MD-Viewer-portable.zip MD-Viewer && rm -rf MD-Viewer && echo "Built cpp/dist/MD-Viewer-portable.zip"); fi
