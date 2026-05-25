const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'law-education');
const FILES = {
  categories: path.join(DATA_DIR, 'law_categories.json'),
  articles: path.join(DATA_DIR, 'law_articles.json'),
  cases: path.join(DATA_DIR, 'law_cases.json'),
  stats: path.join(DATA_DIR, 'law_stats.json')
};

function readJson(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { /* */ }
  return fallback;
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function getCategories() {
  return readJson(FILES.categories, []).sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
}
function listArticles(opts) {
  opts = opts || {};
  var list = readJson(FILES.articles, []);
  if (opts.categoryId) list = list.filter(function (a) { return a.categoryId === opts.categoryId; });
  if (opts.search) {
    var q = String(opts.search).toLowerCase();
    list = list.filter(function (a) { return (a.title + a.summary).toLowerCase().indexOf(q) >= 0; });
  }
  return list;
}
function getArticle(id) { return listArticles().find(function (a) { return a.id === id; }) || null; }
function saveArticle(data, id) {
  var list = readJson(FILES.articles, []);
  if (id) {
    var idx = list.findIndex(function (a) { return a.id === id; });
    if (idx < 0) return null;
    list[idx] = Object.assign({}, list[idx], data, { id: id, updatedAt: new Date().toISOString() });
    writeJson(FILES.articles, list);
    return list[idx];
  }
  var item = Object.assign({ id: 'art_' + Date.now(), reads: 0, likes: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, data);
  list.unshift(item);
  writeJson(FILES.articles, list);
  return item;
}
function deleteArticle(id) {
  var list = readJson(FILES.articles, []);
  var next = list.filter(function (a) { return a.id !== id; });
  if (next.length === list.length) return false;
  writeJson(FILES.articles, next);
  return true;
}
function listCases() { return readJson(FILES.cases, []); }
function bumpRead(id) {
  var list = readJson(FILES.articles, []);
  var a = list.find(function (x) { return x.id === id; });
  if (a) { a.reads = (a.reads || 0) + 1; writeJson(FILES.articles, list); }
  var st = readJson(FILES.stats, { dailyReads: {} });
  var day = new Date().toISOString().slice(0, 10);
  st.dailyReads[day] = (st.dailyReads[day] || 0) + 1;
  writeJson(FILES.stats, st);
}
function bumpLike(id) {
  var list = readJson(FILES.articles, []);
  var a = list.find(function (x) { return x.id === id; });
  if (!a) return false;
  a.likes = (a.likes || 0) + 1;
  writeJson(FILES.articles, list);
  return true;
}
function getPublicityStats() {
  var articles = readJson(FILES.articles, []);
  var st = readJson(FILES.stats, { dailyReads: {} });
  var today = new Date().toISOString().slice(0, 10);
  var byCat = {};
  articles.forEach(function (a) { byCat[a.categoryId] = (byCat[a.categoryId] || 0) + (a.reads || 0); });
  var hotTopics = Object.keys(byCat).sort(function (x, y) { return byCat[y] - byCat[x]; }).slice(0, 5)
    .map(function (id) {
      var c = getCategories().find(function (cat) { return cat.id === id; });
      return c ? c.name : id;
    });
  return {
    todayReads: st.dailyReads[today] || 0,
    totalReads: articles.reduce(function (s, a) { return s + (a.reads || 0); }, 0),
    articleCount: articles.length,
    hotTopics: hotTopics,
    topArticles: articles.slice().sort(function (a, b) { return (b.reads || 0) - (a.reads || 0); }).slice(0, 5)
      .map(function (a) { return { id: a.id, title: a.title, reads: a.reads }; })
  };
}

module.exports = {
  getCategories, listArticles, getArticle, saveArticle, deleteArticle,
  listCases, bumpRead, bumpLike, getPublicityStats
};
