// Response helpers for consistent messaging
(function(global) {
  function createResponseTools(getConfig, labels) {
    const { FALLBACK_TASK, MISSING_TASK } = labels;

    function buildResponse({
      shouldWarn = false,
      reason = 'No reason provided',
      source = 'unknown',
      currentTaskOverride,
      extras = {}
    } = {}) {
      const config = getConfig ? getConfig() : {};
      return {
        shouldWarn,
        reason,
        source,
        currentTask: currentTaskOverride ?? config.currentTask ?? FALLBACK_TASK,
        cached: false,
        ...extras
      };
    }

    const responseFactory = {
      disabled: () => buildResponse({
        reason: 'Focus Guardian is turned off',
        source: 'disabled',
        extras: { extensionEnabled: false }
      }),
      invalidUrl: () => buildResponse({
        reason: 'Invalid URL provided',
        source: 'invalid-url'
      }),
      productivityAllow: () => buildResponse({
        reason: 'Common productivity site - allowed',
        source: 'whitelist'
      }),
      noApiKey: () => buildResponse({
        reason: 'API key not configured - cannot analyze',
        source: 'no-api-key'
      }),
      noTask: () => buildResponse({
        reason: 'No focus goal set - cannot analyze',
        source: 'no-task',
        currentTaskOverride: MISSING_TASK
      }),
      noHtml: () => buildResponse({
        reason: 'Could not get page content',
        source: 'no-html'
      }),
      strictBlock: () => buildResponse({
        shouldWarn: true,
        reason: 'Site is in your strict block list',
        source: 'blocklist',
        extras: { isBlocked: true }
      }),
      aiError: (error) => buildResponse({
        reason: 'AI analysis failed - allowing access',
        source: 'ai-error',
        extras: { error }
      })
    };

    return { buildResponse, responseFactory };
  }

  global.FG_RESPONSES = {
    createResponseTools
  };
})(self);
