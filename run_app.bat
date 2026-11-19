@echo off
title CleanRide Backend Server
echo ========================================================
echo Starting CleanRide Flask Server with MySQL...
echo ========================================================

if exist "%~dp0venv\bin\python.exe" (
    "%~dp0venv\bin\python.exe" "%~dp0app.py"
) else if exist "%~dp0venv\Scripts\python.exe" (
    "%~dp0venv\Scripts\python.exe" "%~dp0app.py"
) else (
    python "%~dp0app.py"
)

pause
