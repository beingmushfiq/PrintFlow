@echo off
title PrintFlow Desktop Agent
cls
echo ===============================================================
echo            PrintFlow Windows Desktop Print Agent
echo ===============================================================
echo.

cd /d "%~dp0"

if "%1"=="" (
    python run_agent.py
) else (
    python run_agent.py --pair %1
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Agent exited with error code %ERRORLEVEL%.
    pause
)
