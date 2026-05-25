@echo off
chcp 65001 >nul
title 法绎 · 3002 数据服务（数字大屏 / AI / 管理端）
cd /d "%~dp0..\server"
echo.
echo  正在启动 http://localhost:3002
echo  数字大屏数据: GET /api/admin/datav/realtime
echo  按 Ctrl+C 停止服务
echo.
node multimodal-server.js
pause
