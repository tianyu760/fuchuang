/**
 * 法规库管理中心 · 列表 / 详情 / 筛选 / 批量初始化
 */
const store = require('./admin-store');
const catalog = require('./regulation-catalog');

const MIN_CATALOG_SIZE = catalog.TARGET_COUNT || 100;

const CATEGORY_ALIASES = {
  '民事': '民法',
  '劳动': '劳动法',
  '刑事': '刑法',
  '行政': '行政法',
  '商事': '商法',
  '其他': '其他'
};

const VALID_CATEGORIES = ['民法', '刑法', '行政法', '商法', '劳动法', '其他'];

function normalizeCategory(raw) {
  const c = String(raw || '').trim();
  if (VALID_CATEGORIES.indexOf(c) >= 0) return c;
  return CATEGORY_ALIASES[c] || '其他';
}

function normalizeStatus(raw) {
  const s = String(raw || '现行').trim();
  if (s === '废止' || s === '修订中' || s === '现行') return s;
  if (s === '修订' || s === 'amending') return '修订中';
  if (s === 'active' || s === 'valid') return '现行';
  if (s === 'repealed') return '废止';
  return '现行';
}

function slugId(title) {
  const crypto = require('crypto');
  return 'law_' + crypto.createHash('md5').update(String(title || '')).digest('hex').slice(0, 10);
}

function normalizeIncoming(item) {
  const legalText = String(item.legalText || item.content || '').trim();
  const title = String(item.title || '').trim();
  const id = item.id || slugId(title);
  return {
    id: id,
    title: title,
    category: normalizeCategory(item.category),
    region: item.region || '全国',
    publishDate: item.publishDate || '',
    status: normalizeStatus(item.status),
    summary: item.summary || (legalText ? legalText.replace(/\s+/g, ' ').slice(0, 160) : ''),
    content: legalText,
    legalText: legalText,
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    issuer: item.issuer || '',
    scope: item.scope || item.region || '全国',
    revisions: item.revisions || [],
    source: item.source || 'batch_init',
    updatedAt: new Date().toISOString()
  };
}

function dedupeByTitle(list) {
  const byTitle = {};
  list.forEach(function (r) {
    const key = String(r.title || '').trim();
    if (!key) return;
    const prev = byTitle[key];
    if (!prev) {
      byTitle[key] = r;
      return;
    }
    const keepCur = String(r.content || r.legalText || '').length >
      String(prev.content || prev.legalText || '').length;
    if (keepCur) byTitle[key] = r;
  });
  return Object.keys(byTitle).map(function (k) { return byTitle[k]; });
}

function batchInit(items, opts) {
  opts = opts || {};
  let list = store.readJson(store.FILES.regulations, []);
  const byId = {};
  const byTitle = {};
  list.forEach(function (r) {
    byId[r.id] = r;
    byTitle[String(r.title || '').trim()] = r;
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  (items || []).forEach(function (item) {
    const rec = normalizeIncoming(item);
    if (!rec.title) {
      skipped++;
      return;
    }
    const existing = byId[rec.id] || byTitle[rec.title];
    if (existing) {
      if (opts.overwrite) {
        Object.assign(existing, rec);
        updated++;
      } else {
        const curLen = String(existing.content || existing.legalText || '').length;
        const newLen = String(rec.content || '').length;
        if (newLen > curLen) {
          Object.assign(existing, rec, { updatedAt: rec.updatedAt });
          updated++;
        } else {
          skipped++;
        }
      }
    } else {
      list.push(rec);
      byId[rec.id] = rec;
      byTitle[rec.title] = rec;
      added++;
    }
  });

  list = dedupeByTitle(list);
  store.writeJson(store.FILES.regulations, list);
  return { total: list.length, added: added, updated: updated, skipped: skipped, seeded: added > 0 };
}

function seedRegulations() {
  const list = store.readJson(store.FILES.regulations, []);
  if (list.length >= MIN_CATALOG_SIZE) {
    return { total: list.length, seeded: false, message: 'catalog_sufficient' };
  }
  return batchInit(catalog.buildCatalog(), { overwrite: false });
}

function ensureCatalog() {
  seedRegulations();

  const file = store.FILES.regulations;
  let list = store.readJson(file, []);

  list.forEach(function (r, i) {
    if (!r.publishDate && r.updatedAt) {
      list[i].publishDate = String(r.updatedAt).slice(0, 10);
    }
    if (!r.region) list[i].region = '全国';
    if (!r.category) list[i].category = '其他';
    list[i].category = normalizeCategory(list[i].category);
    list[i].status = normalizeStatus(list[i].status);
    const text = r.legalText || r.content || '';
    if (!r.legalText) list[i].legalText = text;
    if (!r.content) list[i].content = text;
    if (!r.summary && text) {
      list[i].summary = String(text).replace(/\s+/g, ' ').slice(0, 160);
    }
  });

  list = dedupeByTitle(list);
  store.writeJson(file, list);
  return list;
}

function parseToc(text) {
  const items = [];
  const lines = String(text || '').split('\n');
  lines.forEach(function (line, idx) {
    const ch = line.match(/^(第[零一二三四五六七八九十百千\d]+章\s*.+)$/);
    if (ch) {
      items.push({ id: 'ch_' + idx, type: 'chapter', label: ch[1].trim(), line: idx });
    }
    const art = line.match(/^(第[零一二三四五六七八九十百千\d]+条)/);
    if (art && !ch) {
      items.push({ id: 'art_' + idx, type: 'article', label: art[1], line: idx });
    }
  });
  return items.slice(0, 200);
}

function parseArticles(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const parts = raw.split(/(?=第[零一二三四五六七八九十百千\d]+条)/).filter(Boolean);
  return parts.map(function (p, i) {
    const trimmed = p.trim();
    const m = trimmed.match(/^第([零一二三四五六七八九十百千\d]+)条[　\s]*/);
    const num = m ? '第' + m[1] + '条' : '';
    const body = m ? trimmed.slice(m[0].length).trim() : trimmed;
    return {
      id: 'article_' + i,
      number: num,
      content: body || trimmed
    };
  });
}

function rowFromRecord(rec) {
  const category = normalizeCategory(rec.category);
  const legalText = rec.legalText || rec.content || '';
  const summary = rec.summary || String(legalText).replace(/\s+/g, ' ').slice(0, 160);
  return {
    id: rec.id,
    title: rec.title || '未命名法规',
    category: category,
    region: rec.region || '全国',
    publishDate: rec.publishDate || (rec.updatedAt ? String(rec.updatedAt).slice(0, 10) : ''),
    status: normalizeStatus(rec.status),
    summary: summary,
    keywords: rec.keywords || [],
    source: rec.source || 'catalog',
    updatedAt: rec.updatedAt || rec.publishDate
  };
}

function statistics() {
  const list = ensureCatalog();
  const byCategory = {};
  const byStatus = {};
  list.forEach(function (r) {
    const c = normalizeCategory(r.category);
    byCategory[c] = (byCategory[c] || 0) + 1;
    const s = normalizeStatus(r.status);
    byStatus[s] = (byStatus[s] || 0) + 1;
  });
  return {
    total: list.length,
    totalRegulations: list.length,
    byCategory: byCategory,
    byStatus: byStatus,
    targetCount: MIN_CATALOG_SIZE,
    distribution: catalog.DISTRIBUTION
  };
}

function list(opts) {
  opts = opts || {};
  let rows = ensureCatalog().map(rowFromRecord);

  const category = opts.category && opts.category !== 'all' ? opts.category : '';
  if (category) {
    rows = rows.filter(function (r) { return r.category === category; });
  }

  const region = opts.region && opts.region !== 'all' ? opts.region : '';
  if (region) {
    if (region === 'local') {
      rows = rows.filter(function (r) { return r.region !== '全国'; });
    } else {
      rows = rows.filter(function (r) { return r.region === region; });
    }
  }

  const keyword = (opts.keyword || opts.search || '').trim().toLowerCase();
  if (keyword) {
    rows = rows.filter(function (r) {
      return (r.title && r.title.toLowerCase().indexOf(keyword) >= 0) ||
        (r.summary && r.summary.toLowerCase().indexOf(keyword) >= 0) ||
        (r.category && r.category.toLowerCase().indexOf(keyword) >= 0) ||
        (r.keywords && r.keywords.some(function (k) {
          return String(k).toLowerCase().indexOf(keyword) >= 0;
        }));
    });
  }

  rows.sort(function (a, b) {
    return String(b.publishDate || '').localeCompare(String(a.publishDate || ''));
  });

  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const rawSize = parseInt(opts.pageSize, 10) || 20;
  const pageSize = rawSize === 10 ? 10 : 20;
  const total = rows.length;
  const start = (page - 1) * pageSize;

  const regions = {};
  ensureCatalog().forEach(function (r) {
    const reg = r.region || '全国';
    regions[reg] = 1;
  });

  const stats = statistics();

  return {
    list: rows.slice(start, start + pageSize),
    total: total,
    totalRegulations: stats.totalRegulations,
    page: page,
    pageSize: pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    regions: Object.keys(regions).sort(),
    statistics: {
      byCategory: stats.byCategory,
      byStatus: stats.byStatus
    }
  };
}

function getDetail(id) {
  const rec = ensureCatalog().find(function (r) { return r.id === id; });
  if (!rec) return null;

  const summary = rowFromRecord(rec);
  const legalText = rec.legalText || rec.content || '';
  const articles = parseArticles(legalText);
  const toc = parseToc(legalText);

  return Object.assign({}, summary, {
    legalText: legalText,
    articles: articles,
    toc: toc,
    issuer: rec.issuer || '—',
    scope: rec.scope || rec.region || '全国',
    revisions: (rec.revisions || []).length ? rec.revisions : [
      { date: summary.publishDate, summary: '首次发布/收录' }
    ],
    keywords: rec.keywords || []
  });
}

function listRegions() {
  const set = {};
  ensureCatalog().forEach(function (r) {
    set[r.region || '全国'] = 1;
  });
  return Object.keys(set).sort();
}

module.exports = {
  list: list,
  getDetail: getDetail,
  listRegions: listRegions,
  ensureCatalog: ensureCatalog,
  seedRegulations: seedRegulations,
  batchInit: batchInit,
  statistics: statistics,
  MIN_CATALOG_SIZE: MIN_CATALOG_SIZE
};
