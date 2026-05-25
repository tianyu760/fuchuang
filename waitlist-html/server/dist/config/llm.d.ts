import 'dotenv/config';
export type QwenModel = 'qwen-plus' | 'qwen-max' | 'qwen-turbo';
export interface LLMConfigShape {
    baseURL: string;
    apiKey: string;
    model: QwenModel;
    timeoutMs: number;
    maxRetries: number;
}
/** 统一 LLM 配置 — API Key 仅从环境变量读取，禁止在业务代码硬编码 */
export declare function getLLMConfig(): LLMConfigShape;
/** 静态默认（供文档/类型引用；运行时请用 getLLMConfig()） */
export declare const LLM_CONFIG: {
    baseURL: string;
    model: QwenModel;
};
//# sourceMappingURL=llm.d.ts.map