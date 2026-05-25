# 去本地 Prompt 化重构说明

## 一、全局 Prompt 扫描结果

| 位置 | 原内容 | 处理方式 |
|------|--------|----------|
| `server/lib/ai-utils.js` | `SYSTEM_JSON_PROMPT`、`buildWenshiUserPrompt`、`buildFaguiUserPrompt`、`callDeepSeekJson` | **已删除**，改 `callYuanqiJson` 透传 |
| `server/multimodal-server.js` `/api/chat` | 「请结合文件/资料/图片分析」等注入 | **已改为** `[附件]` / `[资料库]` 数据块透传 |
| `server/multimodal-server.js` `/api/process-case` | 「请对上述案件材料进行专业法律分析」 | **已删除**，仅透传用户文本 + 材料 |
| `server/multimodal-server.js` `/api/process-image` | 「请对其进行专业的法律风险分析」 | **已删除**，仅透传 OCR 文本 |
| `server/modules/law-education/index.js` | 普法 JSON 格式 Prompt | **已删除**，透传 `question` |
| `js/chat.js` `callOpenAIAPI` | 本地 `systemPrompt`、多模态 Prompt | **已删除**，走 `FayiAI.chat` 透传 |
| `js/ai-legal.js` | 无 Prompt（仅 API 调用） | 统一走 `FayiAI` |

**保留（非业务 Prompt）：**

- `normalizeWenshiData` / `normalizeFaguiData` — 响应字段兜底
- `safeParseJson` / `cleanAiContent` — JSON 解析
- `process-case` 的 `extractBlock` — 从元器返回文本解析结构化卡片（后处理，非请求 Prompt）
- 空消息占位符 `[图片]` / `[文件]` — 防止空 content 被过滤

## 二、统一 AI 请求层

```
前端 js/services/ai-client.js  (FayiAI)
        ↓ HTTP
后端 server/lib/yuanqi-ai.js   (callTencentAgent / taskPassthrough)
        ↓
腾讯元器 API（assistant_id + user_id + messages）
```

| 方法 | 用途 |
|------|------|
| `FayiAI.chat()` | 法律咨询 |
| `FayiAI.processCase()` | 案件/OCR 分析 |
| `FayiAI.generateWenshi()` | 法律文书 |
| `FayiAI.searchFagui()` | 法规检索 |
| `FayiAI.lawAssist()` | 普法 AI |

## 三、透传规则

1. **不发送** `system` role（元器 API 不支持，工作流在平台配置）
2. 附件格式：`[标签]\n内容`，多段用 `---` 分隔
3. 用户真实输入原样保留，不追加「你必须/请分析」类指令
4. 文书/法规/普法：仅将 `question`/`query` + `history` 透传，JSON 结构由元器工作流定义

## 四、元器平台侧要求

请在腾讯元器控制台确保各场景工作流已配置：

- 法律咨询对话逻辑
- 文书生成 JSON 输出
- 法规检索 JSON 输出
- OCR/案件分析逻辑
- 普法讲解 JSON 输出

本地不再重复定义上述业务 Prompt。

## 五、修改文件列表

- `server/lib/yuanqi-ai.js`（新建）
- `server/lib/ai-utils.js`（精简）
- `server/multimodal-server.js`
- `server/modules/law-education/index.js`
- `js/services/ai-client.js`（新建）
- `js/chat.js`
- `js/ai-legal.js`
- `chat.html` / `wenshi.html` / `fagui.html`

## 六、兼容性

- API 路径未变：`/api/chat`、`/api/wenshi/generate`、`/api/fagui/search` 等
- 前端页面返回结构未变（`normalize*` 仍生效）
- 需 **重启 3002** 后生效

## 七、对话文本风格（去 Markdown）

| 层级 | 文件 | 作用 |
|------|------|------|
| 元器控制台 | 工作流 Prompt | 建议配置 `CONSULT_OUTPUT_STYLE`（见 `yuanqi-ai.js`） |
| 服务端后处理 | `server/lib/chat-text-style.js` | `/api/chat`、`/api/process-case` 返回前 `normalizeConsultText` |
| 前端轻量渲染 | `js/lib/chat-text-style.js` | `# 标题` → `【标题】`，列表/分隔线降级为自然段落 |
| 聊天页 | `js/chat.js` + `chat.html` | `smartFormatContent` 走 `FayiChatStyle.formatChatHtml` |
| 文书/法规 | `js/ai-legal.js` | `md2html` 复用同一套轻量渲染 |

**效果：** AI 回答不再出现大号 Markdown 标题，改为【章节名】或「一、章节名」式小标题 + 自然段落，更接近真实律师咨询语气。
