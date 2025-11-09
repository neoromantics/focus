// Helper factories shared by the background worker
(function(global) {
  function createStatsManager(storage, statKeys, getStats) {
    return {
      initFrom(data = {}) {
        const stats = getStats();
        statKeys.forEach((key) => {
          stats[key] = data[key] || 0;
        });
      },
      async increment(key) {
        if (!statKeys.includes(key)) return;
        const stats = getStats();
        stats[key] = (stats[key] || 0) + 1;
        await storage.set({ [key]: stats[key] });
      },
      async persistAll() {
        await storage.set({ ...getStats() });
      }
    };
  }

  function createCacheManager(storage, cacheConfig, getCache, setCache) {
    const {
      TTL_MS,
      MAX_ENTRIES,
      TRIMMED_SIZE
    } = cacheConfig;

    function persist(cache) {
      setCache(cache);
      storage.set({ urlCache: cache });
    }

    function getCacheSnapshot() {
      return { ...(getCache() || {}) };
    }

    return {
      loadFrom(cache = {}) {
        setCache(cache || {});
      },
      get(url) {
        const cache = getCache() || {};
        const cached = cache[url];
        if (!cached) return null;
        const cacheAge = Date.now() - (cached.timestamp || 0);
        if (cacheAge < TTL_MS) {
          return cached;
        }
        const updated = getCacheSnapshot();
        delete updated[url];
        persist(updated);
        return null;
      },
      set(url, decision) {
        const cache = getCacheSnapshot();
        cache[url] = {
          ...decision,
          timestamp: Date.now()
        };
        persist(cache);
      },
      clear() {
        setCache({});
        storage.set({ urlCache: {} });
      },
      cleanup() {
        const cache = getCacheSnapshot();
        const cacheKeys = Object.keys(cache);
        if (cacheKeys.length === 0) {
          return;
        }

        const now = Date.now();
        let cacheChanged = false;

        cacheKeys.forEach((url) => {
          const age = now - (cache[url].timestamp || 0);
          if (age > TTL_MS) {
            delete cache[url];
            cacheChanged = true;
          }
        });

        const remainingKeys = Object.keys(cache);
        if (remainingKeys.length > MAX_ENTRIES) {
          const entries = Object.entries(cache)
            .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
            .slice(0, TRIMMED_SIZE);
          const trimmed = Object.fromEntries(entries);
          persist(trimmed);
          console.log('Cache cleaned. New size:', Object.keys(trimmed).length);
          return;
        }

        if (cacheChanged) {
          persist(cache);
          console.log('Cache cleaned. New size:', Object.keys(cache).length);
        }
      }
    };
  }

  function sanitizeDomainList(list = []) {
    return Array.from(new Set(
      (list || [])
        .map((item) => (item || '').toLowerCase().trim())
        .filter(Boolean)
    ));
  }

  function normalizeUrlForAllowList(url = '') {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      let pathname = parsed.pathname.replace(/\/+$/, '');
      if (!pathname) pathname = '/';
      const params = new URLSearchParams(parsed.search);
      const queryKeys = ['q', 'query', 'search', 'keywords'];

      for (const key of queryKeys) {
        if (params.has(key)) {
          const value = (params.get(key) || '').trim().toLowerCase();
          if (value) {
            return `${host}|${pathname}|${key}|${value}`;
          }
        }
      }

      return `${host}|${pathname}`;
    } catch {
      return null;
    }
  }

  function loadAllowedUrlSignatures(rawList = [], normalizer = normalizeUrlForAllowList) {
    const signatures = [];
    rawList.forEach((entry) => {
      if (!entry) return;
      if (entry.includes('|')) {
        signatures.push(entry);
      } else {
        const migrated = normalizer(entry);
        if (migrated) {
          signatures.push(migrated);
        }
      }
    });
    return Array.from(new Set(signatures));
  }

  function getHostname(url = '') {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  global.FG_HELPERS = {
    createStatsManager,
    createCacheManager,
    sanitizeDomainList,
    normalizeUrlForAllowList,
    loadAllowedUrlSignatures,
    getHostname
  };
})(self);
