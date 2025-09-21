@echo off
title Perform3D MCP - Build All Components
echo ========================================
echo    Perform3D MCP - Full Build Script
echo ========================================
echo.

:: Check prerequisites
echo [1/5] Checking prerequisites...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed
    pause
    exit /b 1
)
echo   - Node.js: OK

where dotnet >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] .NET SDK is not installed
    pause
    exit /b 1
)
echo   - .NET SDK: OK

:: Install Node dependencies
echo.
echo [2/5] Installing Node dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Node dependencies
    pause
    exit /b 1
)
echo   - Dependencies installed

:: Build TypeScript
echo.
echo [3/5] Building TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build TypeScript
    pause
    exit /b 1
)
echo   - TypeScript compiled

:: Build C# Worker
echo.
echo [4/5] Building C# Worker...
dotnet publish worker/Perform3D.Worker.csproj -c Release -r win-x86 --self-contained false -o worker
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build C# worker
    pause
    exit /b 1
)
echo   - Worker built successfully

:: Verify build outputs
echo.
echo [5/5] Verifying build outputs...

if not exist "dist\index.js" (
    echo [ERROR] TypeScript build output not found
    pause
    exit /b 1
)

if not exist "worker\Perform3D.Worker.exe" (
    echo [ERROR] Worker executable not found
    pause
    exit /b 1
)

echo   - All components verified

:: Success message
echo.
echo ========================================
echo    BUILD SUCCESSFUL!
echo ========================================
echo.
echo Next steps:
echo   1. Configure settings in config/default.json
echo   2. Run 'start.bat' to launch the server
echo   3. Test with 'npm test' or 'npm run test:ps'
echo.
pause