// content.js - Content Script with SPA Navigation Detection

console.log('🌐 Focus Guardian loaded on:', window.location.href);

let warningShown = false;
let lastUrl = window.location.href;
let checkTimeout = null;
let focusGoalNoticeVisible = false;

// Wait for page to fully load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('📄 Content script initialized');
  
  // Check immediately
  checkPageStatus();
  
  // Listen for URL changes (for SPAs like YouTube, Reddit)
  setupUrlChangeDetection();
  
  // Listen for messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageInfo') {
      sendResponse({
        url: window.location.href,
        html: document.documentElement.outerHTML
      });
    } else if (request.action === 'showWarning') {
      showWarningOverlay(request.data);
      sendResponse({ success: true });
    }
    return true;
  });
}

// Setup detection for URL changes (critical for SPAs!)
function setupUrlChangeDetection() {
  // Method 1: Watch for history changes
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    onUrlChange();
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    onUrlChange();
  };
  
  // Method 2: Listen for popstate (back/forward buttons)
  window.addEventListener('popstate', onUrlChange);
  
  // Method 3: Poll URL every 1 second as backup (for sites that don't use history API properly)
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      onUrlChange();
    }
  }, 1000);
  
  console.log('✅ URL change detection enabled');
}

// Called when URL changes
function onUrlChange() {
  const newUrl = window.location.href;
  
  if (newUrl !== lastUrl) {
    console.log('🔄 URL changed!');
    console.log('   Old:', lastUrl);
    console.log('   New:', newUrl);
    
    lastUrl = newUrl;
    warningShown = false; // Reset warning state
    
    // Debounce - wait for page to settle before checking
    clearTimeout(checkTimeout);
    checkTimeout = setTimeout(() => {
      console.log('🔍 Re-analyzing new page...');
      checkPageStatus();
    }, 1500); // Wait 1.5 seconds for page to load
  }
}

// Check with background script
async function checkPageStatus() {
  try {
    console.log('🔍 Getting HTML from page...');
    const html = document.documentElement.outerHTML;
    console.log('📄 HTML length:', html.length, 'characters');
    
    console.log('📤 Sending to background script...');
    const response = await chrome.runtime.sendMessage({
      action: 'checkUrl',
      url: window.location.href,
      html: html
    });
    
    console.log('📊 Received response:', response);
    
    if (response && (response.source === 'disabled' || response.extensionEnabled === false)) {
      console.log('⏸️ Focus Guardian disabled. Skipping monitoring.');
      hideWarningOverlay();
      hideFocusGoalNotice();
      warningShown = false;
      return;
    }
    
    if (response && response.source === 'no-task') {
      showFocusGoalNotice(response);
      return;
    }
    
    hideFocusGoalNotice();
    
    if (response && response.shouldWarn && !warningShown) {
      console.log('⚠️ Showing warning overlay');
      showWarningOverlay(response);
    } else if (response && !response.shouldWarn) {
      console.log('✅ Site allowed, no warning');
    }
  } catch (error) {
    console.error('❌ Error in checkPageStatus:', error);
  }
}

// Show warning overlay
function showWarningOverlay(data) {
  // Don't show multiple warnings
  if (warningShown) return;
  
  warningShown = true;
  
  // Remove existing overlay if any
  const existing = document.getElementById('focus-guardian-overlay');
  if (existing) existing.remove();
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'focus-guardian-overlay';
  
  // Determine warning type
  const isBlocked = data.isBlocked || false;
  const reason = data.reason || 'This site may be distracting';
  const task = data.currentTask || 'your current task';
  
  overlay.innerHTML = `
    <style>
      #focus-guardian-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: fadeIn 0.3s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      .fg-warning-card {
        background: white;
        border-radius: 16px;
        padding: 40px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        text-align: center;
        animation: slideUp 0.4s ease;
      }
      
      @keyframes slideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      .fg-warning-icon {
        font-size: 64px;
        margin-bottom: 20px;
      }
      
      .fg-warning-title {
        font-size: 28px;
        font-weight: 700;
        color: #333;
        margin-bottom: 16px;
      }
      
      .fg-warning-message {
        font-size: 16px;
        color: #666;
        line-height: 1.6;
        margin-bottom: 12px;
      }
      
      .fg-warning-task {
        font-size: 15px;
        color: #667eea;
        background: #f0f3ff;
        padding: 12px 16px;
        border-radius: 8px;
        margin: 20px 0;
        font-weight: 600;
      }
      
      .fg-warning-reason {
        font-size: 14px;
        color: #999;
        margin-bottom: 24px;
        font-style: italic;
      }
      
      .fg-button-group {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-top: 24px;
      }
      
      .fg-button {
        padding: 14px 28px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
        flex: 1;
        max-width: 200px;
      }
      
      .fg-button-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .fg-button-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      
      .fg-button-secondary {
        background: white;
        color: #667eea;
        border: 2px solid #667eea;
      }
      
      .fg-button-secondary:hover {
        background: #f0f3ff;
      }
      
      .fg-stats {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #eee;
        font-size: 13px;
        color: #999;
      }
    </style>
    
    <div class="fg-warning-card">
      <div class="fg-warning-icon">⚠️</div>
      <h1 class="fg-warning-title">Focus Check!</h1>
      <p class="fg-warning-message">
        You're about to visit a site that might distract you from your goal.
      </p>
      <div class="fg-warning-task">
        📝 Your goal: ${escapeHtml(task)}
      </div>
      <p class="fg-warning-reason">
        ${isBlocked ? '🚫 This site is in your block list' : reason}
      </p>
      
      <div class="fg-button-group">
        <button class="fg-button fg-button-primary" id="fg-go-back">
          ← Go Back
        </button>
        <button class="fg-button fg-button-secondary" id="fg-continue">
          Continue Anyway
        </button>
      </div>
      
      <div class="fg-stats">
        Staying focused helps you achieve your goals faster! 🎯
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Add event listeners
  document.getElementById('fg-go-back').addEventListener('click', () => {
    hideWarningOverlay();
    window.history.back();
    
    // Notify background
    chrome.runtime.sendMessage({
      action: 'userWentBack',
      url: window.location.href
    });
  });
  
  document.getElementById('fg-continue').addEventListener('click', () => {
    hideWarningOverlay();
    
    // Notify background
    chrome.runtime.sendMessage({
      action: 'userContinued',
      url: window.location.href
    });
  });
  
  // Log warning shown
  chrome.runtime.sendMessage({
    action: 'warningShown',
    url: window.location.href
  });
  
  console.log('🚨 Warning overlay displayed');
}

// Hide warning overlay
function hideWarningOverlay() {
  const overlay = document.getElementById('focus-guardian-overlay');
  if (overlay) {
    overlay.style.animation = 'fadeOut 0.2s ease';
    setTimeout(() => {
      overlay.remove();
      warningShown = false;
    }, 200);
  }
}

function showFocusGoalNotice(data) {
  if (focusGoalNoticeVisible) return;
  
  focusGoalNoticeVisible = true;
  
  const notice = document.createElement('div');
  notice.id = 'focus-goal-required-notice';
  notice.innerHTML = `
    <style>
      #focus-goal-required-notice {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.65);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .fg-goal-card {
        width: min(90%, 420px);
        background: #fff;
        color: #1f1f1f;
        border-radius: 20px;
        padding: 32px;
        text-align: center;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
        animation: fgNoticeFade 0.35s ease;
      }
      .fg-goal-icon {
        font-size: 60px;
        margin-bottom: 16px;
      }
      .fg-goal-card h3 {
        margin: 0 0 12px 0;
        font-size: 24px;
        font-weight: 700;
      }
      .fg-goal-card p {
        margin: 0 0 18px 0;
        font-size: 15px;
        line-height: 1.5;
        color: #444;
      }
      .fg-goal-card button {
        width: 100%;
        padding: 14px;
        border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 12px 30px rgba(102, 126, 234, 0.35);
      }
      @keyframes fgNoticeFade {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div class="fg-goal-card">
      <div class="fg-goal-icon">📝</div>
      <h3>Set your focus goal</h3>
      <p>${data?.reason || 'Focus Guardian needs your goal to analyze sites.'}</p>
      <button id="fg-open-popup">Open Focus Guardian</button>
    </div>
  `;
  
  document.body.appendChild(notice);
  
  const openBtn = document.getElementById('fg-open-popup');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      hideFocusGoalNotice();
      chrome.runtime.sendMessage({ action: 'openPopup' }).catch(() => {});
    });
  }
}

function hideFocusGoalNotice() {
  if (!focusGoalNoticeVisible) return;
  
  const notice = document.getElementById('focus-goal-required-notice');
  if (notice) {
    notice.remove();
  }
  
  focusGoalNoticeVisible = false;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper: Check if URL matches domain pattern
function matchesDomain(url, pattern) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes(pattern) || pattern.includes(hostname);
  } catch {
    return false;
  }
}

// Add CSS for fadeOut animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(style);

console.log('✅ Content script initialized (Phase 3)');
