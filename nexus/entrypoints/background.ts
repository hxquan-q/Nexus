/**
 * Background service worker
 * Handles sidepanel open on action click, message routing, and browser control.
 * Also handles content script messages for screenshot capture, selection actions,
 * and area cropping.
 *
 * Manifest V3 resilience:
 * - Uses chrome.alarms to keep SW alive during long operations
 * - Stores in-progress state in chrome.storage.session
 * - Re-registers context menus on both install and startup
 */

import { getControlManager } from '../background/control/index';
import { cropScreenshotArea } from '../utils/screenshotCapture';

// ============================================================
// Alarm-based keepalive for long operations
// ============================================================

const KEEPALIVE_ALARM = 'nexus-keepalive';

function startKeepalive(): void {
  try {
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.45 });
  } catch {
    // Alarms API may not be available in all contexts
  }
}

function stopKeepalive(): void {
  try {
    chrome.alarms.clear(KEEPALIVE_ALARM);
  } catch {
    // Ignore
  }
}

// The alarm handler just needs to exist to prevent SW termination
chrome.alarms?.onAlarm?.addListener((alarm: any) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // No-op: the listener itself keeps the SW alive
  }
});

// ============================================================
// Extension icon badge management
// ============================================================

function setBadge(text: string, color: string): void {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    // Badge API may not be available in all contexts
  }
}

function clearBadge(): void {
  try {
    chrome.action.setBadgeText({ text: '' });
  } catch {
    // Ignore
  }
}

// ============================================================
// In-progress state (stored in session storage for SW restart recovery)
// ============================================================

interface InProgressState {
  isStreaming: boolean;
  sessionId?: string;
  timestamp: number;
}

async function getInProgressState(): Promise<InProgressState | null> {
  try {
    const result = await chrome.storage.session.get('nexus_inProgress');
    return (result?.nexus_inProgress as InProgressState) || null;
  } catch {
    return null;
  }
}

async function setInProgressState(state: InProgressState | null): Promise<void> {
  try {
    if (state) {
      await chrome.storage.session.set({ nexus_inProgress: state });
    } else {
      await chrome.storage.session.remove('nexus_inProgress');
    }
  } catch {
    // Session storage may not be available in all contexts
  }
}

// ============================================================
// Context menu registration (resilient to SW restart)
// ============================================================

function registerContextMenus(): void {
  // Remove existing menus first to avoid duplicates on SW restart
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'nexus-summarize',
      title: 'Summarize with Nexus',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'nexus-translate',
      title: 'Translate with Nexus',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'nexus-explain',
      title: 'Explain with Nexus',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'nexus-summarize-page',
      title: 'Summarize page with Nexus',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'nexus-image-analyze',
      title: 'Analyze image with Nexus',
      contexts: ['image'],
    });
  });
}

export default defineBackground(() => {
  // Set sidepanel behavior - open on action click
  const sidePanelApi = (browser as any).sidePanel;
  if (sidePanelApi?.setPanelBehavior) {
    sidePanelApi.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  // Register context menus on install
  chrome.runtime.onInstalled.addListener(() => {
    registerContextMenus();
  });

  // Also re-register on service worker startup (handles SW restart)
  registerContextMenus();

  // Check for interrupted operations on startup
  getInProgressState().then((state) => {
    if (state?.isStreaming && Date.now() - state.timestamp < 5 * 60 * 1000) {
      // There was an interrupted streaming operation within the last 5 minutes
      // Notify sidepanel if it opens
    }
    setInProgressState(null);
  });

  // Handle context menu clicks
  chrome.contextMenus?.onClicked?.addListener(async (info: any, tab: any) => {
    if (!info.menuItemId) return;
    const menuItemId = info.menuItemId as string;

    let prompt = '';
    let text = '';

    switch (menuItemId) {
      case 'nexus-summarize':
        text = info.selectionText || '';
        if (!text) return;
        prompt = `Please summarize the following text concisely:\n\n${text}`;
        break;
      case 'nexus-translate':
        text = info.selectionText || '';
        if (!text) return;
        prompt = `Please translate the following text. Auto-detect the source language and translate to the user's likely preferred language:\n\n${text}`;
        break;
      case 'nexus-explain':
        text = info.selectionText || '';
        if (!text) return;
        prompt = `Please explain the following text clearly:\n\n${text}`;
        break;
      case 'nexus-summarize-page':
        if (!tab?.id) return;
        try {
          const { extractPageContent } = await import('../utils/pageExtractor');
          const content = await extractPageContent(tab.id, { maxLength: 30000 });
          const { formatPageContent } = await import('../utils/pageExtractor');
          const formatted = formatPageContent(content);
          prompt = `Please summarize this web page content:\n\n${formatted}`;
        } catch {
          return;
        }
        break;
      case 'nexus-image-analyze':
        if (!info.srcUrl) return;
        prompt = `Please analyze this image and describe what you see:\n\nImage URL: ${info.srcUrl}`;
        break;
      default:
        return;
    }

    // Open sidepanel and send the prompt
    if (tab?.windowId && sidePanelApi?.open) {
      await sidePanelApi.open({ windowId: tab.windowId });
    }

    // Send the context menu action to sidepanel
    await sendToSidepanel({
      type: 'CONTEXT_MENU_ACTION',
      prompt,
      menuItemId,
    });
  });

  // Open sidepanel when the extension icon is clicked
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.windowId && sidePanelApi?.open) {
      await sidePanelApi.open({ windowId: tab.windowId });
    }
  });

  // Message routing
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return false;

    switch (message.type) {
      case 'GET_VERSION':
        sendResponse({ version: '0.1.0' });
        return false;

      // Check if sidepanel is checking for interrupted state
      case 'CHECK_INTERRUPTED_STATE': {
        getInProgressState().then((state) => {
          sendResponse(state);
        });
        return true;
      }

      // Browser control commands
      case 'BROWSER_AUTOMATION_START': {
        handleAsyncMessage(
          async () => {
            startKeepalive();
            await setInProgressState({ isStreaming: true, timestamp: Date.now() });
            const controlManager = getControlManager();
            const result = await controlManager.startSession(
              message.tabId,
              message.taskTitle,
            );
            return result;
          },
          sendResponse,
        );
        return true;
      }

      case 'BROWSER_AUTOMATION_COMMAND': {
        handleAsyncMessage(
          async () => {
            const controlManager = getControlManager();
            const result = await controlManager.executeCommand(
              message.name,
              message.args || {},
            );
            return { result };
          },
          sendResponse,
        );
        return true;
      }

      case 'BROWSER_AUTOMATION_END': {
        handleAsyncMessage(
          async () => {
            const controlManager = getControlManager();
            await controlManager.endSession();
            await setInProgressState(null);
            stopKeepalive();
            return { success: true };
          },
          sendResponse,
        );
        return true;
      }

      case 'BROWSER_AUTOMATION_STATUS': {
        const controlManager = getControlManager();
        sendResponse({
          active: controlManager.isActive(),
          tabId: controlManager.getCurrentTabId(),
        });
        return false;
      }

      // Page extraction commands
      case 'EXTRACT_PAGE_CONTENT': {
        handleAsyncMessage(
          async () => {
            const { extractPageContent } = await import('../utils/pageExtractor');
            const content = await extractPageContent(message.tabId, {
              maxLength: message.maxLength,
              rawExtract: message.rawExtract,
            });
            return content;
          },
          sendResponse,
        );
        return true;
      }

      // YouTube transcript extraction
      case 'EXTRACT_YOUTUBE_INFO': {
        handleAsyncMessage(
          async () => {
            const { extractYouTubeInfo } = await import('../utils/videoSummary');
            const info = await extractYouTubeInfo(message.tabId);
            return info;
          },
          sendResponse,
        );
        return true;
      }

      // Streaming start/end markers from sidepanel
      case 'STREAM_START': {
        handleAsyncMessage(
          async () => {
            startKeepalive();
            await setInProgressState({ isStreaming: true, sessionId: message.sessionId, timestamp: Date.now() });
            setBadge('...', '#007AFF');
            return { ok: true };
          },
          sendResponse,
        );
        return true;
      }

      case 'STREAM_END':
      case 'STREAMING_END': {
        handleAsyncMessage(
          async () => {
            await setInProgressState(null);
            stopKeepalive();
            clearBadge();
            return { ok: true };
          },
          sendResponse,
        );
        return true;
      }

      case 'STREAMING_ERROR': {
        handleAsyncMessage(
          async () => {
            await setInProgressState(null);
            stopKeepalive();
            setBadge('!', '#FF3B30');
            // Auto-clear error badge after 5 seconds
            setTimeout(() => clearBadge(), 5000);
            return { ok: true };
          },
          sendResponse,
        );
        return true;
      }

      // Take screenshot
      case 'TAKE_SCREENSHOT': {
        handleAsyncMessage(
          async () => {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]?.id || !tabs[0]?.windowId) {
              return { error: 'No active tab found' };
            }
            try {
              const dataUrl = await chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: 'png' });
              return { dataUrl };
            } catch (error) {
              return { error: (error as Error).message };
            }
          },
          sendResponse,
        );
        return true;
      }

      // ===== Content script message handlers =====

      // Capture full page screenshot and forward to sidepanel
      case 'CAPTURE_FULL_PAGE': {
        handleAsyncMessage(
          async () => {
            const tab = sender.tab;
            if (!tab?.windowId) {
              return { error: 'No tab found' };
            }
            try {
              const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

              // If OCR mode, process via AI and send result back
              if (message.ocr) {
                // Send to sidepanel for OCR processing
                await sendToSidepanel({
                  type: 'CONTENT_IMAGE_TO_CHAT',
                  imageUrl: dataUrl,
                  prompt: 'Please extract all visible text from this screenshot (OCR). Format the output clearly.',
                  tabId: tab.id,
                });
                return { success: true };
              }

              // Otherwise, send to sidepanel as an image message
              await sendToSidepanel({
                type: 'CONTENT_IMAGE_TO_CHAT',
                imageUrl: dataUrl,
                prompt: 'What is in this screenshot? Please describe what you see.',
                tabId: tab.id,
              });
              return { success: true };
            } catch (error) {
              return { error: (error as Error).message };
            }
          },
          sendResponse,
        );
        return true;
      }

      // Capture screenshot for area selection (content script will start overlay)
      case 'CAPTURE_AREA': {
        handleAsyncMessage(
          async () => {
            const tab = sender.tab;
            if (!tab?.windowId) {
              return { error: 'No tab found' };
            }
            try {
              const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
              return { dataUrl };
            } catch (error) {
              return { error: (error as Error).message };
            }
          },
          sendResponse,
        );
        return true;
      }

      // Area selected by user - crop and send to sidepanel
      case 'AREA_SELECTED': {
        handleAsyncMessage(
          async () => {
            const { area, dataUrl } = message;
            if (!area || !dataUrl) {
              return { error: 'Missing area or screenshot data' };
            }
            try {
              const croppedDataUrl = await cropScreenshotArea(dataUrl, area);

              // Send to sidepanel as image message
              await sendToSidepanel({
                type: 'CONTENT_IMAGE_TO_CHAT',
                imageUrl: croppedDataUrl,
                prompt: 'What is in this screenshot? Please describe what you see.',
                tabId: sender.tab?.id,
              });
              return { success: true };
            } catch (error) {
              return { error: (error as Error).message };
            }
          },
          sendResponse,
        );
        return true;
      }

      // Selection action from content script toolbar
      case 'SELECTION_ACTION': {
        handleAsyncMessage(
          async () => {
            startKeepalive();
            await setInProgressState({ isStreaming: true, timestamp: Date.now() });
            setBadge('...', '#007AFF');
            try {
              const { actionId, text, prompt } = message;
              // Process via AI in background and return result to content script
              const result = await processSelectionAction(actionId, text, prompt);
              clearBadge();
              return result;
            } catch (error) {
              setBadge('!', '#FF3B30');
              setTimeout(() => clearBadge(), 5000);
              throw error;
            } finally {
              await setInProgressState(null);
              stopKeepalive();
            }
          },
          sendResponse,
        );
        return true;
      }

      // Open sidepanel (from content script)
      case 'OPEN_SIDE_PANEL': {
        handleAsyncMessage(
          async () => {
            try {
              const tab = sender.tab;
              if (tab?.windowId && sidePanelApi?.open) {
                await sidePanelApi.open({ windowId: tab.windowId });
                return { success: true };
              }
              return { error: 'Could not open side panel' };
            } catch (error) {
              return { error: (error as Error).message };
            }
          },
          sendResponse,
        );
        return true;
      }

      // Toggle browser control mode (from content script shortcut)
      case 'TOGGLE_SIDE_PANEL_CONTROL': {
        // Forward to sidepanel if open
        sendToSidepanel({ type: 'TOGGLE_BROWSER_CONTROL' }).catch(() => {});
        sendResponse({ received: true });
        return false;
      }

      // Execute a skill script in a target tab
      case 'EXECUTE_SKILL_SCRIPT': {
        handleAsyncMessage(
          async () => {
            const { tabId, code, args } = message;
            if (!tabId || !code) {
              return { success: false, error: 'Missing tabId or code' };
            }

            try {
              // Execute script via chrome.scripting.executeScript
              const wrappedCode = `
                (function() {
                  const __args = ${JSON.stringify(args || {})};
                  ${code}
                })()
              `;

              const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: new Function(wrappedCode),
              });

              const result = results?.[0]?.result;
              return { success: true, result };
            } catch (error) {
              return { success: false, error: (error as Error).message };
            }
          },
          sendResponse,
        );
        return true;
      }

      default:
        return false;
    }
  });
});

/**
 * Send a message to the sidepanel.
 * Uses chrome.runtime.sendMessage which all extension pages can receive.
 */
async function sendToSidepanel(message: any): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Sidepanel may not be open; that is acceptable
  }
}

/**
 * Process a selection action by calling the AI API directly from background.
 * Used for quick selection actions (summarize, translate, etc.) that don't
 * require the sidepanel to be open.
 */
async function processSelectionAction(
  actionId: string,
  text: string,
  prompt: string,
): Promise<{ content?: string; error?: string }> {
  try {
    // Import storage and API utilities
    const { getActiveProvider, toAIProvider, getSystemPrompt } = await import('../utils/storage');
    const { streamChat } = await import('../utils/api');

    const storedProvider = await getActiveProvider();
    if (!storedProvider) {
      return { error: 'No AI provider configured. Please set up a provider in Settings.' };
    }

    const provider = toAIProvider(storedProvider);
    const messages = [
      { role: 'system' as const, content: '', timestamp: Date.now() },
      { role: 'user' as const, content: prompt, timestamp: Date.now() },
    ];

    let result = '';
    for await (const event of streamChat(provider, messages, {
      maxToolIterations: 0, // No tool calls for selection actions
    })) {
      if (event.type === 'content' && event.content) {
        result += event.content;
      }
      if (event.type === 'done') {
        break;
      }
    }

    return { content: result.trim() };
  } catch (error) {
    return { error: (error as Error).message || 'Failed to get AI response' };
  }
}

/**
 * Helper to handle async message responses.
 * Wraps each handler in try/catch to prevent one bad handler from crashing the SW.
 */
function handleAsyncMessage(
  handler: () => Promise<any>,
  sendResponse: (response: any) => void,
): void {
  handler()
    .then((result) => {
      try {
        sendResponse(result);
      } catch (e) {
        console.error('[Nexus] Failed to send response:', e);
      }
    })
    .catch((error) => {
      console.error('[Nexus] Message handler error:', error);
      try {
        sendResponse({ error: error?.message || 'Unknown error' });
      } catch (e) {
        console.error('[Nexus] Failed to send error response:', e);
      }
    });
}
