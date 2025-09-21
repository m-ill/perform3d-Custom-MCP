@echo off
setlocal enabledelayedexpansion

:: Default port
set PORT=37925
if not "%1"=="" set PORT=%1

echo Checking port %PORT%...
echo.

:: Check if port is in use
netstat -an | findstr ":%PORT% " >nul 2>&1
if %errorlevel%==0 (
    echo [WARNING] Port %PORT% is already in use!
    echo.
    echo Processes using this port:
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% "') do (
        set PID=%%a
        for /f "tokens=1,2" %%b in ('tasklist /FI "PID eq !PID!" /FO TABLE /NH 2^>nul') do (
            if not "%%b"=="INFO:" echo   PID !PID!: %%b
        )
    )
    echo.
    echo Options:
    echo   1. Stop the existing process
    echo   2. Use a different port
    echo   3. Exit
    echo.
    set /p choice=Choose option (1-3):

    if "!choice!"=="1" (
        echo.
        set /p pid_to_kill=Enter PID to terminate:
        taskkill /PID !pid_to_kill! /F
        if !errorlevel!==0 (
            echo Process terminated successfully
        ) else (
            echo Failed to terminate process (may require admin rights)
        )
    )
) else (
    echo [OK] Port %PORT% is available
)

echo.
pause