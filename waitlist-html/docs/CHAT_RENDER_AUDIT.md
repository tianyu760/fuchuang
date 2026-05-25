# 聊天渲染链路审计 · Plain Text Chat Mode

## 第一步：Markdown 渲染链路扫描

### 未发现第三方 Markdown 库

项目中**未使用**以下库：

- marked / markdown-it / react-markdown / showdown / md-editor
- rehype / remark / prism / highlight.js

### 实际 AI 消息渲染链路

| 文件 | 作用 | 模式 |
|------|------|------|
| `js/lib/chat-text-style.js` | **唯一** AI 正文渲染器 | Plain Text Chat Mode |
| `js/chat.js` → `smartFormatContent()` | 调用 `FayiChatStyle.formatChatHtml` | IM 聊天 |
| `js/chat.js` → `renderMessageItem` | `innerHTML` 注入格式化 HTML | IM 聊天 |
| `js/chat.js` → 流式 `streamEl.innerHTML` | 实时 `smartFormatContent` | IM 聊天 |
| `js/chat.js` → `renderCaseCard` | 案件卡片展示 | IM 聊天 |
| `js/ai-legal.js` → `md2html` | 文书/法规页，复用 `formatChatHtml` | IM 聊天 |
| `js/services/ai-client.js` | `formatForDisplay` / `filterMarkdown` | 统一入口 |

### 会自动处理 `#` / `###` 的位置

仅 **`js/lib/chat-text-style.js`** 中的 `filterMarkdown()`：

- `#` ~ `######`（含无空格 `###标题`）→ `【标题】`
- `---` / `***` → 删除
- Markdown 表格 → `· 列：值` 列表行
- `>` 引用 / ` ``` ` 代码块 / `**` 加粗 → 纯文本

---

## 第二步：Plain Text Chat Mode

- 默认开启：`FayiChatStyle.PLAIN_CHAT_MODE = true`
- 输出容器：`.ai-chat-plain`
- 允许：普通文本、换行、简单列表（· / 1.）、轻量小标题
- 禁止：Markdown 标题/表格/引用/代码块样式

---

## 第三步：CSS 兜底（chat.html）

对意外残留的 `h1-h6`、`table`、`pre`、`hr` 强制 IM 样式，防止文档化排版。

---

## 验证示例

输入：

```
### 风险分析
| 项目 | 说明 |
|---|---|
| 合同 | 有效 |
---
正文 **加粗**
```

过滤后：

```
【风险分析】
· 项目：合同；说明：有效
正文 加粗
```

页面渲染为同字号段落 + 小标题，无大标题、无表格错位。
