Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
electron = appDir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electron) Then
    MsgBox "Electron غير مثبت. شغّل: npm install", vbCritical, "Edari Desktop"
    WScript.Quit 1
End If
shell.CurrentDirectory = appDir
shell.Run """" & electron & """ """ & appDir & """", 1, False
