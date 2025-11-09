// Shared constants for Focus background logic
(function(global) {
  const STORAGE_KEYS = [
    'geminiApiKey',
    'currentTask',
    'blockList',
    'allowList',
    'allowedUrls',
    'extensionEnabled',
    'urlCache',
    'pagesAnalyzed',
    'warningsShown',
    'timesWentBack',
    'timesContinued',
    'aiAnalysisCount',
    'currentFlight',
    'flightHistory'
  ];

  const STAT_KEYS = [
    'pagesAnalyzed',
    'warningsShown',
    'timesWentBack',
    'timesContinued',
    'aiAnalysisCount'
  ];

  const FG_CONSTANTS = Object.freeze({
    DEFAULT_BLOCK_LIST: [],
    DEFAULT_STATS: Object.freeze({
      pagesAnalyzed: 0,
      warningsShown: 0,
      timesWentBack: 0,
      timesContinued: 0,
      aiAnalysisCount: 0
    }),
    STORAGE_KEYS,
    STAT_KEYS,
    CACHE: Object.freeze({
      TTL_MS: 3600000, // 1 hour
      MAX_ENTRIES: 100,
      TRIMMED_SIZE: 50,
      CLEAN_INTERVAL_MS: 3600000
    }),
    STATS_SAVE_INTERVAL_MS: 300000, // 5 minutes
    FLIGHT: Object.freeze({
      MIN_DURATION_MS: 180000, // 3 minutes
      TURBULENCE_LIMIT: 5,
      HISTORY_LIMIT: 20
    }),
    LABELS: Object.freeze({
      FALLBACK_TASK: 'Stay focused',
      MISSING_TASK: 'Please set a focus goal'
    }),
    PRODUCTIVITY_ALLOWLIST: Object.freeze([
      'docs.google.com',
      'drive.google.com',
      'gmail.com',
      'localhost'
    ])
  });

  global.FG_CONSTANTS = FG_CONSTANTS;
})(self);
