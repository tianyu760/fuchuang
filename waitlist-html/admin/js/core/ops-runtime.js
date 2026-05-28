/**
 * 管理端运行时：API 缓存 + 请求并发队列
 */
window.OpsRuntime = (function () {
  var DEFAULT_TTL_MS = 6 * 60 * 1000;
  var MAX_CONCURRENT = 4;
  var cache = Object.create(null);
  var inflight = Object.create(null);
  var queue = [];
  var active = 0;

  function stableKey(method, url, body) {
    var b = '';
    if (body != null && typeof body === 'object') {
      try { b = JSON.stringify(body); } catch (e) { b = String(body); }
    } else if (body != null) {
      b = String(body);
    }
    return method + ' ' + url + (b ? ' ' + b : '');
  }

  function getCache(key) {
    var hit = cache[key];
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      delete cache[key];
      return null;
    }
    return hit.value;
  }

  function setCache(key, value, ttlMs) {
    cache[key] = {
      value: value,
      expiresAt: Date.now() + (ttlMs || DEFAULT_TTL_MS)
    };
  }

  function invalidate(prefix) {
    if (!prefix) {
      cache = Object.create(null);
      inflight = Object.create(null);
      return;
    }
    Object.keys(cache).forEach(function (k) {
      if (k.indexOf(prefix) >= 0) delete cache[k];
    });
    Object.keys(inflight).forEach(function (k) {
      if (k.indexOf(prefix) >= 0) delete inflight[k];
    });
  }

  function runQueue() {
    while (active < MAX_CONCURRENT && queue.length) {
      var job = queue.shift();
      active++;
      job.run().then(job.resolve, job.reject).finally(function () {
        active--;
        runQueue();
      });
    }
  }

  function enqueue(run) {
    return new Promise(function (resolve, reject) {
      queue.push({ run: run, resolve: resolve, reject: reject });
      runQueue();
    });
  }

  function cachedRequest(runFn, key, opts) {
    opts = opts || {};
    var ttl = opts.ttlMs != null ? opts.ttlMs : DEFAULT_TTL_MS;
    if (!opts.force) {
      var hit = getCache(key);
      if (hit !== null) return Promise.resolve(hit);
    }
    if (inflight[key]) return inflight[key];

    inflight[key] = enqueue(function () {
      return runFn().then(function (res) {
        if (!opts.skipCache) setCache(key, res, ttl);
        return res;
      });
    }).finally(function () {
      delete inflight[key];
    });

    return inflight[key];
  }

  function runQueued(fn) {
    return enqueue(fn);
  }

  return {
    DEFAULT_TTL_MS: DEFAULT_TTL_MS,
    MAX_CONCURRENT: MAX_CONCURRENT,
    stableKey: stableKey,
    cachedRequest: cachedRequest,
    runQueued: runQueued,
    invalidate: invalidate,
    getCache: getCache,
    setCache: setCache
  };
})();
