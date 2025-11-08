// background.js - Background Service Worker with Phase 4 AI Analysis + JSON Mode

console.log('🚀 Focus Guardian Background Service Worker Started (Phase 4 - AI Enabled)!');

// Store configuration in memory for quick access
let config = {
  apiKey: null,
  currentTask: null,
  blockList: [],
  enabled: true,
  cache: {}, // URL cache for AI decisions
  stats: {
    pagesAnalyzed: 0,
    warningsShown: 0,
    timesWentBack: 0,
    timesContinued: 0,
    aiAnalysisCount: 0
  }
};

// 🔥 FIX: Load configuration immediately when service worker starts
loadConfiguration();

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    console.log('🎉 First time installation!');
    
    // Set default configuration
    await chrome.storage.local.set({
      extensionEnabled: true,
      installTime: new Date().toISOString(),
      pagesAnalyzed: 0,
      warningsShown: 0,
      timesWentBack: 0,
      timesContinued: 0,
      aiAnalysisCount: 0,
      blockList: ['netflix.com', 'youtube.com', 'tiktok.com']
    });
  }
  
  // Load configuration into memory
  await loadConfiguration();
});

// Load configuration from storage
async function loadConfiguration() {
  try {
    const data = await chrome.storage.local.get([
      'geminiApiKey',
      'currentTask',
      'blockList',
      'extensionEnabled',
      'urlCache',
      'pagesAnalyzed',
      'warningsShown',
      'timesWentBack',
      'timesContinued',
      'aiAnalysisCount'
    ]);
    
    config.apiKey = data.geminiApiKey || null;
    config.currentTask = data.currentTask || null;
    config.blockList = data.blockList || [];
    config.enabled = data.extensionEnabled !== false;
    config.cache = data.urlCache || {};
    config.stats.pagesAnalyzed = data.pagesAnalyzed || 0;
    config.stats.warningsShown = data.warningsShown || 0;
    config.stats.timesWentBack = data.timesWentBack || 0;
    config.stats.timesContinued = data.timesContinued || 0;
    config.stats.aiAnalysisCount = data.aiAnalysisCount || 0;
    
    console.log('📋 Configuration loaded:', {
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey ? config.apiKey.length : 0,
      hasTask: !!config.currentTask,
      blockListSize: config.blockList.length,
      cacheSize: Object.keys(config.cache).length,
      enabled: config.enabled,
      stats: config.stats
    });
    
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request.action);
  
  switch (request.action) {
    case 'taskUpdated':
      config.currentTask = request.task;
      // Clear cache when task changes
      config.cache = {};
      chrome.storage.local.set({ urlCache: {} });
      console.log('✅ Task updated:', request.task, '(cache cleared)');
      sendResponse({ success: true });
      break;
      
    case 'blockListUpdated':
      config.blockList = request.blockList;
      console.log('✅ Block list updated:', config.blockList);
      sendResponse({ success: true });
      break;
      
    case 'apiKeyUpdated':
      // 🔥 FIX: Reload configuration when API key is saved
      loadConfiguration().then(() => {
        console.log('✅ Configuration reloaded after API key update');
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
      handleWarningShown(request.url);
      sendResponse({ success: true });
      break;
      
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
      chrome.storage.local.set({ extensionEnabled: config.enabled });
      console.log(`🛠️ Extension ${config.enabled ? 'enabled' : 'disabled'} via popup`);
      sendResponse({ success: true, enabled: config.enabled });
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
          console.log('🪟 Focus Guardian popup opened:', createdWindow?.id);
          sendResponse({ success: true });
        }
      });
      return true;
    }
      
    case 'test':
      sendResponse({ success: true, message: 'Background script responding!' });
      break;
  }
  
  return true;
});

// Handle URL checking with AI analysis (Phase 4)
async function handleUrlCheck(url, html, sendResponse) {
  try {
    if (!config.enabled) {
      sendResponse({
        shouldWarn: false,
        reason: 'Focus Guardian is turned off',
        source: 'disabled',
        extensionEnabled: false
      });
      return;
    }
    
    const hostname = new URL(url).hostname;
    
    // Increment pages analyzed
    config.stats.pagesAnalyzed++;
    await chrome.storage.local.set({ pagesAnalyzed: config.stats.pagesAnalyzed });
    
    console.log(`📊 Analyzing page #${config.stats.pagesAnalyzed}:`, hostname);
    
    // Step 1: Check if in strict block list (highest priority)
    const isBlocked = config.blockList.some(blocked => 
      hostname.includes(blocked) || blocked.includes(hostname)
    );
    
    if (isBlocked) {
      console.log('🚫 URL is in block list:', hostname);
      sendResponse({
        shouldWarn: true,
        isBlocked: true,
        reason: 'Site is in your strict block list',
        currentTask: config.currentTask || 'Stay focused',
        cached: false,
        source: 'blocklist'
      });
      return;
    }
    
    // Step 2: Check cache
    if (config.cache[url]) {
      const cacheAge = Date.now() - (config.cache[url].timestamp || 0);
      const cacheValid = cacheAge < 3600000; // 1 hour
      
      if (cacheValid) {
        console.log('📦 Using cached AI decision for:', hostname);
        sendResponse({
          ...config.cache[url],
          cached: true,
          currentTask: config.currentTask,
          source: 'cache'
        });
        return;
      } else {
        console.log('🔄 Cache expired for:', hostname);
        delete config.cache[url];
      }
    }
    
    // Step 3: Check if we should skip AI analysis
    if (shouldSkipAIAnalysis(url)) {
      console.log('⏭️ Skipping AI analysis for whitelisted site:', hostname);
      sendResponse({
        shouldWarn: false,
        reason: 'Common productivity site - allowed',
        currentTask: config.currentTask,
        cached: false,
        source: 'whitelist'
      });
      return;
    }
    
    console.log('🔍 Site NOT in whitelist, will use AI:', hostname);
    
    // Step 4: Check if API key and task are configured
    if (!config.apiKey) {
      console.log('⚠️ No API key configured - allowing access');
      console.log('⚠️ API key in config:', config.apiKey);
      sendResponse({
        shouldWarn: false,
        reason: 'API key not configured - cannot analyze',
        currentTask: config.currentTask,
        cached: false,
        source: 'no-api-key'
      });
      return;
    }
    
    if (!config.currentTask) {
      console.log('⚠️ No focus goal set - allowing access');
      sendResponse({
        shouldWarn: false,
        reason: 'No focus goal set - cannot analyze',
        currentTask: 'Please set a focus goal',
        cached: false,
        source: 'no-task'
      });
      return;
    }
    
    // Step 5: Check if HTML is provided
    if (!html || html.length === 0) {
      console.log('⚠️ No HTML provided - allowing access');
      sendResponse({
        shouldWarn: false,
        reason: 'Could not get page content',
        currentTask: config.currentTask,
        cached: false,
        source: 'no-html'
      });
      return;
    }
    
    // Step 6: Perform AI Analysis
    console.log('🤖 Starting AI analysis for:', hostname);
    console.log('📝 User goal:', config.currentTask);
    console.log('📄 HTML length:', html.length, 'characters');
    console.log('📄 Sending first 30k characters to AI');
    
    try {
      const aiResult = await analyzePageWithAI(url, html, config.currentTask, config.apiKey);
      
      // Increment AI analysis counter
      config.stats.aiAnalysisCount++;
      await chrome.storage.local.set({ aiAnalysisCount: config.stats.aiAnalysisCount });
      
      // Cache the result
      config.cache[url] = {
        ...aiResult,
        timestamp: Date.now()
      };
      
      // Save cache (async, don't wait)
      chrome.storage.local.set({ urlCache: config.cache });
      
      console.log('✅ AI Analysis complete:', aiResult.shouldWarn ? 'DISTRACTION' : 'ON_TRACK');
      
      sendResponse({
        ...aiResult,
        currentTask: config.currentTask,
        cached: false,
        source: 'ai'
      });
      
    } catch (aiError) {
      console.error('❌ AI Analysis failed:', aiError);
      sendResponse({
        shouldWarn: false,
        reason: 'AI analysis failed - allowing access',
        error: aiError.message,
        currentTask: config.currentTask,
        cached: false,
        source: 'ai-error'
      });
    }
    
  } catch (error) {
    console.error('Error checking URL:', error);
    sendResponse({
      shouldWarn: false,
      reason: 'Error occurred during check',
      error: error.message,
      source: 'error'
    });
  }
}

// 🔥 NEW: AI Analysis with JSON Mode (Strict Output)
async function analyzePageWithAI(url, html, focusGoal, apiKey) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    console.log(`🤖 AI Analysis attempt ${attempt}/${maxRetries}`);
    
    try {
      // Limit HTML to 30000 characters
      const htmlToSend = html.substring(0, 30000);
      
      // Extract page title and meta description for better analysis
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1] : 'Unknown';
      
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const pageDesc = descMatch ? descMatch[1] : '';
      
      // 🔥 NEW: Improved prompt with clearer instructions
      const prompt = `Analyze if this website distracts from the user's goal.

USER'S GOAL: "${focusGoal}"

WEBSITE INFO:
- URL: ${url}
- Title: ${pageTitle}
- Description: ${pageDesc}

RULES (STRICT):
1. Social media (YouTube, Reddit, Twitter, TikTok, Instagram) = DISTRACTION unless DIRECTLY related to goal
2. Entertainment (Netflix, games, videos) = ALWAYS DISTRACTION
3. News/blogs = DISTRACTION unless goal involves news/research
4. Shopping = DISTRACTION unless goal involves shopping/comparison
5. Educational content = NOT distraction if related to goal
6. Work tools (docs, email, calendar) = NOT distraction
7. If content HELPS goal = NOT distraction
8. If unclear or recreational = DISTRACTION (be strict!)

EXAMPLE 1: Goal="Learning Python", URL="youtube.com/watch?v=python-tutorial" → NOT distraction
EXAMPLE 2: Goal="Learning Python", URL="youtube.com/watch?v=funny-cats" → DISTRACTION
EXAMPLE 3: Goal="Writing report", URL="reddit.com/r/funny" → DISTRACTION
EXAMPLE 4: Goal="Research AI", URL="arxiv.org/ai-paper" → NOT distraction

Analyze this page content:
${htmlToSend.substring(0, 5000)}

Respond with ONLY a JSON object in this exact format:
{
  "isDistraction": true,
  "confidence": 0.95,
  "reason": "Brief explanation"
}`;
      
      // 🔥 SOLUTION 1: Use response_mime_type for JSON mode
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
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
              responseMimeType: "application/json",  // 🔥 Force JSON output!
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
      
      console.log('🤖 AI Raw Response:', aiResponse);
      
      // Parse JSON response
      try {
        const parsed = JSON.parse(aiResponse);
        
        if (typeof parsed.isDistraction === 'boolean') {
          console.log('✅ Valid JSON response:', {
            isDistraction: parsed.isDistraction,
            confidence: parsed.confidence,
            reason: parsed.reason
          });
          
          return {
            shouldWarn: parsed.isDistraction,
            isDistraction: parsed.isDistraction,
            reason: parsed.reason || (parsed.isDistraction ? 
              'AI detected this site distracts from your goal' : 
              'AI determined this site is relevant to your goal'),
            confidence: parsed.confidence || 0,
            timestamp: Date.now()
          };
        } else {
          throw new Error('Invalid response format');
        }
      } catch (parseError) {
        console.log('⚠️ JSON parse failed, trying fallback parsing...');
        
        // Fallback: Try to extract boolean from text
        const fallback = parseAIResponseFallback(aiResponse);
        if (fallback.isValid) {
          console.log('✅ Fallback parsing succeeded');
          return {
            shouldWarn: fallback.isDistraction,
            isDistraction: fallback.isDistraction,
            reason: fallback.isDistraction ? 
              'AI detected this site distracts from your goal' : 
              'AI determined this site is relevant to your goal',
            timestamp: Date.now()
          };
        }
        
        console.log('⚠️ All parsing failed, retrying...');
        if (attempt >= maxRetries) {
          console.log('❌ Max retries reached, defaulting to ALLOW (safe default)');
          return {
            shouldWarn: false,
            isDistraction: false,
            reason: 'AI did not provide clear answer - allowing access by default',
            timestamp: Date.now()
          };
        }
      }
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error);
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
  if (cleaned === 'true' || cleaned === 'yes' || cleaned === '1') {
    return { isValid: true, isDistraction: true };
  }
  if (cleaned === 'false' || cleaned === 'no' || cleaned === '0') {
    return { isValid: true, isDistraction: false };
  }
  
  // Try to extract from markdown code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\{[^}]*"isdistraction"\s*:\s*(true|false)/);
  if (codeBlockMatch) {
    return { isValid: true, isDistraction: codeBlockMatch[1] === 'true' };
  }
  
  // Invalid response
  return { isValid: false, isDistraction: false };
}

function shouldSkipAIAnalysis(url) {
  try {
    const hostname = new URL(url).hostname;
    
    // Only skip for these specific productivity tools
    const allowedDomains = [
      'docs.google.com',
      'drive.google.com',
      'gmail.com',
      'localhost'
    ];
    
    return allowedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    return true;
  }
}

// Event handlers
async function handleWarningShown(url) {
  config.stats.warningsShown++;
  await chrome.storage.local.set({ warningsShown: config.stats.warningsShown });
  console.log(`⚠️ Warning shown (total: ${config.stats.warningsShown})`);
}

async function handleUserWentBack(url) {
  config.stats.timesWentBack++;
  await chrome.storage.local.set({ timesWentBack: config.stats.timesWentBack });
  console.log(`← User went back (total: ${config.stats.timesWentBack})`);
}

async function handleUserContinued(url) {
  config.stats.timesContinued++;
  await chrome.storage.local.set({ timesContinued: config.stats.timesContinued });
  console.log(`→ User continued (total: ${config.stats.timesContinued})`);
}

// Monitor tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && config.enabled) {
    try {
      const hostname = new URL(tab.url).hostname;
      
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return;
      }
      
      console.log('📄 Page completed loading:', hostname);
      
      // Check block list
      const isBlocked = config.blockList.some(blocked => 
        hostname.includes(blocked) || blocked.includes(hostname)
      );
      
      if (isBlocked) {
        console.log('🚫 Blocked site detected:', hostname);
        
        try {
          await chrome.tabs.sendMessage(tabId, {
            action: 'showWarning',
            data: {
              shouldWarn: true,
              isBlocked: true,
              reason: 'This site is in your block list',
              currentTask: config.currentTask || 'Stay focused'
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
      const hostname = new URL(tab.url).hostname;
      console.log('🔄 Switched to tab:', hostname);
    }
  } catch (error) {
    // Ignore
  }
});

// Periodic cache cleanup
setInterval(() => {
  const cacheSize = Object.keys(config.cache).length;
  if (cacheSize > 100) {
    console.log('🧹 Cleaning cache... Current size:', cacheSize);
    
    const now = Date.now();
    Object.keys(config.cache).forEach(url => {
      const age = now - (config.cache[url].timestamp || 0);
      if (age > 3600000) {
        delete config.cache[url];
      }
    });
    
    if (Object.keys(config.cache).length > 50) {
      const entries = Object.entries(config.cache)
        .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
        .slice(0, 50);
      config.cache = Object.fromEntries(entries);
    }
    
    chrome.storage.local.set({ urlCache: config.cache });
    console.log('✅ Cache cleaned. New size:', Object.keys(config.cache).length);
  }
}, 3600000);

// Save stats periodically
setInterval(async () => {
  await chrome.storage.local.set({
    urlCache: config.cache,
    pagesAnalyzed: config.stats.pagesAnalyzed,
    warningsShown: config.stats.warningsShown,
    timesWentBack: config.stats.timesWentBack,
    timesContinued: config.stats.timesContinued,
    aiAnalysisCount: config.stats.aiAnalysisCount
  });
  console.log('💾 Stats saved:', config.stats);
}, 300000);

console.log('✅ Background script initialized (Phase 4 - AI Enabled with JSON Mode)');
