@echo off
title Create CleanRide Owner Account
echo ========================================================
echo Creating Owner Account (adminCleanRide)...
echo ========================================================

if exist "%~dp0venv\bin\python.exe" (
    "%~dp0venv\bin\python.exe" "%~dp0create_owner.py"
) else if exist "%~dp0venv\Scripts\python.exe" (
    "%~dp0venv\Scripts\python.exe" "%~dp0create_owner.py"
) else (
    python "%~dp0create_owner.py"
)

pause
