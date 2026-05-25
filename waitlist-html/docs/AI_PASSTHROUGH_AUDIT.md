# AI 系统重构审计报告

> 目标：去 Markdown 化 + 去本地 Prompt 化 + 自然聊天风格化  
> 原则：**腾讯元器工作流 = 唯一 AI 逻辑来源；本地 = 透传 + 展示**

---

## 第一步：全局 Prompt 扫描结果

| 文件 | 标识/模式 | 状态 | 说明 |
|------|-----------|------|------|
| `server/lib/yuanqi-ai.js` | `MINIMAL_SYSTEM_NOTE` | ✅ 仅文档 | **不注入 API**（元器不支持 system role） |
| `server/lib/yuanqi-ai.js` | `CONSULT_OUTPUT_STYLE` | ✅ 仅文档 | 供元器控制台配置参考 |
| `server/lib/yuanqi-ai.js` | `buildPassthroughUserContent` | ✅ 保留 | 仅合并 `[标签]\n数据`，无业务指令 |
| `server/lib/ai-utils.js` | `callYuanqiJson` | ✅ 透传 | 只传 question/history，JSON 解析为后处理 |
| `server/multimodal-server.js` | `/api/chat` | ✅ 透传 | 附件/OCR/资料库以数据块并入 user 消息 |
| `server/multimodal-server.js` | `/api/process-case` | ✅ 已精简 | 已删除 `extractBlock` 结构化解析 |
| `server/multimodal-server.js` | `/api/process-image` | ✅ 透传 | OCR 文本 + 元器 |
| `server/modules/law-education/index.js` | `/ai-assist` | ✅ 透传 | 仅传 `question` |
| `js/services/ai-client.js` | `FayiAI.*` | ✅ 统一入口 | 全站 AI 调用收敛于此 |
| `js/chat.js` | `callOpenAIAPI` | ✅ 无 Prompt | 只组 messages + 文件 |
| `js/ai-legal.js` | `generateWenshi/searchFagui` | ✅ 委托 FayiAI | 无本地 Prompt |
| `js/wenshi-page.js` / `fagui-page.js` | — | ✅ 无 Prompt | 经 FayiAiLegal → FayiAI |
| `fayi-backend/.../ChatService.java` | `callAi(..., "")` | ✅ 空 system | Spring 端亦透传 |

### 未发现（已清除）

- `systemPrompt` / `promptTemplate` / `markdownPrompt` / `formatPrompt` 业务拼接
- 「你是一名律师…」「请使用 Markdown」「请使用 # 标题」等本地指令
- 本地法律分析 / 风险评估 / 输出模板 Prompt

### 保留的非 Prompt 逻辑（允许）

| 模块 | 用途 |
|------|------|
| `normalizeWenshiData` / `normalizeFaguiData` | JSON 字段兜底（展示用） |
| `safeParseJson` / `cleanAiContent` | 剥离 ```json 代码块（解析用） |
| `js/lib/chat-text-style.js` | **展示层**去 Markdown，不改 API 原文 |
| `parseUserInstruction` / `selectKbItems` | 资料库检索，非 AI Prompt |
| `PLACEHOLDER` `[图片]`/`[文件]` | 防止空消息被过滤 |

---

## 第二步：架构（透传 + 展示）

```
页面 (chat / wenshi / fagui / pufa / OCR)
    ↓  FayiAI.*  （js/services/ai-client.js）
    ↓  HTTP 3002
server/lib/yuanqi-ai.js  →  chatPassthrough / taskPassthrough / callTencentAgent
    ↓
腾讯元器 API（assistant_id + user_id + messages）
```

**前端传递：** 用户输入、历史对话、conversationId/sessionId、上传文件内容  
**禁止：** 本地拼接业务 Prompt、服务端改写 AI 正文

---

## 第三步：去 Markdown 化（仅展示层）

| 层级 | 文件 | 行为 |
|------|------|------|
| 元器控制台 | 工作流 Prompt | 配置 `CONSULT_OUTPUT_STYLE` |
| 前端渲染 | `FayiChatStyle.formatChatHtml` | `# 标题` → `【标题】`，列表/分隔线降级 |
| 聊天页 | `chat.js` → `smartFormatContent` | 调用 FayiChatStyle |
| 文书/法规 | `ai-legal.js` → `md2html` | 同上 |

API 返回的 `content` / `raw` **保持元器原文**；仅在插入 DOM 时格式化。

---

## 第四步：最小系统控制

元器 API 不支持 `system` role。本地仅保留文档常量：

```
你是法绎AI助手。
请直接基于腾讯元器工作流进行回答。
```

请在**腾讯元器控制台**配置完整系统提示与输出规范。

---

## 第五步：修改文件清单（本次）

- `js/services/ai-client.js` — 统一 AI 入口 + `formatForDisplay`
- `server/multimodal-server.js` — 纯透传 chat/case/image，删除 extractBlock
- `server/lib/yuanqi-ai.js` — 更新 MINIMAL_SYSTEM_NOTE
- `js/chat.js` — FayiAI.processCase、简化案件卡片
- `docs/AI_PASSTHROUGH_AUDIT.md` — 本报告

---

## 第六步：运维

1. **重启 3002**：`npm run server:3002`
2. **元器控制台**：同步配置对话风格（禁止 Markdown 标题）
3. **验证**：发送含 `# 标题` 的回复 → 页面应显示 `【标题】` 自然段落，网络响应仍为原文或元器输出
