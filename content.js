// Content script to track modifier keys during clicks
let modifierKeysPressed = false;
let bypassTimeout = null;

// Function to set bypass with extended timeout for redirects
function setBypass(duration = 5000) {
  // Clear any existing timeout
  if (bypassTimeout) {
    clearTimeout(bypassTimeout);
  }
  
  modifierKeysPressed = true;
  
  // Notify background script
  chrome.runtime.sendMessage({ 
    action: 'setBypassExtension', 
    bypass: true 
  });
  
  // Reset after delay (longer to handle redirects)
  bypassTimeout = setTimeout(() => {
    modifierKeysPressed = false;
    chrome.runtime.sendMessage({ 
      action: 'setBypassExtension', 
      bypass: false 
    });
    bypassTimeout = null;
  }, duration);
}

// Track when modifier keys are pressed during clicks
document.addEventListener('mousedown', (event) => {
  // Check if Ctrl, Alt, or Meta (Cmd on Mac) key is pressed
  if (event.ctrlKey || event.altKey || event.metaKey) {
    // Use longer timeout (5 seconds) to handle redirects like Google Takeout
    setBypass(5000);
  }
}, true);

// Also track for click events (some sites use onclick handlers)
document.addEventListener('click', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    setBypass(5000);
  }
}, true);

// Also track keyboard for downloads triggered by Enter key
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.altKey || event.metaKey) && event.key === 'Enter') {
    setBypass(5000);
  }
});
