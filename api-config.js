// api-config.js - Gemini API Configuration

// Current Gemini Models (as of November 2025)
const GEMINI_MODELS = {
  FLASH: 'gemini-2.5-flash-lite', // Latest fast model (recommended)
  PRO: 'gemini-2.5-pro',          // Latest pro model
  FLASH_LEGACY: 'gemini-1.5-flash' // Legacy flash model
};

// Default model for the extension
const DEFAULT_MODEL = GEMINI_MODELS.FLASH;

// API Configuration
const API_CONFIG = {
  BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
  MODEL: DEFAULT_MODEL,
  MAX_RETRIES: 3,
  TIMEOUT: 10000 // 10 seconds
};

// Build API endpoint URL
function getApiEndpoint(model = DEFAULT_MODEL) {
  return `${API_CONFIG.BASE_URL}/models/${model}:generateContent`;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GEMINI_MODELS, DEFAULT_MODEL, API_CONFIG, getApiEndpoint };
}
