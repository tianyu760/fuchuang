const SECTION_ORDER = ['parties', 'claims', 'facts', 'laws', 'evidence', 'signature'];

const SECTION_PATTERNS = [
  { key: 'parties', title: '当事人信息', re: /^(?:一[、，.]|（一）)?\s*(?:当事人信息|当事人基本信息|原告被告信息|主体信息)\s*[:：]?$/ },
  { key: 'claims', title: '诉讼请求', re: /^(?:二[、，.]|（二）)?\s*(?:诉讼请求|请求事项|仲裁请求|函告事项|委托事项|合同核心条款)\s*[:：]?$/ },
  { key: 'facts', title: '事实与理由', re: /^(?:三[、，.]|（三）)?\s*(?:事实与理由|事实经过|案件事实|理由说明)\s*[:：]?$/ },
  { key: 'laws', title: '法律依据', re: /^(?:四[、，.]|（四）)?\s*(?:法律依据|法律分析|法条依据)\s*[:：]?$/ },
  { key: 'evidence', title: '证据目录', re: /^(?:五[、，.]|（五）)?\s*(?:证据目录|证据清单|附件)\s*[:：]?$/ },
  { key: 'signature', title: '落款', re: /^(?:六[、，.]|（六）)?\s*(?:落款|结尾|此致|签章|具状人)\s*[:：]?$/ }
];

function cleanLine(line) {
  return String(line || '')
    .replace(/^\s*#{1,6}\s*/g, '')
    .replace(/^\s*[-*+]\s+/g, '')
    .replace(/^\s*\d+[.)、]\s+/g, '')
    .replace(/^\s*>\s*/g, '')
    .replace(/\*\*|__|`{1,3}/g, '')
    .replace(/\s+$/g, '')
    .trim();
}

function normalizeBodyText(raw) {
  let text = String(raw || '');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text
    .replace(/^\s*(当然可以|以下是|根据您的要求|下面为您|好的，)/gim, '')
    .replace(/(作为AI|温馨提示|仅供娱乐)[^\n]*/gim, '')
    .replace(/```[\s\S]*?```/g, function (m) {
      return m.replace(/```(?:json|markdown)?/gi, '').replace(/```/g, '');
    });

  const lines = text.split('\n').map(cleanLine);
  text = lines.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function detectSection(line) {
  const t = String(line || '').trim();
  for (let i = 0; i < SECTION_PATTERNS.length; i++) {
    if (SECTION_PATTERNS[i].re.test(t)) return SECTION_PATTERNS[i];
  }
  return null;
}

function splitSections(body) {
  const result = {
    title: '',
    parties: '',
    claims: '',
    facts: '',
    laws: '',
    evidence: '',
    signature: ''
  };
  const lines = normalizeBodyText(body).split('\n');
  let current = 'facts';

  lines.forEach(function (line, idx) {
    if (idx === 0 && line && line.length < 26 && /状|函|书|合同/.test(line)) {
      result.title = line.replace(/^《|》$/g, '').trim();
      return;
    }
    const matched = detectSection(line);
    if (matched) {
      current = matched.key;
      return;
    }
    if (!line) {
      if (result[current]) result[current] += '\n';
      return;
    }
    result[current] += (result[current] ? '\n' : '') + line;
  });

  return result;
}

function toLegalParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map(function (p) { return p.trim(); })
    .filter(Boolean)
    .map(function (p) {
      return p.replace(/\n+/g, ' ');
    });
}

function formatLegalDocumentPayload(payload) {
  const d = payload && typeof payload === 'object' ? payload : {};
  const body = normalizeBodyText(d.body_markdown || d.document_content || '');
  const sections = splitSections(body);
  const merged = {
    title: d.title || sections.title || '法律文书',
    parties: d.parties || sections.parties || '',
    claims: d.claims || sections.claims || '',
    facts: d.facts || sections.facts || '',
    laws: d.laws || sections.laws || '',
    evidence: d.evidence || sections.evidence || '',
    signature_block: d.signature || sections.signature || ''
  };

  // Ensure numbered legal-doc structure
  const rebuilt = [];
  if (merged.parties) rebuilt.push('一、当事人信息\n' + merged.parties);
  if (merged.claims) rebuilt.push('二、诉讼请求\n' + merged.claims);
  if (merged.facts) rebuilt.push('三、事实与理由\n' + merged.facts);
  if (merged.laws) rebuilt.push('四、法律依据\n' + merged.laws);
  if (merged.evidence) rebuilt.push('五、证据目录\n' + merged.evidence);
  if (merged.signature_block) rebuilt.push('六、落款\n' + merged.signature_block);

  return {
    title: merged.title,
    body_markdown: rebuilt.join('\n\n').trim() || body,
    sections: {
      parties: toLegalParagraphs(merged.parties),
      claims: toLegalParagraphs(merged.claims),
      facts: toLegalParagraphs(merged.facts),
      laws: toLegalParagraphs(merged.laws),
      evidence: toLegalParagraphs(merged.evidence),
      signature: toLegalParagraphs(merged.signature_block)
    },
    section_order: SECTION_ORDER.slice()
  };
}

module.exports = {
  normalizeBodyText,
  splitSections,
  formatLegalDocumentPayload
};
