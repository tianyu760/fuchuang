export type LegalLawCard = {
  lawName: string;
  article: string;
  content: string;
  interpretation: string;
  scenario: string;
};

export type LegalSearchResult = {
  title: string;
  keyword: string;
  laws: LegalLawCard[];
  analysis: string;
  practicalAdvice: string;
  riskNotice: string;
};

export function stripMarkdown(text: string): string {
  return String(text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*|__|`{1,3}/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeLegalSearchPayload(data: any): LegalSearchResult {
  const laws = Array.isArray(data?.laws) ? data.laws : [];
  return {
    title: stripMarkdown(data?.title || '法规检索结果'),
    keyword: stripMarkdown(data?.keyword || ''),
    laws: laws.map((law: any) => ({
      lawName: stripMarkdown(law?.lawName || law?.law_name || '相关法律'),
      article: stripMarkdown(law?.article || '相关条文'),
      content: stripMarkdown(law?.content || ''),
      interpretation: stripMarkdown(law?.interpretation || ''),
      scenario: stripMarkdown(law?.scenario || '')
    })),
    analysis: stripMarkdown(data?.analysis || ''),
    practicalAdvice: stripMarkdown(data?.practicalAdvice || data?.practical_advice || ''),
    riskNotice: stripMarkdown(data?.riskNotice || data?.risk_notice || data?.risk_warning || '法规检索结果仅供参考。')
  };
}
