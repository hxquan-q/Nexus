/**
 * Background service worker
 * Handles sidepanel open on action click, message routing, and browser control.
 * Also handles content script messages for screenshot capture, selection actions,
 * and area cropping.
 */

import { getControlManager } from '../background/control/index';
import { cropScreenshotArea } from '../utils/screenshotCapture';

export default defineBackground(() => {
  // Set sidepanel behavior - open on action click
  const sidePanelApi = (browser as any).sidePanel;
  if (sidePanelApi?.setPanelBehavior) {
    sidePanelApi.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

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

      // Browser control commands
      case 'BROWSER_AUTOMATION_START': {
        handleAsyncMessage(
          async () => {
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
            const { actionId, text, prompt } = message;
            // Process via AI in background and return result to content script
            const result = await processSelectionAction(actionId, text, prompt);
            return result;
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

  console.log('[Nexus] Background service worker initialized');
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
    const { getActiveProvider, toAIProvider } = await import('../utils/storage');
    const { streamChat } = await import('../utils/api');

    const storedProvider = await getActiveProvider();
    if (!storedProvider) {
      return { error: 'No AI provider configured. Please set up a provider in Settings.' };
    }

    const provider = toAIProvider(storedProvider);
    const messages = [
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
 */
function handleAsyncMessage(
  handler: () => Promise<any>,
  sendResponse: (response: any) => void,
): void {
  handler()
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error('[Nexus] Message handler error:', error);
      sendResponse({ error: error.message || 'Unknown error' });
    });
}
