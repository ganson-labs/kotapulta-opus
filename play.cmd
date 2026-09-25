@echo off
rem Kotapulta launcher: opens the game in its own Chrome/Edge app window (no server needed).
setlocal
cd /d "%~dp0"
if not exist "dist\game.js" call :build || goto :fail
set "URL=file:///%~dp0index.html"
set "URL=%URL:\=/%"
set "B=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%B%" set "B=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%B%" set "B=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%B%" set "B=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%B%" set "B=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if defined KOTAPULTA_DRY echo "%B%" --app="%URL%" & goto :eof
if exist "%B%" (start "" "%B%" --app="%URL%" --start-maximized) else (start "" "%~dp0index.html")
goto :eof

:build
echo First run: building the game...
call npm install --no-audit --no-fund || exit /b 1
call npm run build || exit /b 1
exit /b 0

:fail
echo Build failed: Node.js is required (https://nodejs.org).
pause
