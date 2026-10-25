; NSIS installer for MD Viewer. Normally run via ./build.sh (needs dist/ to exist).
Unicode true
!define NAME "MD Viewer"
!define VERSION "1.4.1"
!define PUBLISHER "Soumyakanta Bera"
!define PROGID "MDViewer.Markdown"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MDViewer"

Name "${NAME}"
OutFile "dist\MD-Viewer-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\MD Viewer"
InstallDirRegKey HKCU "Software\MDViewer" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "..\build\icon.ico"
UninstallIcon "..\build\icon.ico"
VIProductVersion "1.4.1.0"
VIAddVersionKey "ProductName" "MD Viewer"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "MD Viewer installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 ${PUBLISHER}"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  ; Upgrade: silently remove an older copy installed under the previous product key, if any
  ReadRegStr $0 HKCU "Software\MDViewerNative" "InstallDir"
  StrCmp $0 "" +4
    IfFileExists "$0\Uninstall.exe" 0 +2
      ExecWait '"$0\Uninstall.exe" /S _?=$0'
    RMDir /r "$0"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MDViewerNative"
  DeleteRegKey HKCU "Software\Classes\MDViewerNative.Markdown"
  DeleteRegKey HKCU "Software\MDViewerNative"
  SetOutPath "$INSTDIR"
  File "dist\mdviewer.exe"
  File "dist\WebView2Loader.dll"
  File "dist\viewer.html"
  File "dist\app.js"
  File "..\LICENSE"
  SetOutPath "$INSTDIR\lib"
  File /r "dist\lib\*.*"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\MD Viewer"
  CreateShortcut "$SMPROGRAMS\MD Viewer\MD Viewer.lnk" "$INSTDIR\mdviewer.exe"
  CreateShortcut "$DESKTOP\MD Viewer.lnk" "$INSTDIR\mdviewer.exe"

  ; .md / .markdown -> MD Viewer (per-user; Windows may still ask once via "Open with > Always")
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "Markdown Document"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\mdviewer.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\mdviewer.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.md" "" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\.markdown" "" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "${PROGID}" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "${PROGID}" ""

  WriteRegStr HKCU "Software\MDViewer" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${NAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\mdviewer.exe"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\MD Viewer.lnk"
  RMDir /r "$SMPROGRAMS\MD Viewer"
  DeleteRegKey HKCU "Software\Classes\${PROGID}"
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "${PROGID}"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "${PROGID}"
  ReadRegStr $0 HKCU "Software\Classes\.md" ""
  StrCmp $0 "${PROGID}" 0 +2
    DeleteRegValue HKCU "Software\Classes\.md" ""
  ReadRegStr $0 HKCU "Software\Classes\.markdown" ""
  StrCmp $0 "${PROGID}" 0 +2
    DeleteRegValue HKCU "Software\Classes\.markdown" ""
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\MDViewer"
  RMDir /r "$INSTDIR"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
