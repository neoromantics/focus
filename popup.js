// popup.js - Popup Logic with Phase 2: API Configuration

const ELEMENT_IDS = {
  apiKeyInput: 'apiKeyInput',
  toggleKeyVisibility: 'toggleKeyVisibility',
  saveApiKey: 'saveApiKey',
  taskInput: 'taskInput',
  saveTask: 'saveTask',
  blockListInput: 'blockListInput',
  saveBlockList: 'saveBlockList',
  allowListInput: 'allowListInput',
  saveAllowList: 'saveAllowList',
  extensionStatus: 'extensionStatus',
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
  statsPanel: 'statsPanel',
  startFlight: 'startFlight',
  endFlight: 'endFlight',
  flightStatusLabel: 'flightStatusLabel',
  flightDuration: 'flightDuration',
  flightTurbulence: 'flightTurbulence',
  flightMessage: 'flightMessage',
  flightHistoryList: 'flightHistoryList',
  flightStreak: 'flightStreak'
};

class PopupController {
  constructor() {
    this.elements = {};
    this.handleRecentGoalClick = this.handleRecentGoalClick.bind(this);
    this.handleAllowedUrlClick = this.handleAllowedUrlClick.bind(this);
    this.recentGoals = [];
    this.allowedUrls = [];
    this.flightData = null;
    this.flightHistory = [];
    this.flightTimer = null;
    this.extensionEnabled = true;
  }
  
  async init() {
    console.log('Popup loaded successfully!');
    this.cacheElements();
    this.setupEventListeners();
    await Promise.all([
      this.loadSavedData(),
      this.displayCurrentTab(),
      this.updateStatistics(),
      this.refreshFlightInfo()
    ]);
  }
  
  cacheElements() {
    Object.entries(ELEMENT_IDS).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id);
    });
  }
  
  setupEventListeners() {
    const { apiKeyInput, toggleKeyVisibility, saveApiKey, saveTask, settingsToggle, statsToggle, recentGoals, allowedUrlList, clearAllowedUrls, startFlight, endFlight } = this.elements;
    
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
      
      saveApiKey?.addEventListener('click', () => this.saveApiKey());
    }
    
    saveTask?.addEventListener('click', () => this.saveTask());
    this.elements.saveBlockList?.addEventListener('click', () => this.saveDomainList('block'));
    this.elements.saveAllowList?.addEventListener('click', () => this.saveDomainList('allow'));
    startFlight?.addEventListener('click', () => this.startFlight());
    endFlight?.addEventListener('click', () => this.endFlight());
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
  
  async refreshFlightInfo() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getFlightStatus' });
      if (!response?.success) return;
      this.applyFlightState(response);
      const { extensionEnabled } = await chrome.storage.local.get('extensionEnabled');
      const isEnabled = extensionEnabled !== false;
      this.updateExtensionStateUI(isEnabled);
    } catch (error) {
      console.error('Error fetching flight info:', error);
    }
  }
  
  async startFlight() {
    const startBtn = this.elements.startFlight;
    const messageDiv = this.elements.flightMessage;
    setButtonLoading(startBtn, true, 'Starting...');
    try {
      const settings = await chrome.storage.local.get(['geminiApiKey', 'currentTask']);
      if (!hasRequiredConfig(settings)) {
        showConfigReminder(settings, 'flightMessage');
        throw new Error('Add API key and focus goal before starting a flight.');
      }
      await this.ensureExtensionEnabled();
      const response = await chrome.runtime.sendMessage({ action: 'startFlight' });
      if (!response?.success) {
        throw new Error(response?.error || 'Unable to start flight.');
      }
      this.applyFlightState(response);
      this.showMessage(messageDiv, 'Flight started. Stay focused!', 'success');
      await this.refreshFlightInfo();
    } catch (error) {
      console.error('Failed to start flight:', error);
      this.showMessage(messageDiv, error.message || 'Unable to start flight.', 'error');
    } finally {
      setButtonLoading(startBtn, false);
    }
  }
  
  async endFlight() {
    const endBtn = this.elements.endFlight;
    const messageDiv = this.elements.flightMessage;
    setButtonLoading(endBtn, true, 'Landing...');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'endFlight' });
      if (response?.tooShort) {
        this.showMessage(messageDiv, 'Flights shorter than 3 minutes are not recorded.', 'warning');
      } else if (response?.success) {
        const outcome = response.record?.outcome || 'completed';
        const outcomeLabel = this.getOutcomeLabel(outcome);
        const messageType = outcome === 'fail' ? 'error' : outcome === 'delayed' ? 'warning' : 'success';
        this.showMessage(messageDiv, `Flight ${outcomeLabel}.`, messageType);
      } else {
        throw new Error(response?.error || 'Unable to end flight.');
      }
      this.applyFlightState(response);
      await this.refreshFlightInfo();
      try {
        await this.setExtensionEnabled(false);
      } catch (error) {
        console.warn('Unable to disable focus after landing:', error);
      }
    } catch (error) {
      console.error('Failed to end flight:', error);
      this.showMessage(messageDiv, error.message || 'Unable to end flight.', 'error');
    } finally {
      setButtonLoading(endBtn, false);
    }
  }

  applyFlightState(response = {}) {
    const normalizedFlight = normalizeFlightData(response.flight);
    this.flightData = normalizedFlight;
    if (Array.isArray(response.history)) {
      this.flightHistory = response.history;
    } else if (!this.flightHistory) {
      this.flightHistory = [];
    }
    this.updateFlightUI();
  }

  updateFlightUI() {
    const { flightStatusLabel, flightDuration, flightTurbulence, startFlight, endFlight, flightStreak } = this.elements;
    const activeFlight = this.flightData?.active;
    if (flightStatusLabel) {
      if (activeFlight) {
        flightStatusLabel.textContent = 'In flight';
      } else if (this.flightHistory?.length) {
        flightStatusLabel.textContent = `Last: ${this.getOutcomeLabel(this.flightHistory[0].outcome || 'completed')}`;
      } else {
        flightStatusLabel.textContent = 'Idle';
      }
    }
    if (flightTurbulence) {
      const limit = this.flightData?.limit || 5;
      if (activeFlight) {
        flightTurbulence.textContent = `${this.flightData?.turbulence || 0}/${limit}`;
      } else if (this.flightHistory?.length) {
        flightTurbulence.textContent = `${this.flightHistory[0].turbulence || 0}/${limit}`;
      } else {
        flightTurbulence.textContent = '0/5';
      }
    }
    if (startFlight) {
      const disabled = !!activeFlight;
      startFlight.disabled = disabled;
      startFlight.classList.toggle('disabled', disabled);
    }
    if (endFlight) {
      const disabled = !activeFlight;
      endFlight.disabled = disabled;
      endFlight.classList.toggle('disabled', disabled);
    }
    if (flightStreak) {
      const streak = this.computeFlightStreak();
      flightStreak.textContent = streak > 0 ? `${streak} perfect ${streak === 1 ? 'flight' : 'flights'}` : '';
    }
    this.updateFlightDurationDisplay(flightDuration);
    this.updateFlightHistoryList();
  }

  updateFlightDurationDisplay(durationEl) {
    const el = durationEl || this.elements.flightDuration;
    if (!el) return;
    if (this.flightData?.active && this.flightData.startedAt) {
      el.textContent = formatDuration(Date.now() - this.flightData.startedAt);
      this.startFlightTimer();
    } else {
      this.stopFlightTimer();
      if (this.flightHistory?.length) {
        el.textContent = formatDuration(this.flightHistory[0].durationMs || 0);
      } else {
        el.textContent = '0:00';
      }
    }
  }

  startFlightTimer() {
    if (this.flightTimer) return;
    this.flightTimer = setInterval(() => {
      if (!this.flightData?.active || !this.flightData.startedAt) {
        this.stopFlightTimer();
        return;
      }
      const el = this.elements.flightDuration;
      if (el) {
        el.textContent = formatDuration(Date.now() - this.flightData.startedAt);
      }
    }, 1000);
  }

  stopFlightTimer() {
    if (this.flightTimer) {
      clearInterval(this.flightTimer);
      this.flightTimer = null;
    }
  }

  updateFlightHistoryList() {
    const container = this.elements.flightHistoryList;
    if (!container) return;
    if (!this.flightHistory || this.flightHistory.length === 0) {
      container.innerHTML = '<span class="no-data">No flights yet</span>';
      return;
    }
    container.innerHTML = this.flightHistory
      .map((record) => this.renderFlightHistoryItem(record))
      .join('');
  }

  renderFlightHistoryItem(record = {}) {
    const goal = record.goalSnapshot || 'Focus flight';
    const duration = formatDuration(record.durationMs || 0);
    const outcome = record.outcome || 'completed';
    const drops = record.turbulence || 0;
    const badgeClass = `flight-badge ${outcome}`;
    const badgeLabel = this.getOutcomeLabel(outcome);
    const timestamp = record.completedAt ? new Date(record.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const metaPieces = [`${duration}`, `${drops} drops`];
    if (timestamp) metaPieces.push(timestamp);
    return `
      <div class="flight-history-item">
        <div class="flight-history-details">
          <span class="flight-history-title">${escapeHtml(goal)}</span>
          <span class="flight-history-meta">${escapeHtml(metaPieces.join(' · '))}</span>
        </div>
        <span class="${badgeClass}">${escapeHtml(badgeLabel)}</span>
      </div>
    `;
  }

  computeFlightStreak() {
    let streak = 0;
    for (const record of this.flightHistory || []) {
      if (record.outcome === 'perfect') {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }

  getOutcomeLabel(outcome) {
    switch (outcome) {
      case 'perfect':
        return 'Perfect landing';
      case 'delayed':
        return 'Delayed arrival';
      case 'fail':
        return 'Emergency landing';
      default:
        return 'Completed';
    }
  }

  async ensureExtensionEnabled() {
    if (this.extensionEnabled) return;
    await this.setExtensionEnabled(true);
  }

  async setExtensionEnabled(enabled) {
    if (this.extensionEnabled === enabled) {
      this.updateExtensionStateUI(enabled);
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'setExtensionEnabled',
        enabled
      });
      if (!response?.success) {
        throw new Error(response?.error || 'Unable to update focus state');
      }
      await chrome.storage.local.set({ extensionEnabled: enabled });
      this.updateExtensionStateUI(enabled);
    } catch (error) {
      console.error('Failed to update extension state:', error);
      throw error;
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
      console.log('API Key saved (length:', apiKey.length, ')');
      
      chrome.runtime.sendMessage({ action: 'apiKeyUpdated'}).catch(err => {
        console.log('Could not notify background:', err);
      });
      await this.verifyApiKey(apiKey);
    } catch (error) {
      console.error('Error saving API key:', error);
      this.updateApiStatus(false);
      this.showMessage(messageDiv, error.message ? `Failed to verify API key: ${error.message}` : 'Failed to save API key', 'error');
    }
  }
  
  async verifyApiKey(apiKey) {
    const messageDiv = this.elements.apiMessage;
    this.showMessage(messageDiv, 'Verifying API key...', 'info');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Hello! Just testing the connection. Please respond with "OK".' }]
          }]
        })
      }
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'API request failed');
    }
    const result = await response.json();
    console.log('API verification successful:', result);
    this.updateApiStatus(true, 'Connected');
    this.showMessage(messageDiv, 'API key verified! Connection successful.', 'success');
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
  
  updateExtensionStateUI(isEnabled) {
    this.extensionEnabled = isEnabled;
    const { extensionStatus } = this.elements;
    if (extensionStatus) {
      extensionStatus.textContent = isEnabled ? 'Active' : 'Paused';
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

function normalizeFlightData(flight) {
  if (!flight) return null;
  const limit = flight.limit || 5;
  const status = flight.status || (flight.active ? 'inflight' : 'idle');
  const active = flight.active ?? status === 'inflight';
  return {
    ...flight,
    limit,
    status,
    active
  };
}

function formatDuration(ms = 0) {
  if (!ms || ms < 0) {
    return '0:00';
  }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showConfigReminder(data, targetElementId = 'flightMessage') {
  const missing = [];
  if (!data.geminiApiKey) missing.push('API key');
  if (!data.currentTask) missing.push('focus goal');
  if (!missing.length) return;
  
  const message = `Focus is on, but ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing. Please update Settings.`;
  const target = document.getElementById(targetElementId);
  if (target) {
    target.className = 'message message-warning';
    target.style.display = 'block';
    target.textContent = message;
  }
}

function hasRequiredConfig(data = {}) {
  return !!(data.geminiApiKey && data.currentTask);
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
