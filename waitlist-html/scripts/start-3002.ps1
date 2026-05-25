# 法绎 · 启动 3002 多模态后端（数字大屏数据源）
$ErrorActionPreference = "Stop"
$serverDir = Join-Path $PSScriptRoot "..\server"
Set-Location $serverDir
Write-Host ""
Write-Host "  启动 http://localhost:3002 （数字大屏 / AI / 管理端 API）" -ForegroundColor Cyan
Write-Host "  大屏接口: /api/admin/datav/realtime 与 /api/admin/datav/stream" -ForegroundColor DarkGray
Write-Host ""
node multimodal-server.js
