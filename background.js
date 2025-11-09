// background.js - Background Service Worker with Phase 4 AI Analysis + JSON Mode

importScripts(
  'background/constants.js',
  'background/helpers.js',
  'background/responses.js',
  'background/flight.js'
);

console.log('Focus Background Service Worker Started (Phase 4 - AI Enabled)!');

const { FG_CONSTANTS, FG_HELPERS, FG_RESPONSES } = self;
const {
  DEFAULT_BLOCK_LIST,
  DEFAULT_STATS,
  STORAGE_KEYS,
  STAT_KEYS,
  CACHE,
  STATS_SAVE_INTERVAL_MS,
  LABELS,
  PRODUCTIVITY_ALLOWLIST,
  FLIGHT
} = FG_CONSTANTS;

const {
  createStatsManager,
  createCacheManager,
  sanitizeDomainList,
  normalizeUrlForAllowList,
  loadAllowedUrlSignatures,
  getHostname
} = FG_HELPERS;

const { buildResponse, responseFactory } = FG_RESPONSES.createResponseTools(
  () => config,
  LABELS
);

const storage = chrome.storage.local;

// Store configuration in memory for quick access
const defaultStats = { ...DEFAULT_STATS };

let config = {
  apiKey: null,
  currentTask: null,
  blockList: [],
  allowList: [],
  allowedUrls: [],
  enabled: true,
  cache: {}, // URL cache for AI decisions
  stats: { ...defaultStats },
  flight: null,
  flightHistory: []
};

const flightManager = FG_FLIGHT.createFlightManager({
  getFlight: () => config.flight,
  setFlight: (flight) => {
    config.flight = flight;
  },
  getHistory: () => config.flightHistory,
  setHistory: (history) => {
    config.flightHistory = history;
  },
  storage,
  flightConstants: FLIGHT,
  getCurrentTask: () => config.currentTask
});

const statsManager = createStatsManager(storage, STAT_KEYS, () => config.stats);

const cacheManager = createCacheManager(
  storage,
  CACHE,
  () => config.cache,
  (newCache) => {
    config.cache = newCache;
  }
);

function respondWithFlight(sendResponse, payload = {}) {
  sendResponse({
    ...payload,
    flight: flightManager.getSnapshot()
  });
}

async function updateAllowList(list = []) {
  config.allowList = sanitizeDomainList(list);
  await storage.set({ allowList: config.allowList });
}

async function addHostnameToAllowList(hostname) {
  const cleanHost = (hostname || '').toLowerCase().trim();
  if (!cleanHost) return;
  if (!config.allowList.includes(cleanHost)) {
    config.allowList.push(cleanHost);
    await storage.set({ allowList: config.allowList });
  }
}

function isUserAllowed(hostname = '') {
  return config.allowList.some(allowed => 
    allowed && (hostname.includes(allowed) || allowed.includes(hostname))
  );
}

//  FIX: Load configuration immediately when service worker starts
loadConfiguration();

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    console.log('First time installation!');
    
    // Set default configuration
    await storage.set({
      extensionEnabled: true,
      installTime: new Date().toISOString(),
      ...defaultStats,
      blockList: DEFAULT_BLOCK_LIST,
      allowList: []
    });
  }
  
  // Load configuration into memory
  await loadConfiguration();
});

// Load configuration from storage
async function loadConfiguration() {
  try {
    const data = await storage.get(STORAGE_KEYS);
    
    config.apiKey = data.geminiApiKey || null;
    config.currentTask = data.currentTask || null;
    config.blockList = data.blockList || [...DEFAULT_BLOCK_LIST];
    config.allowList = data.allowList || [];
    config.allowedUrls = loadAllowedUrlSignatures(data.allowedUrls || []);
    config.enabled = data.extensionEnabled !== false;
    config.flight = data.currentFlight || null;
    config.flightHistory = Array.isArray(data.flightHistory) ? data.flightHistory : [];
    cacheManager.loadFrom(data.urlCache || {});
    statsManager.initFrom(data);
    
    console.log('Configuration loaded:', {
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey ? config.apiKey.length : 0,
      hasTask: !!config.currentTask,
      blockListSize: config.blockList.length,
      allowListSize: config.allowList.length,
      cacheSize: Object.keys(config.cache).length,
      enabled: config.enabled,
      stats: config.stats,
      hasFlight: !!config.flight,
      flightHistoryCount: config.flightHistory.length
    });
    
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);
  
  switch (request.action) {
    case 'taskUpdated':
      handleTaskUpdated(request.task);
      sendResponse({ success: true });
      break;
      
    case 'blockListUpdated':
      config.blockList = request.blockList;
      cacheManager.clear();
      console.log('Block list updated:', config.blockList);
      sendResponse({ success: true });
      break;
      
    case 'allowListUpdated':
      updateAllowList(request.allowList || []).then(() => {
        cacheManager.clear();
        console.log('Allow list updated:', config.allowList);
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Failed to update allow list:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
      
    case 'apiKeyUpdated':
      //  FIX: Reload configuration when API key is saved
      loadConfiguration().then(() => {
        console.log('Configuration reloaded after API key update');
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
      
    case 'getConfig':
      sendResponse({ config: config });
      break;
      
    case 'getStats':
      sendResponse({ stats: config.stats });
      break;
      
    case 'checkUrl':
      handleUrlCheck(request.url, request.html, sendResponse);
      return true; // Keep channel open for async response
      
    case 'warningShown':
      handleWarningShown(request.url).then(() => {
        sendResponse({ success: true, flight: flightManager.getSnapshot() });
      }).catch(error => {
        console.error('Failed to handle warning event:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
      
    case 'allowCurrentUrl':
      handleAllowCurrentUrl(request.url).then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error('Failed to add allow entry:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
      
    case 'userWentBack':
      handleUserWentBack(request.url);
      sendResponse({ success: true });
      break;
      
    case 'userContinued':
      handleUserContinued(request.url);
      sendResponse({ success: true });
      break;
      
    case 'setExtensionEnabled':
      config.enabled = request.enabled === true;
      storage.set({ extensionEnabled: config.enabled });
      console.log(` Extension ${config.enabled ? 'enabled': 'disabled'} via popup`);
      sendResponse({ success: true, enabled: config.enabled });
      break;

    case 'startFlight':
      flightManager.start().then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error('Failed to start flight:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'endFlight':
      flightManager.end({ forcedOutcome: request.forcedOutcome, skipDurationCheck: request.skipDurationCheck }).then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error('Failed to end flight:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'disputeTurbulence':
      flightManager.rollbackTurbulence().then(result => {
        sendResponse(result);
      }).catch(error => {
        console.error('Failed to rollback turbulence:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'getFlightStatus':
      sendResponse({ success: true, flight: flightManager.getSnapshot(), history: config.flightHistory });
      break;

    case 'openPopup': {
      const popupUrl = chrome.runtime.getURL('popup.html');
      chrome.windows.create({
        url: popupUrl,
        type: 'popup',
        width: 420,
        height: 640,
        focused: true
      }, (createdWindow) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to open popup window:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('Focus popup opened:', createdWindow?.id);
          sendResponse({ success: true });
        }
      });
      return true;
    }
      
    case 'test':
      sendResponse({ success: true, message: 'Background script responding!'});
      break;
    
    case 'allowedUrlsUpdated':
      config.allowedUrls = loadAllowedUrlSignatures(request.allowedUrls || []);
      storage.set({ allowedUrls: config.allowedUrls });
      cacheManager.clear();
      sendResponse({ success: true });
      break;
  }
  
  return true;
});

// Handle URL checking with AI analysis (Phase 4)
async function handleUrlCheck(url, html, sendResponse) {
  try {
    if (!config.enabled || !flightManager.isActive()) {
      respondWithFlight(sendResponse, buildResponse({
        reason: 'Start a focus flight to enable focus mode',
        source: 'no-flight',
        extras: { extensionEnabled: false }
      }));
      return;
    }
    
    const hostname = getHostname(url);
    if (!hostname) {
      respondWithFlight(sendResponse, responseFactory.invalidUrl());
      return;
    }
    
    // Increment pages analyzed
    await statsManager.increment('pagesAnalyzed');
    
    console.log(` Analyzing page #${config.stats.pagesAnalyzed}:`, hostname);
    
    // Step 1: Check if in strict block list (highest priority)
    if (isStrictlyBlocked(hostname)) {
      console.log('URL is in block list:', hostname);
      respondWithFlight(sendResponse, responseFactory.strictBlock());
      return;
    }
    
    // Step 1.5: Allow list checks
    const allowMatch = getAllowDecision(hostname, url);
    if (allowMatch) {
      respondWithFlight(sendResponse, buildResponse({
        reason: allowMatch.reason,
        source: allowMatch.source,
        extras: { isAllowed: true }
      }));
      return;
    }
    
    // Step 2: Check cache
    const cachedDecision = cacheManager.get(url);
    if (cachedDecision) {
      console.log('Using cached AI decision for:', hostname);
      const cachedDecisionPayload = {
        ...cachedDecision,
        cached: true,
        currentTask: config.currentTask,
        source: 'cache'
      };
      respondWithFlight(sendResponse, cachedDecisionPayload);
      return;
    }
    
    // Step 3: Check if we should skip AI analysis
    if (shouldSkipAIAnalysis(url)) {
      console.log('Skipping AI analysis for whitelisted site:', hostname);
      respondWithFlight(sendResponse, responseFactory.productivityAllow());
      return;
    }
    
    console.log('Site NOT in whitelist, will use AI:', hostname);
    
    // Step 4: Check if API key and task are configured
    if (!config.apiKey) {
      console.log('No API key configured - allowing access');
      console.log('API key in config:', config.apiKey);
      respondWithFlight(sendResponse, responseFactory.noApiKey());
      return;
    }
    
    if (!config.currentTask) {
      console.log('No focus goal set - allowing access');
      respondWithFlight(sendResponse, responseFactory.noTask());
      return;
    }
    
    // Step 5: Check if HTML is provided
    if (!html || html.length === 0) {
      console.log('No HTML provided - allowing access');
      respondWithFlight(sendResponse, responseFactory.noHtml());
      return;
    }
    
    // Step 6: Perform AI Analysis
    console.log('Starting AI analysis for:', hostname);
    console.log('User goal:', config.currentTask);
    console.log('HTML length:', html.length, 'characters');
    console.log('Sending first 30k characters to AI');
    
    try {
      const aiResult = await analyzePageWithAI(url, html, config.currentTask, config.apiKey);
      
      // Increment AI analysis counter
      await statsManager.increment('aiAnalysisCount');
      
      // Cache the result
      cacheManager.set(url, aiResult);
      
      console.log('AI Analysis complete:', aiResult.shouldWarn ? 'DISTRACTION': 'ON_TRACK');
      
      respondWithFlight(sendResponse, {
        ...aiResult,
        currentTask: config.currentTask,
        cached: false,
        source: 'ai'
      });
      
    } catch (aiError) {
      console.error('AI Analysis failed:', aiError);
      respondWithFlight(sendResponse, responseFactory.aiError(aiError.message));
    }
    
  } catch (error) {
    console.error('Error checking URL:', error);
    respondWithFlight(sendResponse, buildResponse({
      reason: 'Error occurred during check',
      source: 'error',
      extras: { error: error.message }
    }));
  }
}

//  NEW: AI Analysis with JSON Mode (Strict Output)
async function analyzePageWithAI(url, html, focusGoal, apiKey) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    console.log(` AI Analysis attempt ${attempt}/${maxRetries}`);
    
    try {
      // Limit HTML to 30000 characters
      const htmlToSend = html.substring(0, 30000);
      
      // Extract page title and meta description for better analysis
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1] : 'Unknown';
      
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const pageDesc = descMatch ? descMatch[1] : '';
      
      //  NEW: Improved prompt with clearer instructions
      const prompt = `Analyze if this website distracts from the user's goal.

USER'S GOAL: "${focusGoal}"

WEBSITE INFO:
- URL: ${url}
- Title: ${pageTitle}
- Description: ${pageDesc}

RULES (STRICT, CONTENT-FIRST):
1. Social/entertainment platforms (YouTube, Reddit, TikTok, Netflix, etc.) are ONLY distractions when the **specific video/post/page content** is unrelated to the goal. Landing on the main/home page alone is neutral—treat it as ALLOWED unless the visible content is clearly off-goal.
2. Streaming/video/gaming content that is purely for entertainment = DISTRACTION unless the title/description explicitly ties to the goal.
3. News/blogs = DISTRACTION unless the goal mentions news/research on the same topic.
4. Shopping/e-commerce = DISTRACTION unless the goal involves buying/comparing that product/service.
5. Educational/tutorial/reference content that advances the goal = NOT a distraction.
6. Productivity/work tools (docs, email, calendar, project trackers) = NOT a distraction.
7. If the content clearly helps the goal, allow it even if the domain is usually distracting.
8. If the intent is unclear or recreational after checking the actual content, treat it as a distraction.

EXAMPLE 1: Goal="Learning Python", URL="youtube.com/watch?v=python-tutorial"→ NOT distraction
EXAMPLE 2: Goal="Learning Python", URL="youtube.com/watch?v=funny-cats"→ DISTRACTION
EXAMPLE 3: Goal="Writing report", URL="reddit.com/r/funny"→ DISTRACTION
EXAMPLE 4: Goal="Research AI", URL="arxiv.org/ai-paper"→ NOT distraction

Analyze this page content:
${htmlToSend.substring(0, 5000)}

Respond with ONLY a JSON object in this exact format:
{
  "isDistraction": true,
  "confidence": 0.95,
  "reason": "Brief explanation"
}`;
      
      //  SOLUTION 1: Use response_mime_type for JSON mode
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 100,
              responseMimeType: "application/json",  //  Force JSON output!
              responseSchema: {
                type: "object",
                properties: {
                  isDistraction: {
                    type: "boolean",
                    description: "Whether the site is a distraction"
                  },
                  confidence: {
                    type: "number",
                    description: "Confidence level 0-1"
                  },
                  reason: {
                    type: "string",
                    description: "Brief explanation"
                  }
                },
                required: ["isDistraction", "confidence", "reason"]
              }
            }
          })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }
      
      const result = await response.json();
      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      console.log('AI Raw Response:', aiResponse);
      
      // Parse JSON response
      try {
        const parsed = JSON.parse(aiResponse);
        
        if (typeof parsed.isDistraction === 'boolean') {
          console.log('Valid JSON response:', {
            isDistraction: parsed.isDistraction,
            confidence: parsed.confidence,
            reason: parsed.reason
          });
          
          return {
            shouldWarn: parsed.isDistraction,
            isDistraction: parsed.isDistraction,
            reason: parsed.reason || (parsed.isDistraction ? 
              'AI detected this site distracts from your goal': 
              'AI determined this site is relevant to your goal'),
            confidence: parsed.confidence || 0,
            timestamp: Date.now()
          };
        } else {
          throw new Error('Invalid response format');
        }
      } catch (parseError) {
        console.log('JSON parse failed, trying fallback parsing...');
        
        // Fallback: Try to extract boolean from text
        const fallback = parseAIResponseFallback(aiResponse);
        if (fallback.isValid) {
          console.log('Fallback parsing succeeded');
          return {
            shouldWarn: fallback.isDistraction,
            isDistraction: fallback.isDistraction,
            reason: fallback.isDistraction ? 
              'AI detected this site distracts from your goal': 
              'AI determined this site is relevant to your goal',
            timestamp: Date.now()
          };
        }
        
        console.log('All parsing failed, retrying...');
        if (attempt >= maxRetries) {
          console.log('Max retries reached, defaulting to ALLOW (safe default)');
          console.log('Raw AI response (unclear):', aiResponse);
          return {
            shouldWarn: false,
            isDistraction: false,
            reason: 'AI did not provide clear answer - allowing access by default',
            rawAiResponse: aiResponse,
            timestamp: Date.now()
          };
        }
      }
    } catch (error) {
      console.error(` Attempt ${attempt} failed:`, error);
      if (attempt >= maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Fallback parser for when JSON mode fails
function parseAIResponseFallback(aiResponse) {
  const cleaned = aiResponse.trim().toLowerCase();
  
  // Try to find boolean values
  if (cleaned.includes('"isdistraction": true') || cleaned.includes('"isdistraction":true')) {
    return { isValid: true, isDistraction: true };
  }
  if (cleaned.includes('"isdistraction": false') || cleaned.includes('"isdistraction":false')) {
    return { isValid: true, isDistraction: false };
  }
  
  // Check for plain true/false
  if (cleaned === 'true'|| cleaned === 'yes'|| cleaned === '1') {
    return { isValid: true, isDistraction: true };
  }
  if (cleaned === 'false'|| cleaned === 'no'|| cleaned === '0') {
    return { isValid: true, isDistraction: false };
  }
  
  // Try to extract from markdown code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\{[^}]*"isdistraction"\s*:\s*(true|false)/);
  if (codeBlockMatch) {
    return { isValid: true, isDistraction: codeBlockMatch[1] === 'true'};
  }
  
  // Invalid response
  return { isValid: false, isDistraction: false };
}

function shouldSkipAIAnalysis(url) {
  try {
    const hostname = new URL(url).hostname;
    
    // Only skip for these specific productivity tools
    const builtinAllowed = PRODUCTIVITY_ALLOWLIST.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
    return builtinAllowed || isUserAllowed(hostname);
  } catch {
    return true;
  }
}

// Event handlers
async function handleWarningShown(url) {
  await statsManager.increment('warningsShown');
  const turbulenceResult = await flightManager.registerTurbulence({ url });
  console.log(` Warning shown (total: ${config.stats.warningsShown})`);
  if (turbulenceResult?.applied) {
    console.log(` ✈️ Turbulence recorded. Count: ${flightManager.getSnapshot().turbulence}/${FLIGHT.TURBULENCE_LIMIT}`);
  }
  if (turbulenceResult?.forcedLanding) {
    console.log(' ⚠️ Flight forced to land due to excessive distractions.');
    notifyForcedLanding(turbulenceResult?.result?.record);
  }
}

function notifyForcedLanding(record) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id || tab.url?.startsWith('chrome://')) return;
      chrome.tabs.sendMessage(tab.id, {
        action: 'flightForcedLanding',
        data: {
          outcome: record?.outcome || 'fail',
          turbulence: record?.turbulence || FLIGHT.TURBULENCE_LIMIT,
          durationMs: record?.durationMs || 0
        }
      }).catch(() => {});
    });
  });
}

async function handleUserWentBack(url) {
  await statsManager.increment('timesWentBack');
  console.log(`← User went back (total: ${config.stats.timesWentBack})`);
}

async function handleUserContinued(url) {
  await statsManager.increment('timesContinued');
  console.log(`→ User continued (total: ${config.stats.timesContinued})`);
}

async function handleAllowCurrentUrl(url) {
  const hostname = getHostname(url);
  const signature = normalizeUrlForAllowList(url);
  if (!hostname || !signature) {
    return { success: false, error: 'Invalid URL' };
  }
  
  if (!config.allowedUrls.includes(signature)) {
    config.allowedUrls.push(signature);
    await storage.set({ allowedUrls: config.allowedUrls });
  }
  
  cacheManager.set(url, {
    shouldWarn: false,
    isDistraction: false,
    reason: 'You allowed this page',
    source: 'allowurl',
    timestamp: Date.now()
  });
  
  console.log(` Added explicit allow entry: ${signature}`);
  return { success: true, hostname, signature };
}

// Monitor tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete'&& tab.url && config.enabled) {
    try {
      const hostname = getHostname(tab.url);
      
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return;
      }
      
      console.log('Page completed loading:', hostname);
      
      // Check block list
      if (isStrictlyBlocked(hostname)) {
        console.log('Blocked site detected:', hostname);
        
        try {
          await chrome.tabs.sendMessage(tabId, {
            action: 'showWarning',
            data: {
              shouldWarn: true,
              isBlocked: true,
              reason: 'This site is in your block list',
              currentTask: config.currentTask || 'Stay focused',
              flight: flightManager.getSnapshot()
            }
          });
        } catch (error) {
          console.log('Could not send message to tab:', error.message);
        }
      }
      
    } catch (error) {
      // Ignore errors for invalid URLs
    }
  }
});

// Monitor tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !tab.url.startsWith('chrome://')) {
      const hostname = getHostname(tab.url);
      console.log('Switched to tab:', hostname);
    }
  } catch (error) {
    // Ignore
  }
});

// Periodic cache cleanup
setInterval(() => {
  cacheManager.cleanup();
}, CACHE.CLEAN_INTERVAL_MS);

// Save stats periodically
setInterval(async () => {
  await storage.set({ urlCache: config.cache });
  await statsManager.persistAll();
  console.log('Stats saved:', config.stats);
}, STATS_SAVE_INTERVAL_MS);

console.log('Background script initialized (Phase 4 - AI Enabled with JSON Mode)');

function handleTaskUpdated(task) {
  config.currentTask = task;
  cacheManager.clear();
  console.log('Task updated:', task, '(cache cleared)');
}

function isStrictlyBlocked(hostname = '') {
  return config.blockList.some(blocked => 
    hostname.includes(blocked) || blocked.includes(hostname)
  );
}

function getAllowDecision(hostname, url) {
  if (isUserAllowed(hostname)) {
    console.log('Hostname in allow list:', hostname);
    return { source: 'allowlist', reason: 'This site is in your allow list' };
  }
  
  const normalized = normalizeUrlForAllowList(url);
  if (normalized && config.allowedUrls.includes(normalized)) {
    console.log('URL signature allowed:', normalized);
    return { source: 'allowurl', reason: 'You allowed this exact page/query' };
  }
  
  return null;
}

// Legacy helper names retained for compatibility (if other files import them)
const clearCache = () => cacheManager.clear();
