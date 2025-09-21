@echo off
title Perform3D MCP - Quick Start
cls
echo ========================================
echo    Perform3D MCP - Quick Start Guide
echo ========================================
echo.

:: Simple menu
:menu
echo What would you like to do?
echo.
echo   1. Build everything (first time setup)
echo   2. Start server (production mode)
echo   3. Start server (development mode)
echo   4. Run tests
echo   5. Build worker only
echo   6. Exit
echo.
set /p choice=Enter your choice (1-6):

if "%choice%"=="1" goto build_all
if "%choice%"=="2" goto start_prod
if "%choice%"=="3" goto start_dev
if "%choice%"=="4" goto run_tests
if "%choice%"=="5" goto build_worker
if "%choice%"=="6" goto end

echo Invalid choice! Please try again.
pause
cls
goto menu

:build_all
echo.
echo Building all components...
call build-all.bat
goto menu

:start_prod
echo.
echo Starting server in production mode...
call start.bat
goto menu

:start_dev
echo.
echo Starting server in development mode...
call start-dev.bat
goto menu

:run_tests
echo.
echo Which test would you like to run?
echo   1. PowerShell integration test
echo   2. Node.js integration test
echo   3. Back to main menu
set /p test_choice=Enter your choice (1-3):

if "%test_choice%"=="1" (
    echo Running PowerShell tests...
    call npm run test:ps
) else if "%test_choice%"=="2" (
    echo Running Node.js tests...
    call npm test
)
pause
cls
goto menu

:build_worker
echo.
echo Building C# worker...
call npm run worker:build
pause
cls
goto menu

:end
echo.
echo Goodbye!
timeout /t 2 >nul
exit /b 0