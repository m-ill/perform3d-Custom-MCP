@echo off
setlocal enabledelayedexpansion
title Perform3D MCP Server

:: Get current directory (portable)
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

cls
echo ========================================
echo    Perform3D MCP Server - Quick Run
echo ========================================
echo.

:: Check if already built
if exist "%SCRIPT_DIR%dist\index.js" if exist "%SCRIPT_DIR%worker\Perform3D.Worker.exe" (
    echo Build artifacts found. Starting server...
    goto start_server
)

:: Need to build first
echo First time setup detected. Building components...
echo.

:: Run deployment build
call "%SCRIPT_DIR%deploy.bat"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Please check the errors above.
    pause
    exit /b 1
)

:start_server
cls
echo ========================================
echo    Perform3D MCP Server
echo ========================================
echo.
echo Server Configuration:
echo   Port: 37925 (unique port to avoid conflicts)
echo   Mode: Production
echo.
echo API Endpoints:
echo   REST: http://localhost:37925/api
echo   MCP:  http://localhost:37925/mcp
echo   Logs: http://localhost:37925/api/logs/recent
echo.
echo Test the server:
echo   curl http://localhost:37925/api/logs/recent
echo.
echo ========================================
echo Starting server... (Press Ctrl+C to stop)
echo ========================================
echo.

:: Start the server
npm start

:: If server exits
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo Server stopped with error code %errorlevel%
    echo.
    echo Common issues:
    echo   - Port 37925 already in use
    echo   - Worker not found (run deploy.bat)
    echo   - Missing dependencies (run npm install)
    echo ========================================
    pause
)