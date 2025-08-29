Set objShell = CreateObject("WScript.Shell")

' URL приложения
appURL = "https://shifts-api.fly.dev"

' Пытаемся найти Chrome
chromePathx86 = """C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"""
chromePath = """C:\Program Files\Google\Chrome\Application\chrome.exe"""

' Проверяем наличие Chrome
Set fso = CreateObject("Scripting.FileSystemObject")

If fso.FileExists("C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") Then
    objShell.Run chromePathx86 & " " & appURL
ElseIf fso.FileExists("C:\Program Files\Google\Chrome\Application\chrome.exe") Then
    objShell.Run chromePath & " " & appURL
Else
    ' Используем Edge если Chrome не найден
    objShell.Run "msedge " & appURL
End If

Set objShell = Nothing
Set fso = Nothing