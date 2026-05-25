# JSON 符号污染 · 修复说明

## 第一步：响应渲染链路扫描

| 位置 | 问题 | 处理 |
|------|------|------|
| `server/lib/yuanqi-ai.js` | 仅取 `choices[0].message.content`，数组/对象未展开 | ✅ `normalizeChatOutput(response.data)` |
| `server/multimodal-server.js` `/api/chat` | 返回 `content: reply` | ✅ 后端已清洗 |
| `js/chat.js` `callOpenAIAPI` | 直接 `data.content` 渲染 | ✅ `normalizeChatOutput` |
| `js/chat.js` `smartFormatContent` | innerHTML 注入 | ✅ 渲染前清洗 |
| `js/services/ai-client.js` | 未规范化 JSON 字段 | ✅ `normalizeReply` |
| `js/ai-legal.js` `md2html` | 文书/法规页 | ✅ 已接入 |

**未发现** marked / markdown-it / SSE 流式解析库；污染来自 **未提取嵌套 JSON 的 content 字段**。

## 第二步：统一响应提取器

- 前端：`js/lib/extract-ai-content.js` → `FayiAIResponse.extractAIContent`
- 服务端：`server/lib/ai-response.js` → `extractAIContent`

兼容路径：`choices[].message/delta.content`、`data.reply`、`[{type,text}]` 多模态块、SSE `data:` 行、整段 JSON 字符串。

## 第三步：统一内容清洗器

- 前端：`js/lib/clean-ai-response.js` → `FayiAIResponse.cleanAIResponse` / `normalizeChatOutput`
- 服务端：`server/lib/ai-response.js`

清理：`{}[]"`、`\n` `\t` 转义、json 代码块、半截 JSON、`"content":` / `"choices":` 残留行。

## 第四步：Markdown 清洗

`normalizeChatOutput` 末尾调用 `filterMarkdown`（`#`、`---`、表格等）。

## 脚本加载顺序（chat.html）

```
extract-ai-content.js → chat-text-style.js → clean-ai-response.js → ai-client.js → chat.js
```

重启 3002 后生效。
