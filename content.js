// content.js - Content Script with SPA Navigation Detection

console.log('Focus Guardian loaded on:', window.location.href);

const OVERLAY_ID = 'focus-guardian-overlay';
const GOAL_NOTICE_ID = 'focus-goal-required-notice';
const API_NOTICE_ID = 'focus-api-required-notice';

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
      
      if (response && response.source === 'no-api-key') {
        showApiKeyNotice(response);
        return;
      }
      
      hideFocusGoalNotice();
      hideApiKeyNotice();
      
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
          background: rgba(13, 16, 23, 0.65);
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          animation: fadeIn 0.3s ease;
          }
          
          @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
          }
          
          .fg-warning-card {
          background: #ffffff;
          border-radius: 28px;
          padding: 40px 42px;
          max-width: 460px;
          width: 90%;
          box-shadow: 0 45px 120px rgba(15, 23, 42, 0.25);
          text-align: center;
          animation: slideUp 0.35s ease;
          color: #0f172a;
          border: 1px solid rgba(15, 23, 42, 0.06);
          }
          
          @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
          }
          
          .fg-warning-icon {
          font-size: 56px;
          margin-bottom: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          }
          
          .fg-warning-title {
          font-size: 30px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 10px;
          }
          
          .fg-warning-message {
          font-size: 15px;
          color: #475467;
          line-height: 1.6;
          margin-bottom: 18px;
          }
          
          .fg-warning-task {
          font-size: 15px;
          color: #1849a9;
          background: #eaf1ff;
          border: 1px solid #d5e2ff;
          padding: 14px 18px;
          border-radius: 14px;
          margin: 22px 0 18px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          }
          
          .fg-warning-reason {
          font-size: 14px;
          color: #64748b;
          margin-bottom: 28px;
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
          padding: 14px 30px;
          border-radius: 999px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
          flex: 1;
          max-width: 210px;
          }
          
          .fg-button-primary {
          background: #0f172a;
          color: #ffffff;
          box-shadow: 0 18px 35px rgba(15, 23, 42, 0.25);
          }
          
          .fg-button-primary:hover {
          background: #1f2937;
          }
          
          .fg-button-secondary {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid rgba(15, 23, 42, 0.25);
          }
          
          .fg-button-secondary:hover {
          background: #0f172a;
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
          border-top: 1px solid #e2e8f0;
          font-size: 12px;
          color: #98a2b3;
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
  
  function showApiKeyNotice(data) {
    if (document.getElementById(API_NOTICE_ID)) return;
    
    const notice = document.createElement('div');
    notice.id = API_NOTICE_ID;
    notice.innerHTML = `
      <style>
        #${API_NOTICE_ID} {
          position: fixed;
          top: 12px;
          right: 12px;
          background: #fee2e2;
          color: #991b1b;
          padding: 14px 18px;
          border-radius: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
          z-index: 2147483647;
          max-width: 320px;
        }
        #${API_NOTICE_ID} button {
          margin-top: 10px;
          border: none;
          background: #991b1b;
          color: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
        }
      </style>
      <div>
        <strong>Focus needs your API key.</strong>
        <p>Please open the extension popup and add a valid Gemini API key.</p>
        <button type="button" id="focus-open-popup">Open Settings</button>
      </div>
    `;
    
    document.body.appendChild(notice);
    notice.querySelector('#focus-open-popup').addEventListener('click', () => {
      sendBackgroundMessage('openPopup');
    });
  }
  
  function hideApiKeyNotice() {
    const notice = document.getElementById(API_NOTICE_ID);
    if (notice) notice.remove();
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
