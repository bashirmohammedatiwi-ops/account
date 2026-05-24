Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
portalDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & portalDir & "\admin-app\start.vbs""", 1, False
