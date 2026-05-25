"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_CONFIG = void 0;
exports.getLLMConfig = getLLMConfig;
require("dotenv/config");
function readModel() {
    const m = (process.env.DASHSCOPE_MODEL || 'qwen-plus').trim();
    if (m === 'qwen-max' || m === 'qwen-turbo' || m === 'qwen-plus')
        return m;
    return 'qwen-plus';
}
/** 统一 LLM 配置 — API Key 仅从环境变量读取，禁止在业务代码硬编码 */
function getLLMConfig() {
    const apiKey = process.env.DASHSCOPE_API_KEY || '';
    if (!apiKey) {
        throw new Error('DASHSCOPE_API_KEY 未配置，请在 server/.env 中设置');
    }
    return {
        baseURL: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey,
        model: readModel(),
        timeoutMs: Number(process.env.DASHSCOPE_TIMEOUT_MS || 120000),
        maxRetries: Number(process.env.DASHSCOPE_MAX_RETRIES || 2),
    };
}
/** 静态默认（供文档/类型引用；运行时请用 getLLMConfig()） */
exports.LLM_CONFIG = {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
};
//# sourceMappingURL=llm.js.map