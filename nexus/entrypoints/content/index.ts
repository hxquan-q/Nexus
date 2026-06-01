/**
 * Nexus Content Script - Main entry point
 * Runs on all web pages. Initializes selection toolbar, screenshot capture,
 * keyboard shortcuts, and the floating ball.
 *
 * Resilience:
 * - Double-injection guard to prevent duplicate initialization on extension reload
 * - Handles restricted pages gracefully (chrome:// URLs)
 * - Debounced selection observer for large pages
 */

import { SelectionObserver, type SelectionData } from '../../utils/selectionObserver';
import {
  initSelectionToolbar,
  show as showToolbar,
  hide as hideToolbar,
  setLanguage as setToolbarLanguage,
  destroy as destroyToolbar,
} from './selectionToolbar';
import {
  showLoadingPopup,
  showResultPopup,
  showErrorPopup,
  destroyPopupHost,
  setPopupLanguage,
} from './resultPopup';
import {
  startOverlay,
  cancel as cancelOverlay,
  destroyOverlay,
} from './screenshotOverlay';
import {
  initShortcuts,
  destroyShortcuts,
} from './shortcuts';
import {
  initFloatingBall,
  destroyFloatingBall,
} from './floatingBall';
import { t, type Language } from '../../utils/i18n';

// ============================================================
// Double-injection guard
// ============================================================

if ((window as any).__nexusContentScriptLoaded) {
  // Already injected (e.g., extension was reloaded). The main() guard
  // below will prevent re-initialization. This flag is informational.
}
(window as any).__nexusContentScriptLoaded = true;

// ============================================================
// State
// ============================================================

let selectionObserver: SelectionObserver | null = null;
let currentLang: Language = 'en';
let pendingPopupOptions: { title: string; anchorRect: DOMRect | null; mousePoint: { x: number; y: number } | null } | null = null;
let isDestroyed = false;

// Debounce for selection observer on large pages
let selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SELECTION_DEBOUNCE_MS = 50; // ms to debounce selection events on large pages

/**
 * Check if the current page is a restricted page where content scripts
 * have limited or no functionality (chrome://, about:, edge://, etc.).
 */
function isRestrictedPage(): boolean {
  try {
    const protocol = window.location.protocol;
    return protocol === 'chrome:' || protocol === 'chrome-extension:' || protocol === 'about:' || protocol === 'edge:' || protocol === 'devtools:';
  } catch {
    return true;
  }
}

// ============================================================
// Cleanup
// ============================================================

/**
 * Clean up all content script resources.
 * Called when the extension is reloaded or disabled.
 */
function cleanup(): void {
  if (isDestroyed) return;
  isDestroyed = true;

  if (selectionObserver) {
    selectionObserver.disconnect();
    selectionObserver = null;
  }

  destroyToolbar();
  destroyPopupHost();
  destroyOverlay();
  destroyShortcuts();
  destroyFloatingBall();
  pendingPopupOptions = null;
}

// ============================================================
// Initialization
// ============================================================

export default defineContentScript({
  matches: ['<all_urls>'],
  excludeMatches: ['*://*/*.mhtml*', '*://*/*.mht*', 'file://*/*.mhtml', 'file://*/*.mht'],
  runAt: 'document_end',
  main() {
    // Double-injection guard: if the content script was already loaded
    // (e.g. extension was reloaded), skip initialization
    if ((window as any).__nexusContentScriptMainInitialized) {
      return;
    }
    (window as any).__nexusContentScriptMainInitialized = true;

    // Bail out on restricted pages
    if (isRestrictedPage()) {
      return;
    }

    try {
      // Load language setting
      chrome.storage.local.get(['language'], (result: { language?: string }) => {
        currentLang = (result?.language === 'zh-CN' ? 'zh-CN' : 'en') as Language;
        setToolbarLanguage(currentLang);
        setPopupLanguage(currentLang);
      });

      // Watch for language changes
      chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: any; oldValue?: any }>, area: string) => {
        if (area === 'local' && changes.language) {
          currentLang = (changes.language.newValue === 'zh-CN' ? 'zh-CN' : 'en') as Language;
          setToolbarLanguage(currentLang);
          setPopupLanguage(currentLang);
        }
      });

      // Initialize selection toolbar
      initSelectionToolbar(handleSelectionAction, currentLang);

      // Initialize selection observer
      selectionObserver = new SelectionObserver({
        onSelection: handleSelection,
        onClear: handleSelectionClear,
        onClick: handleClick,
      });

      // Initialize keyboard shortcuts
      initShortcuts({
        onOpenPanel: () => {
          // Handled by sending OPEN_SIDE_PANEL message in shortcuts.ts
        },
        onQuickAsk: handleQuickAsk,
        onAreaScreenshot: handleAreaScreenshot,
        onFullScreenshot: handleFullScreenshot,
        onOcrCapture: handleOcrCapture,
        onBrowserControl: () => {
          // Handled by sending TOGGLE_SIDE_PANEL_CONTROL message
        },
      });

      // Initialize floating ball
      initFloatingBall();

      // Listen for messages from background/sidepanel
      chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response?: any) => void) => {
        if (!message?.type) return false;

        switch (message.type) {
          case 'QUICK_ASK_RESULT':
            handleQuickAskResult(message);
            sendResponse({ received: true });
            return false;

          case 'CAPTURE_AREA_INIT':
            handleCaptureAreaInit(message);
            return false;

          default:
            return false;
        }
      });
    } catch (error) {
      console.error('[Nexus] Content script initialization failed:', error);
      // Don't crash the host page - just log and continue
    }
  },
});

// ============================================================
// Selection handlers
// ============================================================

function handleSelection(data: SelectionData): void {
  // Debounce selection events on large pages to avoid excessive processing
  if (selectionDebounceTimer) {
    clearTimeout(selectionDebounceTimer);
  }

  const debounceMs = document.querySelectorAll('*').length > 5000 ? SELECTION_DEBOUNCE_MS : 0;

  if (debounceMs > 0) {
    selectionDebounceTimer = setTimeout(() => {
      selectionDebounceTimer = null;
      doHandleSelection(data);
    }, debounceMs);
  } else {
    doHandleSelection(data);
  }
}

function doHandleSelection(data: SelectionData): void {
  // Check if selection quote is enabled
  chrome.storage.local.get(['selectionQuoteEnabled'], (result: { selectionQuoteEnabled?: boolean }) => {
    const enabled = result?.selectionQuoteEnabled !== false;
    if (!enabled) return;

    // Don't show if popup is open
    if (pendingPopupOptions) return;

    showToolbar(data);
  });
}

function handleSelectionClear(): void {
  hideToolbar();
}

function handleClick(_event: PointerEvent): void {
  // Hide toolbar on click outside
  hideToolbar();
}

// ============================================================
// Selection action handler
// ============================================================

function handleSelectionAction(actionId: string, selection: SelectionData): void {
  const popupOptions = {
    title: getActionTitle(actionId),
    anchorRect: selection.rect,
    mousePoint: selection.mousePoint,
  };

  pendingPopupOptions = popupOptions;

  // Show loading popup
  showLoadingPopup(popupOptions);

  // Send to background for AI processing
  const prompt = buildPrompt(actionId, selection.text);
  chrome.runtime.sendMessage({
    type: 'SELECTION_ACTION',
    actionId,
    text: selection.text,
    prompt,
  }).then((response: any) => {
    if (!pendingPopupOptions) return;

    if (response?.error) {
      showErrorPopup(popupOptions, response.error);
    } else if (response?.content) {
      showResultPopup(popupOptions, response.content);
    } else if (response?.result) {
      showResultPopup(popupOptions, response.result);
    }
    pendingPopupOptions = null;
  }).catch((error: Error) => {
    if (pendingPopupOptions) {
      showErrorPopup(popupOptions, error.message || 'Failed to get AI response');
      pendingPopupOptions = null;
    }
  });
}

function getActionTitle(actionId: string): string {
  const keyMap: Record<string, string> = {
    ask: 'selectionAction.ask',
    summarize: 'selectionAction.summarize',
    translate: 'selectionAction.translate',
    explain: 'selectionAction.explain',
    grammar: 'selectionAction.grammar',
  };
  return t(currentLang, keyMap[actionId] || 'selectionAction.ask');
}

function buildPrompt(actionId: string, text: string): string {
  const langNote = currentLang === 'zh-CN' ? 'Please respond in Chinese.' : '';
  switch (actionId) {
    case 'ask':
      return text;
    case 'summarize':
      return `Please summarize the following text concisely. ${langNote}\n\n${text}`;
    case 'translate': {
      const targetLang = currentLang === 'zh-CN' ? 'English' : 'Chinese';
      return `Please translate the following text to ${targetLang}. Only output the translation, nothing else.\n\n${text}`;
    }
    case 'explain':
      return `Please explain the following text clearly. ${langNote}\n\n${text}`;
    case 'grammar':
      return `Please check the grammar of the following text and provide corrections if needed. ${langNote}\n\n${text}`;
    default:
      return text;
  }
}

// ============================================================
// Screenshot handlers
// ============================================================

function handleFullScreenshot(): void {
  // Ask background to capture the visible tab and send to sidepanel
  chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE' }).catch(() => {});
}

function handleAreaScreenshot(): void {
  // Ask background to capture screenshot, then start overlay
  chrome.runtime.sendMessage({ type: 'CAPTURE_AREA' }).then((response: any) => {
    if (response?.dataUrl) {
      startOverlay({
        screenshotDataUrl: response.dataUrl,
        lang: currentLang,
        onComplete: (cropArea: { x: number; y: number; width: number; height: number }) => {
          // Send the crop area to background for cropping and forwarding to sidepanel
          chrome.runtime.sendMessage({
            type: 'AREA_SELECTED',
            area: {
              ...cropArea,
              pixelRatio: window.devicePixelRatio,
            },
            dataUrl: response.dataUrl,
          }).catch(() => {});
        },
        onCancel: () => {
          // User cancelled area selection
        },
      });
    }
  }).catch((error: Error) => {
    console.error('[Nexus] Failed to capture area screenshot:', error);
  });
}

function handleCaptureAreaInit(message: any): void {
  if (message?.dataUrl) {
    startOverlay({
      screenshotDataUrl: message.dataUrl,
      lang: currentLang,
      onComplete: (cropArea: { x: number; y: number; width: number; height: number }) => {
        chrome.runtime.sendMessage({
          type: 'AREA_SELECTED',
          area: {
            ...cropArea,
            pixelRatio: window.devicePixelRatio,
          },
          dataUrl: message.dataUrl,
        }).catch(() => {});
      },
    });
  }
}

// ============================================================
// Quick ask handler
// ============================================================

function handleQuickAsk(): void {
  // Open sidepanel with quick ask
  chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
}

function handleOcrCapture(): void {
  // Capture screenshot and send for OCR analysis
  chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE', ocr: true }).catch(() => {});
}

function handleQuickAskResult(_message: any): void {
  // Result from a quick ask initiated by background
  // Could show in popup or ignore (sidepanel handles it)
}
