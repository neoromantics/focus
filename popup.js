// popup.js - Popup Logic with Phase 2: API Configuration

document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ Popup loaded successfully!');
  
  // Load saved data
  await loadSavedData();
  
  // Display current tab info
  await displayCurrentTab();
  
  // Setup event listeners
  setupEventListeners();
  
  // Update statistics
  updateStatistics();
});

// Load saved data from Chrome storage
async function loadSavedData() {
  try {
    const data = await chrome.storage.local.get([
      'geminiApiKey',
      'currentTask',
      'blockList',
      'pagesAnalyzed',
      'extensionEnabled'
    ]);
    
    const extensionEnabled = data.extensionEnabled !== false;
    updateExtensionStateUI(extensionEnabled);
    
    // Load API key (masked)
    if (data.geminiApiKey) {
      document.getElementById('apiKeyInput').value = data.geminiApiKey;
      updateApiStatus(true);
      document.getElementById('testApiKey').disabled = false;
    }
    
    // Load task
    if (data.currentTask) {
      document.getElementById('taskInput').value = data.currentTask;
    }
    
    // Load block list
    if (data.blockList && data.blockList.length > 0) {
      document.getElementById('blockListInput').value = data.blockList.join('\n');
      displayBlockList(data.blockList);
    }
    
    console.log('Loaded saved data:', {
      hasApiKey: !!data.geminiApiKey,
      hasTask: !!data.currentTask,
      blockListCount: data.blockList?.length || 0
    });
    
  } catch (error) {
    console.error('Error loading saved data:', error);
  }
}

// Setup all event listeners
function setupEventListeners() {
  // API Key toggle visibility
  document.getElementById('toggleKeyVisibility').addEventListener('click', () => {
    const input = document.getElementById('apiKeyInput');
    const btn = document.getElementById('toggleKeyVisibility');
    
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  });
  
  // Save API Key
  document.getElementById('saveApiKey').addEventListener('click', saveApiKey);
  
  // Test API Key
  document.getElementById('testApiKey').addEventListener('click', testApiConnection);
  
  // Save Task
  document.getElementById('saveTask').addEventListener('click', saveTask);
  
  // Save Block List
  document.getElementById('saveBlockList').addEventListener('click', saveBlockList);
  
  // Enable test button when API key is entered
  document.getElementById('apiKeyInput').addEventListener('input', (e) => {
    const hasKey = e.target.value.trim().length > 0;
    document.getElementById('testApiKey').disabled = !hasKey;
  });
  
  const extensionToggle = document.getElementById('extensionToggle');
  if (extensionToggle) {
    extensionToggle.addEventListener('change', handleExtensionToggle);
  }
}

// Save API Key
async function saveApiKey() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const messageDiv = document.getElementById('apiMessage');
  
  if (!apiKey) {
    showMessage(messageDiv, 'Please enter an API key', 'error');
    return;
  }
  
  // Basic validation (Gemini API keys typically start with "AIza")
  if (!apiKey.startsWith('AIza')) {
    showMessage(messageDiv, 'Warning: Gemini API keys usually start with "AIza"', 'warning');
  }
  
  try {
    await chrome.storage.local.set({ geminiApiKey: apiKey });
    showMessage(messageDiv, '✅ API Key saved successfully!', 'success');
    updateApiStatus(true);
    document.getElementById('testApiKey').disabled = false;
    
    console.log('API Key saved (length:', apiKey.length, ')');
    
    // Notify background script to reload configuration
    chrome.runtime.sendMessage({ 
      action: 'apiKeyUpdated'
    }).catch(err => console.log('Could not notify background:', err));
  } catch (error) {
    console.error('Error saving API key:', error);
    showMessage(messageDiv, '❌ Failed to save API key', 'error');
  }
}

// Test API Connection
async function testApiConnection() {
  const btn = document.getElementById('testApiKey');
  const messageDiv = document.getElementById('apiMessage');
  const originalText = btn.textContent;
  
  btn.disabled = true;
  btn.textContent = '🔄 Testing...';
  
  try {
    const data = await chrome.storage.local.get('geminiApiKey');
    const apiKey = data.geminiApiKey;
    
    if (!apiKey) {
      throw new Error('No API key found');
    }
    
    // Test with a simple API call (using latest gemini-2.5-flash model)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Hello! Just testing the connection. Please respond with "OK".'
            }]
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
    
    showMessage(messageDiv, '✅ Connection successful! API key is working.', 'success');
    updateApiStatus(true, 'Connected ✓');
    
  } catch (error) {
    console.error('API test failed:', error);
    showMessage(messageDiv, `❌ Connection failed: ${error.message}`, 'error');
    updateApiStatus(false);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Save Task
async function saveTask() {
  const task = document.getElementById('taskInput').value.trim();
  const messageDiv = document.getElementById('taskMessage');
  
  if (!task) {
    showMessage(messageDiv, 'Please enter your focus goal', 'error');
    return;
  }
  
  try {
    await chrome.storage.local.set({ currentTask: task });
    showMessage(messageDiv, '✅ Focus goal saved!', 'success');
    
    // Notify background script
    chrome.runtime.sendMessage({ 
      action: 'taskUpdated', 
      task: task 
    });
    
    console.log('Task saved:', task);
  } catch (error) {
    console.error('Error saving task:', error);
    showMessage(messageDiv, '❌ Failed to save goal', 'error');
  }
}

// Save Block List
async function saveBlockList() {
  const blockListText = document.getElementById('blockListInput').value.trim();
  const messageDiv = document.getElementById('blockListMessage');
  
  // Parse and clean domains
  const domains = blockListText
    .split('\n')
    .map(line => line.trim().toLowerCase())
    .filter(line => line.length > 0)
    .filter(line => {
      // Basic domain validation
      return line.includes('.') && !line.includes(' ');
    });
  
  if (domains.length === 0) {
    showMessage(messageDiv, 'Please enter at least one valid domain', 'warning');
    return;
  }
  
  try {
    await chrome.storage.local.set({ blockList: domains });
    displayBlockList(domains);
    showMessage(messageDiv, `✅ Saved ${domains.length} blocked domains!`, 'success');
    
    // Notify background script
    chrome.runtime.sendMessage({ 
      action: 'blockListUpdated', 
      blockList: domains 
    });
    
    console.log('Block list saved:', domains);
  } catch (error) {
    console.error('Error saving block list:', error);
    showMessage(messageDiv, '❌ Failed to save block list', 'error');
  }
}

// Display block list as tags
function displayBlockList(domains) {
  const container = document.getElementById('blockListDisplay');
  
  if (!domains || domains.length === 0) {
    container.innerHTML = '<span class="no-data">No domains blocked yet</span>';
    return;
  }
  
  container.innerHTML = domains.map(domain => 
    `<span class="tag">${domain}</span>`
  ).join('');
}

// Update API status indicator
function updateApiStatus(isConfigured, text = null) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  if (isConfigured) {
    indicator.textContent = '✅';
    statusText.textContent = text || 'API Key configured';
    statusText.style.color = '#28a745';
  } else {
    indicator.textContent = '⚠️';
    statusText.textContent = 'API Key not configured';
    statusText.style.color = '#dc3545';
  }
}

// Display current tab information
async function displayCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab) {
      const urlElement = document.getElementById('currentUrl');
      const url = new URL(tab.url);
      urlElement.textContent = url.hostname || tab.url;
      
      console.log('Current page:', {
        url: tab.url,
        title: tab.title,
        id: tab.id
      });
    }
  } catch (error) {
    console.error('Error getting tab info:', error);
    document.getElementById('currentUrl').textContent = 'Unable to retrieve';
  }
}

// Update statistics
async function updateStatistics() {
  try {
    const data = await chrome.storage.local.get([
      'pagesAnalyzed',
      'warningsShown',
      'timesWentBack',
      'timesContinued',
      'aiAnalysisCount'
    ]);
    
    document.getElementById('pagesAnalyzed').textContent = data.pagesAnalyzed || 0;
    document.getElementById('warningsShown').textContent = data.warningsShown || 0;
    document.getElementById('timesWentBack').textContent = data.timesWentBack || 0;
    document.getElementById('aiAnalysisCount').textContent = data.aiAnalysisCount || 0;
    
    console.log('📊 Statistics updated:', {
      pagesAnalyzed: data.pagesAnalyzed || 0,
      warningsShown: data.warningsShown || 0,
      timesWentBack: data.timesWentBack || 0,
      timesContinued: data.timesContinued || 0,
      aiAnalysisCount: data.aiAnalysisCount || 0
    });
  } catch (error) {
    console.error('Error updating statistics:', error);
  }
}

async function handleExtensionToggle(event) {
  const toggle = event.target;
  const enabled = toggle.checked;
  const messageBox = document.getElementById('toggleMessage');
  toggle.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'setExtensionEnabled',
      enabled
    });
    
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to update extension state');
    }
    
    await chrome.storage.local.set({ extensionEnabled: enabled });
    updateExtensionStateUI(enabled);
    
    if (messageBox) {
      showMessage(messageBox, enabled ? 'Focus Guardian is active' : 'Focus Guardian is paused', 'success');
    }
  } catch (error) {
    console.error('Error updating extension status:', error);
    updateExtensionStateUI(!enabled);
    if (messageBox) {
      showMessage(messageBox, 'Unable to change status. Please try again.', 'error');
    }
  } finally {
    toggle.disabled = false;
  }
}

function updateExtensionStateUI(isEnabled) {
  const toggle = document.getElementById('extensionToggle');
  const subtitle = document.getElementById('toggleSubtitle');
  const statusLabel = document.getElementById('extensionStatus');
  
  if (toggle) {
    toggle.checked = isEnabled;
  }
  
  if (subtitle) {
    subtitle.textContent = isEnabled ? 'Currently active' : 'Protection paused';
  }
  
  if (statusLabel) {
    statusLabel.textContent = isEnabled ? 'Active ✓' : 'Paused ✕';
    statusLabel.classList.toggle('active', isEnabled);
    statusLabel.classList.toggle('inactive', !isEnabled);
  }
}

// Show message helper
function showMessage(element, text, type = 'info') {
  element.textContent = text;
  element.className = `message message-${type}`;
  element.style.display = 'block';
  
  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
}

// Format URL helper
function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname;
  } catch {
    return url;
  }
}
