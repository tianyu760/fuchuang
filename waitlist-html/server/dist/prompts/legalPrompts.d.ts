/** 文书类型 */
export type DocumentType = '起诉状' | '答辩状' | '合同' | '律师函' | '仲裁申请书' | '授权委托书' | '其他文书';
export declare const DOCUMENT_TYPES: DocumentType[];
export declare const LEGAL_DOCUMENT_SYSTEM_PROMPT: string;
export declare const LEGAL_SEARCH_SYSTEM_PROMPT: string;
export declare const RISK_ANALYSIS_SYSTEM_PROMPT: string;
export declare const LEGAL_ADVISOR_SYSTEM_PROMPT: string;
export declare function buildDocumentUserPrompt(question: string, docType: DocumentType, history?: Array<{
    role: string;
    content: string;
}>): string;
export declare function buildLegalSearchUserPrompt(query: string, history?: Array<{
    role: string;
    content: string;
}>): string;
export declare function detectDocumentType(question: string): DocumentType;
//# sourceMappingURL=legalPrompts.d.ts.map