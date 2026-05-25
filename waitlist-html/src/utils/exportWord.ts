/**
 * TypeScript 导出接口（与 js/utils/export-legal-doc.js 对应）
 * 浏览器环境请使用 FayiLegalExport.exportLegalDocument
 */
import { SYSTEM_CONFIG } from '../config/system';

export interface LegalDocumentData {
  title?: string;
  doc_type?: string;
  body_markdown?: string;
  document_content?: string;
  signature?: string;
  summary?: string;
  risk_level?: string;
}

export function exportLegalDocument(data: LegalDocumentData, options?: { filename?: string; silent?: boolean }): Promise<string> {
  if (typeof window !== 'undefined' && (window as unknown as { FayiLegalExport?: { exportLegalDocument: typeof exportLegalDocument } }).FayiLegalExport) {
    return (window as unknown as { FayiLegalExport: { exportLegalDocument: (d: LegalDocumentData, o?: object) => Promise<string> } }).FayiLegalExport.exportLegalDocument(data, options);
  }
  throw new Error('exportLegalDocument 仅在浏览器环境中可用');
}

export { SYSTEM_CONFIG };
