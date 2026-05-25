import { type DocumentType } from '../../prompts/legalPrompts';
/** 最小 SSE 响应接口，避免依赖 @types/express */
export interface StreamResponse {
    setHeader(name: string, value: string): void;
    flushHeaders?(): void;
    write(chunk: string): void;
    end(): void;
}
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface WenshiResult {
    doc_type: string;
    title: string;
    summary: string;
    risk_level: string;
    legal_basis: string[];
    risk_notes: string[];
    body_markdown: string;
    signature: string;
    followups: string[];
    /** 兼容旧前端 */
    document_content: string;
    suggestions: string[];
    markdown: string;
}
export interface FaguiLawItem {
    law_name: string;
    article: string;
    content: string;
    relevance?: string;
}
export interface FaguiResult {
    keyword: string;
    keywords: string[];
    matched_laws: FaguiLawItem[];
    legal_interpretation: string;
    judicial_reasoning: string;
    risk_analysis: string;
    similar_cases: Array<{
        title: string;
        summary: string;
        reference: string;
    }>;
    suggestions: string[];
    relationship_graph: {
        nodes: Array<{
            id: string;
            label: string;
            type?: string;
        }>;
        edges: Array<{
            from: string;
            to: string;
            label: string;
        }>;
    };
    followups: string[];
    /** 兼容旧字段 */
    analysis: string;
    risk_warning: string;
}
export declare function createChatCompletion(messages: ChatMessage[], options?: {
    model?: string;
    temperature?: number;
    jsonMode?: boolean;
    maxTokens?: number;
}): Promise<string>;
export declare function normalizeWenshiResult(raw: Record<string, unknown>, question: string): WenshiResult;
export declare function normalizeFaguiResult(raw: Record<string, unknown>, query: string): FaguiResult;
export declare function generateLegalDocument(question: string, options?: {
    docType?: DocumentType;
    history?: Array<{
        role: string;
        content: string;
    }>;
}): Promise<WenshiResult>;
export declare function legalSearchAnalyze(query: string, options?: {
    history?: Array<{
        role: string;
        content: string;
    }>;
}): Promise<FaguiResult>;
/** SSE 流式输出 Markdown 片段 */
export declare function streamGenerate(messages: ChatMessage[], res: StreamResponse, options?: {
    model?: string;
    statusMessages?: string[];
}): Promise<string>;
export declare function streamLegalDocument(question: string, res: StreamResponse, options?: {
    docType?: DocumentType;
    history?: Array<{
        role: string;
        content: string;
    }>;
}): Promise<WenshiResult>;
export declare function streamLegalSearch(query: string, res: StreamResponse, options?: {
    history?: Array<{
        role: string;
        content: string;
    }>;
}): Promise<FaguiResult>;
export declare function isQwenConfigured(): boolean;
//# sourceMappingURL=qwenService.d.ts.map