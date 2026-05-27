export type LegalSections = {
  parties: string[];
  claims: string[];
  facts: string[];
  laws: string[];
  evidence: string[];
  signature: string[];
};

const SECTION_MARKERS: Array<{ key: keyof LegalSections; re: RegExp }> = [
  { key: 'parties', re: /^(?:一[、，.]|（一）)?\s*(?:当事人信息|当事人基本信息|主体信息)\s*[:：]?$/ },
  { key: 'claims', re: /^(?:二[、，.]|（二）)?\s*(?:诉讼请求|请求事项|仲裁请求|函告事项|合同核心条款)\s*[:：]?$/ },
  { key: 'facts', re: /^(?:三[、，.]|（三）)?\s*(?:事实与理由|案件事实|事实经过)\s*[:：]?$/ },
  { key: 'laws', re: /^(?:四[、，.]|（四）)?\s*(?:法律依据|法律分析|法条依据)\s*[:：]?$/ },
  { key: 'evidence', re: /^(?:五[、，.]|（五）)?\s*(?:证据目录|证据清单|附件)\s*[:：]?$/ },
  { key: 'signature', re: /^(?:六[、，.]|（六）)?\s*(?:落款|此致|签章|具状人)\s*[:：]?$/ }
];

export function normalizeLegalBodyText(raw: string): string {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:当然可以|以下是|根据您的要求)[^\n]*$/gim, '')
    .replace(/\*\*|__|`{1,3}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseLegalSections(raw: string): LegalSections {
  const text = normalizeLegalBodyText(raw);
  const lines = text.split('\n');
  const buf: Record<keyof LegalSections, string> = {
    parties: '',
    claims: '',
    facts: '',
    laws: '',
    evidence: '',
    signature: ''
  };
  let current: keyof LegalSections = 'facts';

  lines.forEach((line) => {
    const t = line.trim();
    if (!t) {
      if (buf[current]) buf[current] += '\n';
      return;
    }
    const marker = SECTION_MARKERS.find((m) => m.re.test(t));
    if (marker) {
      current = marker.key;
      return;
    }
    buf[current] += (buf[current] ? '\n' : '') + t;
  });

  const toArray = (s: string) =>
    s.split(/\n{2,}/).map((x) => x.trim().replace(/\n+/g, ' ')).filter(Boolean);

  return {
    parties: toArray(buf.parties),
    claims: toArray(buf.claims),
    facts: toArray(buf.facts),
    laws: toArray(buf.laws),
    evidence: toArray(buf.evidence),
    signature: toArray(buf.signature)
  };
}
