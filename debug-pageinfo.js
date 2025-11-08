// Debug script - Run this in browser console (F12) on YouTube

// Get the page info that would be sent to AI
function debugPageInfo() {
  console.log('=== PAGE INFO SENT TO AI ===');
  
  const pageInfo = {
    url: window.location.href,
    hostname: window.location.hostname,
    title: document.title,
    description: getMetaDescription(),
    textPreview: getTextPreview(),
    timestamp: new Date().toISOString()
  };
  
  console.log('1. URL:', pageInfo.url);
  console.log('2. Hostname:', pageInfo.hostname);
  console.log('3. Title:', pageInfo.title);
  console.log('4. Description:', pageInfo.description);
  console.log('5. Text Preview (first 500 chars):', pageInfo.textPreview.substring(0, 500));
  console.log('6. Text Preview Length:', pageInfo.textPreview.length, 'characters');
  
  console.log('\n=== FULL PAGE INFO OBJECT ===');
  console.log(JSON.stringify(pageInfo, null, 2));
  
  return pageInfo;
}

function getMetaDescription() {
  const metaDesc = document.querySelector('meta[name="description"]');
  return metaDesc ? metaDesc.content : '';
}

function getTextPreview() {
  let text = '';
  
  const mainContent = document.querySelector('main, article, [role="main"], #content, .content');
  if (mainContent) {
    text = mainContent.innerText || mainContent.textContent || '';
  } else {
    text = document.body.innerText || document.body.textContent || '';
  }
  
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
  
  return text.substring(0, 1000);
}

// Run it
debugPageInfo();
