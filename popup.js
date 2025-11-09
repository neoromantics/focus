// popup.js - Popup Logic with Phase 2: API Configuration

const ELEMENT_IDS = {
  apiKeyInput: 'apiKeyInput',
  toggleKeyVisibility: 'toggleKeyVisibility',
  testApiKey: 'testApiKey',
  saveApiKey: 'saveApiKey',
  taskInput: 'taskInput',
  saveTask: 'saveTask',
  blockListInput: 'blockListInput',
  saveBlockList: 'saveBlockList',
  allowListInput: 'allowListInput',
  saveAllowList: 'saveAllowList',
  extensionToggle: 'extensionToggle',
  extensionStatus: 'extensionStatus',
  toggleMessage: 'toggleMessage',
  apiMessage: 'apiMessage',
  taskMessage: 'taskMessage',
  blockListMessage: 'blockListMessage',
  allowListMessage: 'allowListMessage',
  statusIndicator: 'statusIndicator',
  statusText: 'statusText',
  currentUrl: 'currentUrl',
  pagesAnalyzed: 'pagesAnalyzed',
  warningsShown: 'warningsShown',
  timesWentBack: 'timesWentBack',
  timesContinued: 'timesContinued',
  aiAnalysisCount: 'aiAnalysisCount',
  blockListDisplay: 'blockListDisplay',
  allowListDisplay: 'allowListDisplay',
  allowedUrlList: 'allowedUrlList',
  clearAllowedUrls: 'clearAllowedUrls',
  allowedUrlMessage: 'allowedUrlMessage',
  recentGoals: 'recentGoals',
  settingsToggle: 'settingsToggle',
  settingsPanel: 'settingsPanel',
  statsToggle: 'statsToggle',
  statsPanel: 'statsPanel'
};

class PopupController {
  constructor() {
    this.elements = {};
    this.handleExtensionToggle = this.handleExtensionToggle.bind(this);
    this.onApiInputChanged = this.onApiInputChanged.bind(this);
    this.handleRecentGoalClick = this.handleRecentGoalClick.bind(this);
    this.handleAllowedUrlClick = this.handleAllowedUrlClick.bind(this);
    this.recentGoals = [];
    this.allowedUrls = [];
  }
  
  async init() {
    console.log('Popup loaded successfully!');
    this.cacheElements();
    this.setupEventListeners();
    await Promise.all([
      this.loadSavedData(),
      this.displayCurrentTab(),
      this.updateStatistics()
    ]);
  }
  
  cacheElements() {
    Object.entries(ELEMENT_IDS).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id);
    });
  }
  
  setupEventListeners() {
    const { apiKeyInput, toggleKeyVisibility, saveApiKey, testApiKey, saveTask, extensionToggle, settingsToggle, statsToggle, recentGoals, allowedUrlList, clearAllowedUrls } = this.elements;
    
    settingsToggle?.addEventListener('click', () => this.toggleSettingsPanel());
    statsToggle?.addEventListener('click', () => this.toggleStatsPanel());
    recentGoals?.addEventListener('click', this.handleRecentGoalClick);
    allowedUrlList?.addEventListener('click', this.handleAllowedUrlClick);
    clearAllowedUrls?.addEventListener('click', () => this.clearAllowedUrls());
    
    if (apiKeyInput) {
      toggleKeyVisibility?.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text': 'password';
        toggleKeyVisibility.textContent = isPassword ? 'Hide' : 'Show';
      });
      
      apiKeyInput.addEventListener('input', this.onApiInputChanged);
      saveApiKey?.addEventListener('click', () => this.saveApiKey());
      testApiKey?.addEventListener('click', () => this.testApiConnection());
    }
    
    saveTask?.addEventListener('click', () => this.saveTask());
    this.elements.saveBlockList?.addEventListener('click', () => this.saveDomainList('block'));
    this.elements.saveAllowList?.addEventListener('click', () => this.saveDomainList('allow'));
    extensionToggle?.addEventListener('change', this.handleExtensionToggle);
  }
  
  async loadSavedData() {
    try {
      const data = await chrome.storage.local.get([
        'geminiApiKey',
        'currentTask',
        'blockList',
        'allowList',
        'pagesAnalyzed',
        'extensionEnabled',
        'recentTasks',
        'allowedUrls'
      ]);
      
      const extensionEnabled = data.extensionEnabled !== false;
      this.updateExtensionStateUI(extensionEnabled);
      
      if (data.geminiApiKey && this.elements.apiKeyInput) {
        this.elements.apiKeyInput.value = data.geminiApiKey;
        this.updateApiStatus(true);
        if (this.elements.testApiKey) {
          this.elements.testApiKey.disabled = false;
        }
      }
      
      if (data.currentTask && this.elements.taskInput) {
        this.elements.taskInput.value = data.currentTask;
      }
      
      if (data.blockList && data.blockList.length > 0 && this.elements.blockListInput) {
        this.elements.blockListInput.value = data.blockList.join('\n');
        this.displayBlockList(data.blockList);
      }
      
      if (data.allowList && data.allowList.length > 0 && this.elements.allowListInput) {
        this.elements.allowListInput.value = data.allowList.join('\n');
        this.displayAllowList(data.allowList);
      }
      
      this.recentGoals = Array.isArray(data.recentTasks) ? data.recentTasks : [];
      this.allowedUrls = Array.isArray(data.allowedUrls) ? data.allowedUrls : [];
      this.renderRecentGoals();
      this.renderAllowedUrls();
      
      if (extensionEnabled && (!data.geminiApiKey || !data.currentTask)) {
        showConfigReminder(data);
      }
      
      console.log('Loaded saved data:', {
        hasApiKey: !!data.geminiApiKey,
        hasTask: !!data.currentTask,
        blockListCount: data.blockList?.length || 0,
        allowListCount: data.allowList?.length || 0
      });
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  }
  
  async saveApiKey() {
    const apiKey = (this.elements.apiKeyInput?.value || '').trim();
    const messageDiv = this.elements.apiMessage;
    
    if (!apiKey) {
      this.showMessage(messageDiv, 'Please enter an API key', 'error');
      return;
    }
    
    if (!apiKey.startsWith('AIza')) {
      this.showMessage(messageDiv, 'Warning: Gemini API keys usually start with "AIza"', 'warning');
    }
    
    try {
      await chrome.storage.local.set({ geminiApiKey: apiKey });
      this.showMessage(messageDiv, 'API Key saved successfully!', 'success');
      this.updateApiStatus(true);
      if (this.elements.testApiKey) {
        this.elements.testApiKey.disabled = false;
      }
      
      console.log('API Key saved (length:', apiKey.length, ')');
      
      chrome.runtime.sendMessage({ action: 'apiKeyUpdated'}).catch(err => {
        console.log('Could not notify background:', err);
      });
    } catch (error) {
      console.error('Error saving API key:', error);
      this.showMessage(messageDiv, 'Failed to save API key', 'error');
    }
  }
  
  async testApiConnection() {
    if (!this.elements.testApiKey) return;
    const messageDiv = this.elements.apiMessage;
    
    setButtonLoading(this.elements.testApiKey, true, 'Testing...');
    
    try {
      const data = await chrome.storage.local.get('geminiApiKey');
      const apiKey = data.geminiApiKey;
      
      if (!apiKey) {
        throw new Error('No API key found');
      }
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json'},
          body: JSON.stringify({
            contents: [{
              parts: [{ text: 'Hello! Just testing the connection. Please respond with "OK".'}]
            }]
          })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }
      
      const result = await response.json();
      console.log('API Test successful:', result);
      
      this.showMessage(messageDiv, 'Connection successful! API key is working.', 'success');
      this.updateApiStatus(true, 'Connected ');
    } catch (error) {
      console.error('API test failed:', error);
      this.showMessage(messageDiv, ` Connection failed: ${error.message}`, 'error');
      this.updateApiStatus(false);
    } finally {
      setButtonLoading(this.elements.testApiKey, false);
    }
  }
  
  async saveTask() {
    const task = (this.elements.taskInput?.value || '').trim();
    const messageDiv = this.elements.taskMessage;
    
    if (!task) {
      this.showMessage(messageDiv, 'Please enter your focus goal', 'error');
      return;
    }
    
    try {
      await chrome.storage.local.set({ currentTask: task });
      this.showMessage(messageDiv, 'Focus goal saved!', 'success');
      
      chrome.runtime.sendMessage({ action: 'taskUpdated', task }).catch(() => {});
      console.log('Task saved:', task);
      this.registerRecentGoal(task);
    } catch (error) {
      console.error('Error saving task:', error);
      this.showMessage(messageDiv, 'Failed to save goal', 'error');
    }
  }
  
  async saveDomainList(listType) {
    const config = this.getListConfig(listType);
    if (!config?.inputEl) return;
    
    const domains = parseDomainList(config.inputEl.value.trim());
    const storagePayload = { [config.storageKey]: domains };
    
    try {
      await chrome.storage.local.set(storagePayload);
      config.displayFn(domains);
      
      const successMessage = domains.length === 0
        ? config.clearedMessage
        : `Saved ${domains.length} ${config.noun} domains!`;
      this.showMessage(config.messageEl, successMessage, 'success');
      
      chrome.runtime.sendMessage({
        action: config.runtimeAction,
        [config.storageKey]: domains
      }).catch(() => {});
      
      console.log(`${config.logLabel} saved:`, domains);
    } catch (error) {
      console.error(`Error saving ${config.logLabel.toLowerCase()}:`, error);
      this.showMessage(config.messageEl, `Failed to save ${config.logLabel.toLowerCase()}`, 'error');
    }
  }
  
  getListConfig(listType) {
    const isBlockList = listType === 'block';
    const storageKey = isBlockList ? 'blockList' : 'allowList';
    
    return {
      inputEl: isBlockList ? this.elements.blockListInput : this.elements.allowListInput,
      messageEl: isBlockList ? this.elements.blockListMessage : this.elements.allowListMessage,
      storageKey,
      runtimeAction: isBlockList ? 'blockListUpdated' : 'allowListUpdated',
      displayFn: isBlockList ? this.displayBlockList.bind(this) : this.displayAllowList.bind(this),
      clearedMessage: isBlockList ? 'Block list cleared.' : 'Allow list cleared.',
      noun: isBlockList ? 'blocked' : 'allowed',
      logLabel: isBlockList ? 'Block list' : 'Allow list'
    };
  }
  
  displayBlockList(domains) {
    const container = this.elements.blockListDisplay;
    if (!container) return;
    
    if (!domains || domains.length === 0) {
      container.innerHTML = '<span class="no-data">No domains blocked yet</span>';
      return;
    }
    
    container.innerHTML = domains.map(domain => `<span class="tag">${domain}</span>`).join('');
  }
  
  displayAllowList(domains) {
    const container = this.elements.allowListDisplay;
    if (!container) return;
    
    if (!domains || domains.length === 0) {
      container.innerHTML = '<span class="no-data">No domains allowed yet</span>';
      return;
    }
    
    container.innerHTML = domains.map(domain => `<span class="tag tag-allow">${domain}</span>`).join('');
  }
  
  updateApiStatus(isConfigured, text = null) {
    const indicator = this.elements.statusIndicator;
    const statusText = this.elements.statusText;
    
    if (!indicator || !statusText) return;
    
    if (isConfigured) {
      indicator.textContent = '';
      statusText.textContent = text || 'API Key configured';
      statusText.style.color = '#28a745';
    } else {
      indicator.textContent = '';
      statusText.textContent = 'API Key not configured';
      statusText.style.color = '#dc3545';
    }
  }
  
  async displayCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && this.elements.currentUrl) {
        const url = new URL(tab.url);
        this.elements.currentUrl.textContent = url.hostname || tab.url;
        
        console.log('Current page:', {
          url: tab.url,
          title: tab.title,
          id: tab.id
        });
      }
    } catch (error) {
      console.error('Error getting tab info:', error);
      if (this.elements.currentUrl) {
        this.elements.currentUrl.textContent = 'Unable to retrieve';
      }
    }
  }
  
  async updateStatistics() {
    try {
      const data = await chrome.storage.local.get([
        'pagesAnalyzed',
        'warningsShown',
        'timesWentBack',
        'timesContinued',
        'aiAnalysisCount'
      ]);
      
      const statFields = {
        pagesAnalyzed: data.pagesAnalyzed || 0,
        warningsShown: data.warningsShown || 0,
        timesWentBack: data.timesWentBack || 0,
        timesContinued: data.timesContinued || 0,
        aiAnalysisCount: data.aiAnalysisCount || 0
      };
      
      Object.entries(statFields).forEach(([key, value]) => {
        if (this.elements[key]) {
          this.elements[key].textContent = value;
        }
      });
      
      console.log('Statistics updated:', statFields);
    } catch (error) {
      console.error('Error updating statistics:', error);
    }
  }
  
  async handleExtensionToggle(event) {
    const toggle = event.target;
    const enabled = toggle.checked;
    const messageBox = this.elements.toggleMessage;
    toggle.disabled = true;
    
    if (messageBox) {
      messageBox.style.display = 'none';
      messageBox.textContent = '';
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'setExtensionEnabled',
        enabled
      });
      
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to update extension state');
      }
      
      await chrome.storage.local.set({ extensionEnabled: enabled });
      this.updateExtensionStateUI(enabled);
      if (enabled) {
        const data = await chrome.storage.local.get(['geminiApiKey', 'currentTask']);
        if (!data.geminiApiKey || !data.currentTask) {
          showConfigReminder(data);
        }
      }
    } catch (error) {
      console.error('Error updating extension status:', error);
      this.updateExtensionStateUI(!enabled);
      if (messageBox) {
        this.showMessage(messageBox, 'Unable to change status. Please try again.', 'error');
      }
    } finally {
      toggle.disabled = false;
    }
  }
  
  updateExtensionStateUI(isEnabled) {
    const { extensionToggle, extensionStatus } = this.elements;
    
    if (extensionToggle) {
      extensionToggle.checked = isEnabled;
    }
    
    
    if (extensionStatus) {
      extensionStatus.textContent = isEnabled ? 'Active ': 'Paused ';
      extensionStatus.classList.toggle('active', isEnabled);
      extensionStatus.classList.toggle('inactive', !isEnabled);
    }
  }
  
  showMessage(element, text, type = 'info') {
    if (!element) return;
    element.textContent = text;
    element.className = `message message-${type}`;
    element.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => {
        element.style.display = 'none';
      }, 5000);
    }
  }
  
  onApiInputChanged(event) {
    if (!this.elements.testApiKey) return;
    const hasKey = event.target.value.trim().length > 0;
    this.elements.testApiKey.disabled = !hasKey;
  }

  toggleSettingsPanel() {
    const panel = this.elements.settingsPanel;
    const button = this.elements.settingsToggle;
    if (!panel || !button) return;
    
    const isHidden = panel.classList.toggle('hidden');
    button.textContent = isHidden ? 'Settings': 'Hide Settings';
    button.setAttribute('aria-expanded', String(!isHidden));
  }

  toggleStatsPanel() {
    const panel = this.elements.statsPanel;
    const button = this.elements.statsToggle;
    if (!panel || !button) return;
    
    const isHidden = panel.classList.toggle('hidden');
    button.textContent = isHidden ? 'Stats': 'Hide Stats';
    button.setAttribute('aria-expanded', String(!isHidden));
  }
  
  registerRecentGoal(goal) {
    const trimmed = (goal || '').trim();
    if (!trimmed) return;
    
    const filtered = this.recentGoals.filter(item => item.toLowerCase() !== trimmed.toLowerCase());
    this.recentGoals = [trimmed, ...filtered].slice(0, 5);
    chrome.storage.local.set({ recentTasks: this.recentGoals });
    this.renderRecentGoals();
  }
  
  renderRecentGoals() {
    const container = this.elements.recentGoals;
    if (!container) return;
    
    if (!this.recentGoals.length) {
      container.innerHTML = '<span class="no-data">Recent goals will appear here</span>';
      return;
    }
    
    container.innerHTML = this.recentGoals
      .map(goal => `
        <button type="button" class="recent-goal" data-goal="${escapeHtml(goal)}">
          <span class="label">${escapeHtml(goal)}</span>
          <span class="recent-goal-remove" data-remove="${escapeHtml(goal)}">×</span>
        </button>
      `)
      .join('');
  }
  
  handleRecentGoalClick(event) {
    const removeTarget = event.target.closest('.recent-goal-remove');
    if (removeTarget) {
      const goalToRemove = removeTarget.dataset.remove || '';
      this.recentGoals = this.recentGoals.filter(goal => goal !== goalToRemove);
      chrome.storage.local.set({ recentTasks: this.recentGoals });
      this.renderRecentGoals();
      return;
    }
    
    const button = event.target.closest('button[data-goal]');
    if (!button) return;
    const goal = button.dataset.goal || '';
    if (this.elements.taskInput) {
      this.elements.taskInput.value = goal;
      this.saveTask();
    }
  }
  
  renderAllowedUrls() {
    const container = this.elements.allowedUrlList;
    if (!container) return;
    
    if (!this.allowedUrls.length) {
      container.innerHTML = '<span class="no-data">No pages allowed yet</span>';
      return;
    }
    
    container.innerHTML = this.allowedUrls
      .map(signature => {
        const label = formatAllowedSignature(signature);
        return `
          <span class="tag allowed-page" data-signature="${signature}">
            ${escapeHtml(label)}
            <button type="button" class="tag-remove" data-remove="${signature}">×</button>
          </span>
        `;
      })
      .join('');
  }
  
  handleAllowedUrlClick(event) {
    const removeBtn = event.target.closest('.tag-remove');
    if (!removeBtn) return;
    const signature = removeBtn.dataset.remove;
    if (!signature) return;
    this.removeAllowedUrl(signature);
  }
  
  async removeAllowedUrl(signature) {
    this.allowedUrls = this.allowedUrls.filter(item => item !== signature);
    await this.syncAllowedUrls('Allowed page removed.');
  }
  
  async clearAllowedUrls() {
    if (!this.allowedUrls.length) return;
    this.allowedUrls = [];
    await this.syncAllowedUrls('Cleared allowed pages.');
  }
  
  async syncAllowedUrls(successMessage) {
    const messageDiv = this.elements.allowedUrlMessage;
    try {
      await chrome.storage.local.set({ allowedUrls: this.allowedUrls });
      this.renderAllowedUrls();
      this.showMessage(messageDiv, successMessage, 'success');
      chrome.runtime.sendMessage({ action: 'allowedUrlsUpdated', allowedUrls: this.allowedUrls }).catch(() => {});
    } catch (error) {
      console.error('Failed to update allowed URLs:', error);
      this.showMessage(messageDiv, 'Unable to update allowed pages.', 'error');
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseDomainList(text) {
  if (!text) {
    return [];
  }
  
  const domainRegex = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
  const candidates = text
    .split(/[\n,]/)
    .map(line => line.trim().toLowerCase())
    .filter(Boolean)
    .map(entry => entry.replace(/^https?:\/\//, ''))
    .map(entry => entry.replace(/^www\./, ''))
    .map(entry => entry.replace(/\/.*$/, ''))
    .map(entry => entry.replace(/\s+/g, ''));
  
  return Array.from(new Set(
    candidates.filter(candidate => domainRegex.test(candidate))
  ));
}

function formatAllowedSignature(signature = '') {
  const parts = signature.split('|');
  if (parts.length < 2) {
    return signature;
  }
  const [host, path, key, value] = parts;
  if (key && value) {
    return `${host}${path} (${key}=${value})`;
  }
  return `${host}${path}`;
}

function showConfigReminder(data) {
  const missing = [];
  if (!data.geminiApiKey) missing.push('API key');
  if (!data.currentTask) missing.push('focus goal');
  if (!missing.length) return;
  
  const message = `Focus is on, but ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing. Please update Settings.`;
  const toggleMsg = document.getElementById('toggleMessage');
  if (toggleMsg) {
    toggleMsg.className = 'message message-warning';
    toggleMsg.style.display = 'block';
    toggleMsg.textContent = message;
  }
}

function setButtonLoading(button, isLoading, loadingLabel) {
  if (!button) return;
  
  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    if (loadingLabel) {
      button.textContent = loadingLabel;
    }
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
  
  button.disabled = isLoading;
}

const popupController = new PopupController();
document.addEventListener('DOMContentLoaded', () => popupController.init());
