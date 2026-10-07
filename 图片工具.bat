@echo off
chcp 65001 >nul
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [!] 未找到 pnpm，请先安装 Node.js 与 pnpm。
  pause
  exit /b 1
)

echo ============================================
echo   博客 · 图片工具
echo   启动后会自动打开浏览器 http://127.0.0.1:4318
echo   （关闭本窗口即可停止服务）
echo ============================================
echo.
pnpm imgtool
pause
