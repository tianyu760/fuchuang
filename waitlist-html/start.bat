@echo off
:: 设置控制台编码为 UTF-8，避免中文乱码
chcp 65001 >nul
title 法绎法律AI平台 · 启动控制台

:: 切换到脚本所在目录（即项目根目录）
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║      法绎法律AI平台 · 一键启动            ║
echo  ║      前端 :8080   后端 :8081              ║
echo  ║      联系服务 :3001                       ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ─────────────────────────────────────────────
:: [1/3] 启动后端 Spring Boot
:: ─────────────────────────────────────────────
echo [1/3] 检查后端 jar 包...

if exist "fayi-backend\target\fayi-backend-1.0.0.jar" (
    echo       √ 找到已编译的 jar，直接启动后端...
    :: 在新窗口中运行后端，窗口关闭后服务停止
    start "法绎-后端  http://localhost:8081" java -jar fayi-backend\target\fayi-backend-1.0.0.jar
) else (
    echo       ! 未找到 jar 包，开始编译（首次约需 1-2 分钟）...
    echo       正在执行 mvn clean package -DskipTests ...
    :: 进入后端目录执行 Maven 编译
    cd fayi-backend
    call C:\apache-maven\apache-maven-3.9.6\bin\mvn.cmd clean package -DskipTests
    if errorlevel 1 (
        echo.
        echo  [错误] 后端编译失败！请检查 Maven 配置或查看上方错误信息。
        pause
        exit /b 1
    )
    cd ..
    echo       √ 编译成功，启动后端...
    start "法绎-后端  http://localhost:8081" java -jar fayi-backend\target\fayi-backend-1.0.0.jar
)

echo.

:: ─────────────────────────────────────────────
:: [2/3] 启动前端静态服务器（npm run serve）
:: ─────────────────────────────────────────────
echo [2/3] 启动前端静态服务器 (端口 8080)...
:: 使用 package.json 中定义的 serve 脚本，自动打开浏览器
:: 等价于：npx http-server . -p 8080 -c-1 --cors -o /chat.html
start "法绎-前端  http://localhost:8080" cmd /k "npm run serve"
echo       √ 前端服务器已在新窗口启动

echo.

:: ─────────────────────────────────────────────
:: [3/3] 启动 Tailwind CSS 监听（开发时自动编译 CSS）
:: ─────────────────────────────────────────────
echo [3/4] 启动 Tailwind CSS 监听（修改样式时自动编译）...
start "法绎-CSS Watch" cmd /k "npm run dev"
echo       √ Tailwind 监听已在新窗口启动

echo.

:: ─────────────────────────────────────────────
:: [4/4] 启动联系表单邮件服务（端口 3001）
:: ─────────────────────────────────────────────
echo [4/4] 启动联系表单邮件服务 (端口 3001)...
if exist "server\node_modules\nodemailer" (
    start "法绎-联系服务  http://localhost:3001" cmd /k "cd server && node contact-server.js"
    echo       √ 联系服务已在新窗口启动
) else (
    echo       ! 依赖未安装，正在执行 npm install...
    cd server
    call npm install
    cd ..
    start "法绎-联系服务  http://localhost:3001" cmd /k "cd server && node contact-server.js"
    echo       √ 联系服务已安装并启动
)

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  所有服务已启动！                         ║
echo  ║                                          ║
echo  ║  前端页面: http://localhost:8080          ║
echo  ║  聊天页面: http://localhost:8080/chat.html║
echo  ║  后端 API: http://localhost:8081          ║
echo  ║  联系邮件: http://localhost:3001          ║
echo  ║  H2 控制台:http://localhost:8081/h2-console║
echo  ║                                          ║
echo  ║  ⚠ 首次使用联系功能请先配置:              ║
echo  ║    server\.env → 填入QQ邮箱授权码         ║
echo  ║                                          ║
echo  ║  提示：关闭此窗口不影响各服务运行           ║
echo  ║  停止服务：关闭对应标题的 CMD 窗口          ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
