@echo off
setlocal enabledelayedexpansion
title Perform3D MCP Server

:: Get current directory (portable)
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo ========================================
echo    Perform3D MCP Server Launcher
echo ========================================
echo.
echo Working Directory: %CD%
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "%SCRIPT_DIR%node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

:: Check if TypeScript build exists
if not exist "%SCRIPT_DIR%dist" (
    echo [INFO] Building TypeScript...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to build TypeScript
        pause
        exit /b 1
    )
)

:: Check if worker executable exists
if not exist "%SCRIPT_DIR%worker\Perform3D.Worker.exe" (
    echo [WARNING] Worker executable not found at:
    echo   %SCRIPT_DIR%worker\Perform3D.Worker.exe
    echo.
    echo Please build the C# worker first:
    echo   npm run worker:build
    echo.
    echo Or manually:
    echo   dotnet publish worker/Perform3D.Worker.csproj -c Release -r win-x86 --self-contained false -o worker
    echo.
    pause
)

:: Create work directories if they don't exist (use relative paths)
if not exist "%SCRIPT_DIR%work" mkdir "%SCRIPT_DIR%work"
if not exist "%SCRIPT_DIR%templates" mkdir "%SCRIPT_DIR%templates"
if not exist "%SCRIPT_DIR%exports" mkdir "%SCRIPT_DIR%exports"
if not exist "%SCRIPT_DIR%logs" mkdir "%SCRIPT_DIR%logs"

:: Check for local config, create if not exists
if not exist "%SCRIPT_DIR%config\local.json" (
    echo [INFO] Creating local configuration...
    if not exist "%SCRIPT_DIR%config" mkdir "%SCRIPT_DIR%config"

    :: Create portable local config with relative paths
    (
        echo {
        echo   "paths": {
        echo     "templates": "./templates",
        echo     "work": "./work",
        echo     "exports": "./exports",
        echo     "logs": "./logs"
        echo   },
        echo   "worker": {
        echo     "executable": "./worker/Perform3D.Worker.exe"
        echo   }
        echo }
    ) > "%SCRIPT_DIR%config\local.json"
)

:: Display configuration
echo [INFO] Starting Perform3D MCP Server
echo.
echo Configuration:
echo   - Host: 127.0.0.1
echo   - Port: 37925
echo   - Work Dir: %SCRIPT_DIR%work
echo   - Templates: %SCRIPT_DIR%templates
echo   - Config: %SCRIPT_DIR%config
echo.
echo API Endpoints:
echo   - REST API: http://localhost:37925/api
echo   - MCP: http://localhost:37925/mcp
echo   - Logs: http://localhost:37925/api/logs/recent
echo.
echo Press Ctrl+C to stop the server
echo ----------------------------------------

:: Start the server
npm start

:: If server exits, pause to see any error messages
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server exited with error code %errorlevel%
    pause
)