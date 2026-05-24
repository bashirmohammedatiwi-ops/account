Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
portalDir = fso.GetParentFolderName(appDir)
edariDir = fso.BuildPath(fso.GetParentFolderName(portalDir), "edari-reader")
electron = edariDir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
    electron = portalDir & "\node_modules\electron\dist\electron.exe"
End If
If Not fso.FileExists(electron) Then
    MsgBox "Electron غير مثبت. شغّل npm install من edari-reader أو delegate-app", vbCritical, "Edari Delegate"
    WScript.Quit 1
End If
shell.CurrentDirectory = appDir
shell.Run """" & electron & """ """ & appDir & """", 1, False
