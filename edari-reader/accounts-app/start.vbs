Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(appDir)
electron = rootDir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
    MsgBox "Electron غير مثبت. شغّل npm install من مجلد edari-reader", vbCritical, "Edari Accounts"
    WScript.Quit 1
End If
shell.CurrentDirectory = appDir
shell.Run """" & electron & """ """ & appDir & """", 1, False
