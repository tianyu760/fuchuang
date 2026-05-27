"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatCompletion = createChatCompletion;
exports.normalizeWenshiResult = normalizeWenshiResult;
exports.normalizeFaguiResult = normalizeFaguiResult;
exports.generateLegalDocument = generateLegalDocument;
exports.legalSearchAnalyze = legalSearchAnalyze;
exports.streamGenerate = streamGenerate;
exports.streamLegalDocument = streamLegalDocument;
exports.streamLegalSearch = streamLegalSearch;
exports.isQwenConfigured = isQwenConfigured;
const openai_1 = __importDefault(require("openai"));
const llm_1 = require("../../config/llm");
const legalPrompts_1 = require("../../prompts/legalPrompts");
const legal_document_formatter_1 = require("../../../lib/legal-document-formatter");
let _client = null;
function getClient() {
    if (!_client) {
        const cfg = (0, llm_1.getLLMConfig)();
        _client = new openai_1.default({
            apiKey: cfg.apiKey,
            baseURL: cfg.baseURL,
            timeout: cfg.timeoutMs,
            maxRetries: 0,
        });
    }
    return _client;
}
function log(tag, msg, extra) {
    const ts = new Date().toISOString();
    if (extra !== undefined)
        console.log(`[${ts}] [qwen:${tag}] ${msg}`, extra);
    else
        console.log(`[${ts}] [qwen:${tag}] ${msg}`);
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function withRetry(fn, label) {
    const cfg = (0, llm_1.getLLMConfig)();
    let lastErr;
    for (let i = 0; i <= cfg.maxRetries; i++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            log(label, `attempt ${i + 1} failed: ${msg}`);
            if (i < cfg.maxRetries)
                await sleep(800 * (i + 1));
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
function cleanJson(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/^\uFEFF/, '');
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/g, '');
    const m = s.match(/\{[\s\S]*\}/);
    return m ? m[0] : s;
}
function safeParseJson(raw) {
    const cleaned = cleanJson(raw);
    if (!cleaned)
        throw new Error('模型返回内容为空');
    try {
        const data = JSON.parse(cleaned);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('JSON 根节点必须是对象');
        }
        return data;
    }
    catch (e) {
        const err = new Error('AI 返回 JSON 解析失败');
        err.raw_content = raw;
        err.parseError = e instanceof Error ? e.message : String(e);
        throw err;
    }
}
function asStr(v, fallback = '') {
    const s = v == null ? '' : String(v).trim();
    return s || fallback;
}
function asStrArr(v, fallback = []) {
    if (!Array.isArray(v)) {
        if (typeof v === 'string' && v.trim())
            return [v.trim()];
        return fallback;
    }
    const arr = v.map((x) => String(x == null ? '' : x).trim()).filter(Boolean);
    return arr.length ? arr : fallback;
}
async function createChatCompletion(messages, options) {
    const cfg = (0, llm_1.getLLMConfig)();
    const model = options?.model || cfg.model;
    log('chat', `model=${model} messages=${messages.length}`);
    return withRetry(async () => {
        const client = getClient();
        const resp = await client.chat.completions.create({
            model,
            messages: messages,
            temperature: options?.temperature ?? 0.3,
            max_tokens: options?.maxTokens ?? 8192,
            ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        });
        const content = resp.choices[0]?.message?.content || '';
        if (!content.trim())
            throw new Error('模型返回空内容');
        log('chat', `done tokens≈${resp.usage?.total_tokens || '?'}`);
        return content;
    }, 'createChatCompletion');
}
function normalizeWenshiResult(raw, question) {
    const formatted = (0, legal_document_formatter_1.formatLegalDocumentPayload)({
        title: raw.title,
        body_markdown: asStr(raw.body_markdown, asStr(raw.document_content, '')),
        parties: raw.parties,
        claims: raw.claims,
        facts: raw.facts,
        laws: raw.laws,
        evidence: raw.evidence,
        signature: raw.signature
    });
    const body = asStr(formatted.body_markdown, asStr(raw.body_markdown, asStr(raw.document_content, '')));
    const riskNotes = asStrArr(raw.risk_notes);
    const suggestions = asStrArr(raw.suggestions, riskNotes.length ? riskNotes : ['请结合证据材料完善文书细节']);
    const evidence = asStrArr(raw.evidence_list);
    return {
        doc_type: asStr(raw.doc_type, (0, legalPrompts_1.detectDocumentType)(question)),
        title: asStr(formatted.title || raw.title, '法律文书'),
        summary: asStr(raw.summary, question.slice(0, 200)),
        risk_level: asStr(raw.risk_level, '中'),
        legal_basis: asStrArr(raw.legal_basis, ['请结合案由进一步检索法律依据']),
        risk_notes: riskNotes.length ? riskNotes : suggestions.slice(0, 3),
        evidence_list: evidence,
        body_markdown: body || '一、当事人信息\n请补充当事人信息。\n\n二、事实与理由\n暂无正文，请补充案情后重新生成。',
        signature: asStr(raw.signature || (formatted.sections.signature || []).join('\n'), '此致\n\n具状人：________________\n二〇二六年X月X日'),
        document_sections: formatted.sections,
        section_order: formatted.section_order,
        followups: asStrArr(raw.followups),
        document_content: body,
        suggestions,
        markdown: body,
    };
}
function normalizeFaguiResult(raw, query) {
    let laws = [];
    if (Array.isArray(raw.matched_laws)) {
        laws = raw.matched_laws.map((item) => {
            const o = (item && typeof item === 'object' ? item : {});
            return {
                law_name: asStr(o.law_name, '相关法律'),
                article: asStr(o.article, '相关条款'),
                content: asStr(o.content, ''),
                relevance: asStr(o.relevance, 'medium'),
            };
        }).filter((l) => l.law_name || l.content);
    }
    if (!laws.length) {
        laws = [{
                law_name: '检索提示',
                article: '—',
                content: asStr(raw.legal_interpretation, '暂未匹配到具体法条，请补充关键词后重新检索'),
            }];
    }
    const risk = asStr(raw.risk_analysis, asStr(raw.risk_warning, ''));
    const graph = (raw.relationship_graph && typeof raw.relationship_graph === 'object'
        ? raw.relationship_graph
        : { nodes: [], edges: [] });
    return {
        keyword: asStr(raw.keyword, query),
        keywords: asStrArr(raw.keywords, [query].filter(Boolean)),
        matched_laws: laws,
        legal_interpretation: asStr(raw.legal_interpretation, '暂无法律解释'),
        judicial_reasoning: asStr(raw.judicial_reasoning, '暂无裁判思路分析'),
        risk_analysis: risk || '本结果仅供参考，不构成正式法律意见',
        similar_cases: Array.isArray(raw.similar_cases)
            ? raw.similar_cases.map((c) => {
                const o = (c && typeof c === 'object' ? c : {});
                return {
                    title: asStr(o.title, '类案参考'),
                    summary: asStr(o.summary, ''),
                    reference: asStr(o.reference, '司法实践参考'),
                };
            })
            : [],
        suggestions: asStrArr(raw.suggestions, ['建议咨询执业律师']),
        relationship_graph: {
            nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
            edges: Array.isArray(graph.edges) ? graph.edges : [],
        },
        followups: asStrArr(raw.followups),
        analysis: asStr(raw.analysis, asStr(raw.legal_interpretation, '')),
        risk_warning: risk || '本结果仅供参考，不构成正式法律意见',
    };
}
async function generateLegalDocument(question, options) {
    const docType = options?.docType || (0, legalPrompts_1.detectDocumentType)(question);
    const userPrompt = (0, legalPrompts_1.buildDocumentUserPrompt)(question, docType, options?.history);
    log('wenshi', `docType=${docType} q=${question.slice(0, 80)}`);
    const raw = await createChatCompletion([
        { role: 'system', content: legalPrompts_1.LEGAL_DOCUMENT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ], { jsonMode: true, temperature: 0.25 });
    const parsed = safeParseJson(raw);
    return normalizeWenshiResult(parsed, question);
}
async function legalSearchAnalyze(query, options) {
    const userPrompt = (0, legalPrompts_1.buildLegalSearchUserPrompt)(query, options?.history);
    log('fagui', `query=${query.slice(0, 80)}`);
    const raw = await createChatCompletion([
        { role: 'system', content: legalPrompts_1.LEGAL_SEARCH_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ], { jsonMode: true, temperature: 0.25 });
    const parsed = safeParseJson(raw);
    return normalizeFaguiResult(parsed, query);
}
/** SSE 流式输出 Markdown 片段 */
async function streamGenerate(messages, res, options) {
    const cfg = (0, llm_1.getLLMConfig)();
    const model = options?.model || cfg.model;
    let accumulated = '';
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const statusMsgs = options?.statusMessages || [
        'AI 正在分析案情…',
        '正在检索法律依据…',
        '正在生成专业文书…',
        '正在优化排版格式…',
    ];
    statusMsgs.forEach((msg, i) => {
        res.write(`data: ${JSON.stringify({ type: 'status', message: msg, index: i })}\n\n`);
    });
    try {
        const client = getClient();
        const stream = await client.chat.completions.create({
            model,
            messages: messages,
            temperature: 0.3,
            stream: true,
        });
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (!delta)
                continue;
            accumulated += delta;
            res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'done', content: accumulated })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        log('stream', `done len=${accumulated.length}`);
        return accumulated;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log('stream', `error: ${msg}`);
        res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
        res.end();
        throw err;
    }
}
async function streamLegalDocument(question, res, options) {
    const docType = options?.docType || (0, legalPrompts_1.detectDocumentType)(question);
    const userPrompt = (0, legalPrompts_1.buildDocumentUserPrompt)(question, docType, options?.history);
    const raw = await streamGenerate([
        { role: 'system', content: legalPrompts_1.LEGAL_DOCUMENT_SYSTEM_PROMPT + '\n\n最终请输出完整 JSON 对象。' },
        { role: 'user', content: userPrompt },
    ], res, {
        statusMessages: [
            'AI 正在分析案件事实…',
            '正在匹配诉讼策略…',
            '正在起草法律文书…',
            '正在校验法律依据…',
        ],
    });
    const parsed = safeParseJson(raw);
    return normalizeWenshiResult(parsed, question);
}
async function streamLegalSearch(query, res, options) {
    const userPrompt = (0, legalPrompts_1.buildLegalSearchUserPrompt)(query, options?.history);
    const raw = await streamGenerate([
        { role: 'system', content: legalPrompts_1.LEGAL_SEARCH_SYSTEM_PROMPT + '\n\n最终请输出完整 JSON 对象。' },
        { role: 'user', content: userPrompt },
    ], res, {
        statusMessages: [
            'AI 正在解析检索意图…',
            '正在匹配相关法律法规…',
            '正在分析裁判思路…',
            '正在构建法律关系图谱…',
        ],
    });
    const parsed = safeParseJson(raw);
    return normalizeFaguiResult(parsed, query);
}
function isQwenConfigured() {
    try {
        (0, llm_1.getLLMConfig)();
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=qwenService.js.map