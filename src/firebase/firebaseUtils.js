// src/firebase/firebaseUtils.js - DB 로깅, 캐시 시스템, 유틸리티

import globalCacheService from "../services/globalCacheService";

// =================================================================
// DB 로깅 시스템
// =================================================================
const dbStats = {
  reads: 0,
  writes: 0,
  deletes: 0,
  subscriptions: 0,
  cacheHits: 0,
  cacheMisses: 0,
  startTime: Date.now(),
  operations: []
};

const DB_LOG_ENABLED = true;
const MAX_OPERATIONS_LOG = 100;

export const logDbOperation = (type, collection, docId = null, details = {}) => {
  if (!DB_LOG_ENABLED) return;

  const operation = {
    type,
    collection,
    docId,
    timestamp: new Date().toISOString(),
    tab: details.tab || 'unknown',
    ...details
  };

  if (type === 'READ' || type === 'SUBSCRIBE') {
    dbStats.reads++;
    if (type === 'SUBSCRIBE') dbStats.subscriptions++;
  } else if (type === 'WRITE' || type === 'UPDATE') {
    dbStats.writes++;
  } else if (type === 'DELETE') {
    dbStats.deletes++;
  } else if (type === 'CACHE_HIT') {
    dbStats.cacheHits++;
  } else if (type === 'CACHE_MISS') {
    dbStats.cacheMisses++;
  }

  dbStats.operations.push(operation);
  if (dbStats.operations.length > MAX_OPERATIONS_LOG) {
    dbStats.operations.shift();
  }

  const colors = {
    READ: 'color: #4CAF50; font-weight: bold',
    WRITE: 'color: #FF9800; font-weight: bold',
    UPDATE: 'color: #2196F3; font-weight: bold',
    DELETE: 'color: #F44336; font-weight: bold',
    SUBSCRIBE: 'color: #9C27B0; font-weight: bold',
    CACHE_HIT: 'color: #00BCD4',
    CACHE_MISS: 'color: #795548'
  };

  const emoji = {
    READ: '\u{1F4D6}',
    WRITE: '\u{270F}\u{FE0F}',
    UPDATE: '\u{1F504}',
    DELETE: '\u{1F5D1}\u{FE0F}',
    SUBSCRIBE: '\u{1F442}',
    CACHE_HIT: '\u{1F4BE}',
    CACHE_MISS: '\u{274C}'
  };

  console.log(
    `%c[DB ${type}] ${emoji[type]} ${collection}${docId ? '/' + docId : ''} | Tab: ${details.tab || 'unknown'}`,
    colors[type] || '',
    details.extra || ''
  );
};

export const getDbStats = () => {
  const elapsed = (Date.now() - dbStats.startTime) / 1000;
  const stats = {
    ...dbStats,
    elapsedSeconds: elapsed,
    readsPerMinute: (dbStats.reads / elapsed * 60).toFixed(2),
    writesPerMinute: (dbStats.writes / elapsed * 60).toFixed(2),
    cacheHitRate: dbStats.cacheHits + dbStats.cacheMisses > 0
      ? ((dbStats.cacheHits / (dbStats.cacheHits + dbStats.cacheMisses)) * 100).toFixed(1) + '%'
      : 'N/A'
  };
  console.table({
    '\uCD1D \uC77D\uAE30': dbStats.reads,
    '\uCD1D \uC4F0\uAE30': dbStats.writes,
    '\uCD1D \uC0AD\uC81C': dbStats.deletes,
    '\uAD6C\uB3C5 \uC218': dbStats.subscriptions,
    '\uCE90\uC2DC \uD788\uD2B8': dbStats.cacheHits,
    '\uCE90\uC2DC \uBBF8\uC2A4': dbStats.cacheMisses,
    '\uCE90\uC2DC \uC801\uC911\uB960': stats.cacheHitRate,
    '\uBD84\uB2F9 \uC77D\uAE30': stats.readsPerMinute,
    '\uBD84\uB2F9 \uC4F0\uAE30': stats.writesPerMinute,
    '\uACBD\uACFC \uC2DC\uAC04(\uCD08)': elapsed.toFixed(0)
  });
  return stats;
};

export const printRecentOperations = (count = 20) => {
  const recent = dbStats.operations.slice(-count);
  console.log(`\n\u{1F4CA} \uCD5C\uADFC ${count}\uAC1C DB \uC791\uC5C5:`);
  console.table(recent.map(op => ({
    '\uC2DC\uAC04': op.timestamp.split('T')[1].split('.')[0],
    '\uD0C0\uC785': op.type,
    '\uCEEC\uB809\uC158': op.collection,
    '\uBB38\uC11CID': op.docId || '-',
    '\uD0ED': op.tab
  })));
};

export const getTabStats = () => {
  const tabStats = {};
  dbStats.operations.forEach(op => {
    const tab = op.tab || 'unknown';
    if (!tabStats[tab]) {
      tabStats[tab] = { reads: 0, writes: 0, deletes: 0, subscribes: 0 };
    }
    if (op.type === 'READ') tabStats[tab].reads++;
    else if (op.type === 'WRITE' || op.type === 'UPDATE') tabStats[tab].writes++;
    else if (op.type === 'DELETE') tabStats[tab].deletes++;
    else if (op.type === 'SUBSCRIBE') tabStats[tab].subscribes++;
  });
  console.log('\n\u{1F4CA} \uD0ED\uBCC4 DB \uC0AC\uC6A9 \uD1B5\uACC4:');
  console.table(tabStats);
  return tabStats;
};

export const resetDbStats = () => {
  dbStats.reads = 0;
  dbStats.writes = 0;
  dbStats.deletes = 0;
  dbStats.subscriptions = 0;
  dbStats.cacheHits = 0;
  dbStats.cacheMisses = 0;
  dbStats.startTime = Date.now();
  dbStats.operations = [];
  console.log('\u{1F4CA} DB \uD1B5\uACC4\uAC00 \uB9AC\uC14B\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
};

// window.dbStats
if (typeof window !== 'undefined') {
  window.dbStats = {
    get: getDbStats,
    recent: printRecentOperations,
    byTab: getTabStats,
    reset: resetDbStats,
    reads: () => {
      console.log(`\n\u{1F4CA} ===== DB \uC77D\uAE30 \uD1B5\uACC4 =====`);
      console.log(`\u{1F4D6} \uCD1D \uC77D\uAE30: ${dbStats.reads}\uD68C`);
      console.log(`\u{1F4BE} \uCE90\uC2DC \uD788\uD2B8: ${dbStats.cacheHits}\uD68C`);
      console.log(`\u{274C} \uCE90\uC2DC \uBBF8\uC2A4: ${dbStats.cacheMisses}\uD68C`);
      const hitRate = dbStats.cacheHits + dbStats.cacheMisses > 0
        ? ((dbStats.cacheHits / (dbStats.cacheHits + dbStats.cacheMisses)) * 100).toFixed(1)
        : 0;
      console.log(`\u{1F4C8} \uCE90\uC2DC \uC801\uC911\uB960: ${hitRate}%`);
      console.log(`\u{23F1}\u{FE0F} \uACBD\uACFC \uC2DC\uAC04: ${((Date.now() - dbStats.startTime) / 1000).toFixed(0)}\uCD08`);
      console.log(`===========================\n`);
      return { reads: dbStats.reads, cacheHits: dbStats.cacheHits, cacheMisses: dbStats.cacheMisses, hitRate: hitRate + '%' };
    }
  };
  console.log('\u{1F4CA} DB \uD1B5\uACC4: window.dbStats.reads() - \uC77D\uAE30 \uD69F\uC218 \uD655\uC778');
}

// =================================================================
// 캐시 시스템
// =================================================================
export const CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간

export const setCache = (key, data) => {
  globalCacheService.set(`fb_${key}`, data, CACHE_TTL);
};

export const getCache = (key, tab = 'unknown') => {
  const cachedData = globalCacheService.get(`fb_${key}`);
  if (!cachedData) {
    logDbOperation('CACHE_MISS', key, null, { tab });
    return null;
  }
  logDbOperation('CACHE_HIT', key, null, { tab });
  return cachedData;
};

export const invalidateCache = (key) => {
  globalCacheService.invalidate(`fb_${key}`);
};

export const invalidateCachePattern = (pattern) => {
  globalCacheService.invalidatePattern(`fb_${pattern}`);
  console.log(`[Cache] PATTERN_INVALIDATED: fb_${pattern}`);
};

export const setBatchCache = (dataMap) => {
  Object.entries(dataMap).forEach(([key, data]) => {
    setCache(key, data);
  });
};

// 캐시 관리 유틸리티
export const clearCache = () => {
  globalCacheService.clearAll();
  console.log('[Cache] \uBAA8\uB4E0 \uCE90\uC2DC\uAC00 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
};

export const getCacheStats = () => {
  const stats = globalCacheService.getStats();
  console.log('[Cache] \uCE90\uC2DC \uD1B5\uACC4:', stats);
  return stats;
};

export { globalCacheService };
