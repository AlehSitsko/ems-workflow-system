; Custom NSIS hooks for the EMS Workflow System installer.
; electron-builder auto-includes build/installer.nsh and invokes these macros.

; On a real uninstall (not an in-place update), ask whether to also wipe ALL local
; application data — the database, uploaded documents, backups, logs and the app
; cache under %APPDATA%\ems-workflow-desktop. Default (silent / unattended) is to
; KEEP the data, so an automated uninstall never destroys it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION \
      "Do you also want to permanently delete ALL EMS Workflow System data on this computer?$\r$\n$\r$\nThis removes your local database (patients, employees, calls, HR records…), uploaded documents, backups, logs, and the app cache. This cannot be undone.$\r$\n$\r$\nChoose No to keep your data for a future reinstall." \
      /SD IDNO IDNO ems_keep_data
      RMDir /r "$APPDATA\ems-workflow-desktop"
    ems_keep_data:
  ${endIf}
!macroend
