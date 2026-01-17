@echo off
title File Storage
echo Starting Node.js Server...

:: Starts the server in a separate background window so the script can continue
start /b node server.js

echo Waiting 1 second for server to initialize...
timeout /t 1 /nobreak >nul

echo Opening browser...
start "" http://localhost:3000/

:: This keeps the current window open to show server logs
echo.
echo --- Server Logs ---
node server.js
pause