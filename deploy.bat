@echo off
setlocal enabledelayedexpansion
title Perform3D MCP - Deployment Builder

:: Get current directory
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo ========================================
echo    Perform3D MCP - Deployment Builder
echo ========================================
echo.
echo This script will:
echo   1. Build all components
echo   2. Create portable configuration
echo   3. Prepare for deployment
echo.
echo Working Directory: %CD%
echo ========================================
echo.

:: Step 1: Check prerequisites
echo [Step 1/6] Checking prerequisites...
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo   Node.js: %NODE_VERSION%

where dotnet >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] .NET SDK is not installed
    echo Please install .NET 8 SDK from https://dotnet.microsoft.com/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('dotnet --version') do set DOTNET_VERSION=%%i
echo   .NET SDK: %DOTNET_VERSION%

:: Step 2: Clean previous builds
echo.
echo [Step 2/6] Cleaning previous builds...
if exist "%SCRIPT_DIR%dist" rmdir /s /q "%SCRIPT_DIR%dist" 2>nul
if exist "%SCRIPT_DIR%worker\*.exe" del /q "%SCRIPT_DIR%worker\*.exe" 2>nul
if exist "%SCRIPT_DIR%worker\*.dll" del /q "%SCRIPT_DIR%worker\*.dll" 2>nul
if exist "%SCRIPT_DIR%worker\*.json" del /q "%SCRIPT_DIR%worker\*.json" 2>nul
echo   Cleaned

:: Step 3: Install/Update dependencies
echo.
echo [Step 3/6] Installing Node dependencies...
call npm install --production=false
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo   Dependencies installed

:: Step 4: Build TypeScript
echo.
echo [Step 4/6] Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build TypeScript
    pause
    exit /b 1
)
echo   TypeScript compiled to dist/

:: Step 5: Build C# Worker
echo.
echo [Step 5/6] Building C# Worker...
echo   Target: win-x86 (32-bit for Perform3D compatibility)
dotnet publish worker/Perform3D.Worker.csproj -c Release -r win-x86 --self-contained false -o worker
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build worker
    echo.
    echo Note: If you see COM reference errors, you can temporarily comment out
    echo the COMReference section in Perform3D.Worker.csproj for building without
    echo Perform3D installed.
    pause
    exit /b 1
)
echo   Worker built successfully

:: Step 6: Create portable configuration
echo.
echo [Step 6/6] Creating portable configuration...

:: Create directories
if not exist "%SCRIPT_DIR%work" mkdir "%SCRIPT_DIR%work"
if not exist "%SCRIPT_DIR%templates" mkdir "%SCRIPT_DIR%templates"
if not exist "%SCRIPT_DIR%exports" mkdir "%SCRIPT_DIR%exports"
if not exist "%SCRIPT_DIR%logs" mkdir "%SCRIPT_DIR%logs"

:: Create portable local.json with relative paths
if not exist "%SCRIPT_DIR%config" mkdir "%SCRIPT_DIR%config"
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
    echo   },
    echo   "server": {
    echo     "port": 37925
    echo   }
    echo }
) > "%SCRIPT_DIR%config\local.json"
echo   Configuration created

:: Verify outputs
echo.
echo ========================================
echo    Verifying build outputs...
echo ========================================
echo.

set BUILD_OK=1

if not exist "%SCRIPT_DIR%dist\index.js" (
    echo [ERROR] TypeScript output not found: dist\index.js
    set BUILD_OK=0
)

if not exist "%SCRIPT_DIR%worker\Perform3D.Worker.exe" (
    echo [ERROR] Worker executable not found: worker\Perform3D.Worker.exe
    set BUILD_OK=0
)

if not exist "%SCRIPT_DIR%config\local.json" (
    echo [ERROR] Configuration not found: config\local.json
    set BUILD_OK=0
)

if %BUILD_OK%==0 (
    echo.
    echo [ERROR] Build verification failed!
    pause
    exit /b 1
)

echo [OK] All components verified
echo.

:: Success message
echo ========================================
echo    DEPLOYMENT BUILD SUCCESSFUL!
echo ========================================
echo.
echo The application is now portable and ready for deployment.
echo.
echo Directory structure:
echo   %SCRIPT_DIR%
echo   ├── dist\           (TypeScript compiled output)
echo   ├── worker\         (C# worker executable)
echo   ├── config\         (Configuration files)
echo   ├── templates\      (Model templates)
echo   ├── work\           (Working directory)
echo   ├── exports\        (Export directory)
echo   └── logs\           (Log files)
echo.
echo To deploy:
echo   1. Copy this entire folder to the target machine
echo   2. Ensure Node.js is installed on target
echo   3. Run 'start.bat' to launch the server
echo.
echo Server will run on port: 37925
echo   REST API: http://localhost:37925/api
echo   MCP: http://localhost:37925/mcp
echo.
pause