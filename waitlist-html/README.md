# 法绎 · 智慧法律咨询服务平台（前端）

基于 Cruip「Waitlist HTML」模板改造的静态站点，面向**需要法律咨询的个人与小微主体**：提供首页介绍、注册登录、模型法律咨询对话、个人中心与知识库管理（数据暂存于浏览器本地，便于原型与演示）。

## 页面一览

| 文件 | 说明 |
|------|------|
| `index.html` | 首页：服务说明与入口 |
| `register.html` / `login.html` | 注册与登录（本地存储账号，非生产级安全） |
| `chat.html` | 法律咨询对话（需登录） |
| `knowledge.html` | 知识库：标题与正文备忘（需登录） |
| `profile.html` | 个人中心：账号信息与退出（需登录） |
| `faq.html` | 常见问题 |
| `contact.html` | 联系我们 |
| `updates.html` | 服务动态 |

## 脚本

- `js/auth.js`：会话、`localStorage` 账号表、顶栏「登录 / 注册 / 退出」
- `js/chat.js`：对话列表与示例回复
- `js/knowledge.js`：知识库增删列表
- `js/main.js`：深色模式切换

## 本地开发

1. 安装 Node.js 与 npm。  
2. 在项目根目录执行 `npm install`。  
3. `npm run dev`：监听并编译 Tailwind 到 `style.css`。  
4. `npm run build`：一次性编译样式。

用浏览器打开 `index.html` 即可（若未编译过样式，请先执行 `npm run build`）。

## 许可

模板版权归 Cruip 及原作者；法绎业务文案与交互由本项目维护。使用模板时请遵守原许可条款。
