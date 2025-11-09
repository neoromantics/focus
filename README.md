# Focus Guardian

## Overview
Focus Guardian is a Chrome MV3 extension that uses Gemini AI plus user-defined rules to detect distracting sites and keep you aligned with a stated focus goal. It injects an overlay warning inside distracting pages, offers instant allow/block management, and keeps stats on how you respond.

## Key Components

- `manifest.json` – Declares the MV3 setup: background service worker (`background.js`), global content script (`content.js`), popup UI (`popup.html`), and the storage/tabs/host permissions required to analyze pages.
- `background.js` – Core service worker that loads configuration from `chrome.storage`, tracks stats, caches AI decisions, and orchestrates the distraction analysis pipeline.
- `content.js` – Runs on every page, detects SPA URL changes, gathers the DOM HTML, asks the background script for a decision, and renders/removes warning overlays or “set your goal” notices.
- `popup.html` / `popup.js` / `styles.css` – User interface to enter the Gemini API key, define the current goal, manage block/allow lists, toggle protection, and inspect statistics.
- Helper scripts:
  - `ai-helper.js` – Legacy Gemini helper (Node-friendly) with prompt/response parsing logic for development scripts.
  - `api-config.js` – Shared constants for Gemini endpoints/models (currently unused in MV3 runtime but helpful for tooling).
  - `debug-pageinfo.js` – Copy-paste snippet for browser consoles to see what data would be sent to the AI.

## How Distraction Detection Works
1. **Content script trigger**: On first load or detected SPA navigation, `content.js` sends `{ action: 'checkUrl', url, html }` to the background worker.
2. **Background pipeline** (`background.js:312-458`):
   - Skips work if the extension is toggled off or URL parsing fails.
   - Increments `pagesAnalyzed`, then enforces strict block list and allow list decisions.
   - Looks up cached AI decisions (1-hour TTL, trimmed to 50 entries) before hitting the model.
   - Skips analysis for common productivity domains (`docs.google.com`, `gmail.com`, etc.) or anything on the user allow list.
   - Requires both a saved Gemini API key and a current focus goal; otherwise returns reasons like `no-api-key` or `no-task`.
   - If all prerequisites are met, sends the first 30k characters of HTML along with metadata to Gemini Flash Lite.
3. **Gemini call** (`background.js:482-706`):
   - Builds a strict prompt outlining rules (social/entertainment = distraction unless aligned with the goal, etc.) and injects recent page info.
   - Requests JSON-only output using `responseMimeType: "application/json"` and validates the schema (`{ isDistraction, confidence, reason }`).
   - Retries up to 3 times; falls back to heuristic parsing if JSON parsing fails, and defaults to allowing the site if all attempts fail.
   - Successful outcomes increment `aiAnalysisCount`, are cached per URL, and returned to the content script.
4. **Overlay + actions**:
   - If `shouldWarn` is true, `content.js` injects a full-screen card with “Go Back”, “Continue”, and “Always allow” controls and sends telemetry (`warningShown`, `userWentBack`, `userContinued`).
   - Choosing “Always allow” adds the hostname to storage, updates the background allow list, and caches an allow decision for the specific URL.
   - If the response indicates `source: 'no-task'`, the content script shows a modal prompting the user to open the popup to set a goal.

## User Configuration Flow
- **API key**: Stored in `chrome.storage.local.geminiApiKey`, validated via the popup’s “Test Connection” button (which performs a real Gemini call).
- **Focus goal**: Stored as `currentTask`. Updating it clears the cached AI decisions so new sites will be re-analyzed with the fresh goal.
- **Block/Allow lists**: Text areas accept newline- or comma-separated domains (basic sanitization/normalization). Updates propagate to the background worker via runtime messages.
- **Toggle**: Switch in the popup sets `extensionEnabled`, immediately reflected in the background `config.enabled`. When disabled, the content script hides overlays and stops asking for checks until re-enabled.

## Statistics & Persistence
- Stats tracked: `pagesAnalyzed`, `warningsShown`, `timesWentBack`, `timesContinued`, and `aiAnalysisCount`.
- `statsManager` keeps in-memory counters for quick reads and persists them on every increment plus a 5-minute interval flush.
- `cacheManager` stores AI decisions keyed by URL with timestamps, regularly pruned via an hourly interval.
- Both stats and cache survive service-worker restarts because they’re mirrored to `chrome.storage.local`.

## Data Sent to Gemini
- **Content captured**: On each check, the content script collects the current page URL and full DOM HTML (`document.documentElement.outerHTML`). No other page-side data is gathered.
- **Pre-processing** (`background.js:492-535`):
  - Trims HTML to the first 30,000 characters to cap payload size.
  - Extracts `<title>` text and the `<meta name="description">` content via regex.
  - Builds a prompt that embeds: the user’s current focus goal, the page URL/title/description, strict distraction rules, several examples, and a 5,000-character snippet of the HTML body.
- **API request** (`background.js:537-575`):
  ```json
  {
    "contents": [
      { "parts": [{ "text": "<prompt with goal + metadata + HTML snippet>" }] }
    ],
    "generationConfig": {
      "temperature": 0.1,
      "maxOutputTokens": 100,
      "responseMimeType": "application/json",
      "responseSchema": {
        "type": "object",
        "properties": {
          "isDistraction": { "type": "boolean" },
          "confidence": { "type": "number" },
          "reason": { "type": "string" }
        },
        "required": ["isDistraction", "confidence", "reason"]
      }
    }
  }
  ```
  - Request URL: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=<API_KEY>`.
  - The payload contains only the focus goal string and the trimmed HTML snippet (plus derived metadata) needed for the distraction judgment.

## Development Tips
- Use `debug-pageinfo.js` in a page console to inspect the payload Focus Guardian would send to the AI.
- The extension logs detailed progress in both the background and content contexts (`chrome://extensions` > Inspect views).
- When testing Gemini integration, supply a valid API key (likely prefixed with `AIza`). Without it, the background worker falls back to allowing every site and the content script will log `source: 'no-api-key'`.
