// ai-helper.js - Gemini AI Integration Helper

/**
 * Analyze if a page is distracting based on user's focus goal
 * @param {Object} pageInfo - Page information (url, title, description, textPreview)
 * @param {string} focusGoal - User's current focus goal
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Object>} Analysis result
 */
async function analyzePageWithAI(pageInfo, focusGoal, apiKey) {
  try {
    // Build the analysis prompt
    const prompt = buildAnalysisPrompt(pageInfo, focusGoal);
    
    // Call Gemini API
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
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3, // Lower temperature for more consistent responses
            maxOutputTokens: 100, // Short response needed
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
    
    console.log('🤖 AI Response:', aiResponse);
    
    // Parse AI response
    return parseAIResponse(aiResponse, pageInfo);
    
  } catch (error) {
    console.error('AI Analysis Error:', error);
    throw error;
  }
}

/**
 * Build the analysis prompt for Gemini
 */
function buildAnalysisPrompt(pageInfo, focusGoal) {
  return `You are a focus assistant helping users stay on track with their goals.

USER'S CURRENT GOAL: "${focusGoal}"

WEBSITE INFORMATION:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}
- Description: ${pageInfo.description || 'N/A'}
- Content Preview: ${pageInfo.textPreview ? pageInfo.textPreview.substring(0, 300) : 'N/A'}

TASK: Analyze if this website is likely to DISTRACT the user from their goal.

GUIDELINES:
- If the site is relevant to their goal → NOT a distraction
- If the site is entertainment/social media unrelated to goal → IS a distraction
- If the site is news/general browsing unrelated to goal → IS a distraction
- If uncertain, lean towards allowing access

RESPOND WITH ONLY ONE OF THESE:
- "DISTRACTION" - if the site will likely distract from the goal
- "ON_TRACK" - if the site is relevant to the goal or neutral work/research

Your response (DISTRACTION or ON_TRACK):`;
}

/**
 * Parse AI response into structured result
 */
function parseAIResponse(aiResponse, pageInfo) {
  const response = aiResponse.trim().toUpperCase();
  
  // Check for clear distraction signal
  const isDistraction = response.includes('DISTRACTION');
  
  // Extract reasoning if AI provided it
  let reason = 'AI analysis complete';
  if (aiResponse.length > 20) {
    // AI might have provided explanation
    const lines = aiResponse.split('\n');
    if (lines.length > 1) {
      reason = lines.slice(1).join(' ').trim() || reason;
    }
  }
  
  return {
    shouldWarn: isDistraction,
    isDistraction: isDistraction,
    reason: isDistraction ? 'AI detected this might distract from your goal' : 'Site appears relevant to your goal',
    aiReasoning: reason,
    timestamp: Date.now()
  };
}

/**
 * Check if URL should skip AI analysis
 */
function shouldSkipAIAnalysis(url) {
  try {
    const hostname = new URL(url).hostname;
    
    // Skip common work/productivity sites
    const allowedDomains = [
      'google.com',
      'gmail.com',
      'drive.google.com',
      'docs.google.com',
      'github.com',
      'stackoverflow.com',
      'localhost'
    ];
    
    return allowedDomains.some(domain => hostname.includes(domain));
  } catch {
    return true; // Skip invalid URLs
  }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzePageWithAI,
    shouldSkipAIAnalysis
  };
}
