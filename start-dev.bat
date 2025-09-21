@echo off
title Perform3D MCP Server (Development)
echo ========================================
echo    Perform3D MCP Server - DEV MODE
echo ========================================
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
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

:: Check if worker exists (warning only in dev mode)
if not exist "worker\Perform3D.Worker.exe" (
    echo [WARNING] Worker executable not found!
    echo.
    echo The server will fail to process commands without the worker.
    echo To build the worker, run in a separate terminal:
    echo   npm run worker:build
    echo.
    echo Press any key to continue anyway (for testing)...
    pause >nul
)

:: Display configuration
echo [INFO] Starting Perform3D MCP Server in DEVELOPMENT mode
echo.
echo Features:
echo   - Auto-reload on file changes
echo   - TypeScript source execution (no build needed)
echo   - Detailed error messages
echo   - Debug logging enabled
echo.
echo Configuration:
echo   - Host: 127.0.0.1
echo   - Port: 8732
echo   - Mode: Development
echo.
echo API Endpoints:
echo   - REST API: http://localhost:8732/api
echo   - MCP: http://localhost:8732/mcp
echo   - Logs: http://localhost:8732/api/logs/recent
echo.
echo Press Ctrl+C to stop the server
echo ----------------------------------------

:: Enable debug logging
set LOG_LEVEL=debug

:: Start the server in development mode
npm run dev

:: If server exits, pause to see any error messages
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server exited with error code %errorlevel%
    pause
)