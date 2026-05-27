export type LegalSearchLaw = {
  lawName: string;
  article: string;
  content: string;
  interpretation: string;
  scenario: string;
};

export type LegalSearchStructured = {
  title: string;
  keyword: string;
  laws: LegalSearchLaw[];
  analysis: string;
  practicalAdvice: string;
  riskNotice: string;
  followups: string[];
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

export function normalizeLegalSearch(raw: any, keyword: string): LegalSearchStructured {
  const laws = Array.isArray(raw?.laws) ? raw.laws : [];
  return {
    title: stripMarkdown(raw?.title || '法规检索结果'),
    keyword: stripMarkdown(keyword || raw?.keyword || ''),
    laws: laws.map((x: any) => ({
      lawName: stripMarkdown(x?.law_name || x?.lawName || '相关法律'),
      article: stripMarkdown(x?.article || '相关条文'),
      content: stripMarkdown(x?.content || ''),
      interpretation: stripMarkdown(x?.interpretation || ''),
      scenario: stripMarkdown(x?.scenario || '')
    })),
    analysis: stripMarkdown(raw?.analysis || ''),
    practicalAdvice: stripMarkdown(raw?.practical_advice || raw?.practicalAdvice || ''),
    riskNotice: stripMarkdown(raw?.risk_notice || raw?.riskNotice || '法规检索结果仅供参考。'),
    followups: Array.isArray(raw?.followups) ? raw.followups.map(stripMarkdown).filter(Boolean) : []
  };
}
