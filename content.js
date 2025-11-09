// content.js - Content Script with SPA Navigation Detection

console.log('Focus Guardian loaded on:', window.location.href);

const OVERLAY_ID = 'focus-guardian-overlay';
const GOAL_NOTICE_ID = 'focus-goal-required-notice';

const FocusGuardianContent = (() => {
  const state = {
    warningShown: false,
    lastUrl: window.location.href,
    checkTimeout: null,
    focusGoalNoticeVisible: false,
    fadeStylesInjected: false
  };
  
  function init() {
    console.log('Content script initialized');
    injectFadeStyles();
    checkPageStatus();
    setupUrlChangeDetection();
    registerMessageListener();
  }
  
  function registerMessageListener() {
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
  
  function setupUrlChangeDetection() {
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
    
    window.addEventListener('popstate', onUrlChange);
    
    setInterval(() => {
      if (window.location.href !== state.lastUrl) {
        onUrlChange();
      }
    }, 1000);
    
    console.log('URL change detection enabled');
  }
  
  function onUrlChange() {
    const newUrl = window.location.href;
    
    if (newUrl === state.lastUrl) {
      return;
    }
    
    console.log('URL changed!');
    console.log('   Old:', state.lastUrl);
    console.log('   New:', newUrl);
    
    state.lastUrl = newUrl;
    state.warningShown = false;
    
    clearTimeout(state.checkTimeout);
    state.checkTimeout = setTimeout(() => {
      console.log('Re-analyzing new page...');
      checkPageStatus();
    }, 1500);
  }
  
  async function checkPageStatus() {
    try {
      console.log('Getting HTML from page...');
      const html = document.documentElement.outerHTML;
      console.log('HTML length:', html.length, 'characters');
      
      console.log('Sending to background script...');
      const response = await chrome.runtime.sendMessage({
        action: 'checkUrl',
        url: window.location.href,
        html
      });
      
    console.log('Received response:', response);
    
    if (
      response?.reason === 'AI did not provide clear answer - allowing access by default'&&
      response.rawAiResponse
    ) {
      console.warn('Focus Guardian: raw AI response (unclear):', response.rawAiResponse);
    }
      
      if (response && (response.source === 'disabled'|| response.extensionEnabled === false)) {
        console.log('Focus Guardian disabled. Skipping monitoring.');
        hideWarningOverlay();
        hideFocusGoalNotice();
        state.warningShown = false;
        return;
      }
      
      if (response && response.source === 'no-task') {
        showFocusGoalNotice(response);
        return;
      }
      
      hideFocusGoalNotice();
      
      if (response && response.shouldWarn && !state.warningShown) {
        console.log('Showing warning overlay');
        showWarningOverlay(response);
      } else if (response && !response.shouldWarn) {
        console.log('Site allowed, no warning');
      }
    } catch (error) {
      console.error('Error in checkPageStatus:', error);
    }
  }
  
  function showWarningOverlay(data = {}) {
    if (state.warningShown) return;
    state.warningShown = true;
    
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    
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
          background: #ffffff;
          border-radius: 18px;
          padding: 36px;
          max-width: 460px;
          width: 90%;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
          text-align: center;
          animation: slideUp 0.4s ease;
          color: #111111;
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
          color: #111111;
          margin-bottom: 16px;
        }
        
        .fg-warning-message {
          font-size: 16px;
          color: #444;
          line-height: 1.6;
          margin-bottom: 12px;
        }
        
        .fg-warning-task {
          font-size: 15px;
          color: #0d5ea6;
          background: #e9f2ff;
          border: 1px solid #cfe3ff;
          padding: 12px 16px;
          border-radius: 10px;
          margin: 20px 0;
          font-weight: 600;
        }
        
        .fg-warning-reason {
          font-size: 14px;
          color: #666;
          margin-bottom: 24px;
          font-style: italic;
        }
        
        .fg-button-group {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-top: 24px;
          flex-wrap: wrap;
        }
        
        .fg-button {
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          flex: 1;
          max-width: 200px;
        }
        
        .fg-button-primary {
          background: #111111;
          color: #ffffff;
        }
        
        .fg-button-primary:hover {
          background: #2a2a2a;
        }
        
        .fg-button-secondary {
          background: transparent;
          color: #111111;
          border: 1px solid #111111;
        }
        
        .fg-button-secondary:hover {
          background: #111111;
          color: #ffffff;
        }
        
        .fg-button-link {
          background: transparent;
          color: #f5f5f5;
          border: none;
          text-decoration: underline;
          flex: 0;
          padding: 0 8px;
        }
        
        .fg-button-link:hover {
          color: #dedede;
        }
        
        .fg-stats {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #eceff3;
          font-size: 13px;
          color: #6b6b6b;
        }
      </style>
      
      <div class="fg-warning-card">
        <div class="fg-warning-icon"></div>
        <h1 class="fg-warning-title">Focus Check!</h1>
        <p class="fg-warning-message">
          You're about to visit a site that might distract you from your goal.
        </p>
        <div class="fg-warning-task">
           Your goal: ${escapeHtml(task)}
        </div>
        <p class="fg-warning-reason">
          ${isBlocked ? 'This site is in your block list': reason}
        </p>
        
      <div class="fg-button-group">
        <button class="fg-button fg-button-primary"id="fg-go-back">
          ← Go Back
        </button>
        <button class="fg-button fg-button-secondary"id="fg-continue">
          Continue Anyway
        </button>
        <button class="fg-button fg-button-link"id="fg-allow-site">
          Always allow
        </button>
      </div>
        
        <div class="fg-stats">
          Staying focused helps you achieve your goals faster! 
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('fg-go-back').addEventListener('click', () => {
      hideWarningOverlay();
      window.history.back();
      sendBackgroundMessage('userWentBack');
    });
    
    document.getElementById('fg-continue').addEventListener('click', () => {
      hideWarningOverlay();
      sendBackgroundMessage('userContinued');
    });
    
    const allowButton = document.getElementById('fg-allow-site');
    if (allowButton) {
      allowButton.addEventListener('click', () => {
        allowCurrentSite(data?.url || window.location.href);
      });
    }
    
    sendBackgroundMessage('warningShown');
    
    console.log('Warning overlay displayed');
  }
  
  function hideWarningOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        overlay.remove();
        state.warningShown = false;
      }, 200);
    }
  }
  
  function showFocusGoalNotice(data) {
    if (state.focusGoalNoticeVisible) return;
    
    state.focusGoalNoticeVisible = true;
    
    const notice = document.createElement('div');
    notice.id = GOAL_NOTICE_ID;
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
        background: #111111;
        color: #f5f5f5;
        border-radius: 20px;
        padding: 32px;
        text-align: center;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
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
        background: #f5f5f5;
        color: #0f0f0f;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
      }
        @keyframes fgNoticeFade {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div class="fg-goal-card">
        <div class="fg-goal-icon"></div>
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
        sendBackgroundMessage('openPopup');
      });
    }
  }
  
  function hideFocusGoalNotice() {
    if (!state.focusGoalNoticeVisible) return;
    
    const notice = document.getElementById(GOAL_NOTICE_ID);
    if (notice) {
      notice.remove();
    }
    
    state.focusGoalNoticeVisible = false;
  }
  
  function injectFadeStyles() {
    if (state.fadeStylesInjected) return;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    state.fadeStylesInjected = true;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function allowCurrentSite(targetUrl) {
    const url = targetUrl || window.location.href;
    sendBackgroundMessage('allowCurrentUrl', { url })
      .then(() => {
        console.log('Site added to allow list:', url);
        hideWarningOverlay();
      })
      .catch(error => {
        console.error('Failed to add site to allow list:', error);
      });
  }
  
  function sendBackgroundMessage(action, data = {}) {
    try {
      return chrome.runtime.sendMessage({
        action,
        ...data,
        url: data.url || window.location.href
      });
    } catch (error) {
      console.error(`Failed to send background message for action ${action}:`, error);
      return Promise.resolve();
    }
  }
  
  return {
    init,
    hideWarningOverlay,
    showWarningOverlay
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', FocusGuardianContent.init);
} else {
  FocusGuardianContent.init();
}

console.log('Content script initialized (Phase 3)');
