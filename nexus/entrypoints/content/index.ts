/**
 * Nexus Content Script - Main entry point
 * Runs on all web pages. Initializes selection toolbar, screenshot capture,
 * keyboard shortcuts, and the floating ball.
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

// ============================================================
// State
// ============================================================

let selectionObserver: SelectionObserver | null = null;
let currentLang: 'en' | 'zh-CN' = 'en';
let pendingPopupOptions: { title: string; anchorRect: DOMRect | null; mousePoint: { x: number; y: number } | null } | null = null;

// ============================================================
// Initialization
// ============================================================

export default defineContentScript({
  matches: ['<all_urls>'],
  excludeMatches: ['*://*.mhtml', '*://*.mht'],
  runAt: 'document_end',
  main() {
    // Load language setting
    chrome.storage.local.get(['language'], (result: { language?: string }) => {
      currentLang = (result?.language === 'zh-CN' ? 'zh-CN' : 'en') as 'en' | 'zh-CN';
      setToolbarLanguage(currentLang);
    });

    // Watch for language changes
    chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: any; oldValue?: any }>, area: string) => {
      if (area === 'local' && changes.language) {
        currentLang = changes.language.newValue === 'zh-CN' ? 'zh-CN' : 'en';
        setToolbarLanguage(currentLang);
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

    console.log('[Nexus] Content script initialized');
  },
});

// ============================================================
// Selection handlers
// ============================================================

function handleSelection(data: SelectionData): void {
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
  if (currentLang === 'zh-CN') {
    switch (actionId) {
      case 'ask': return '询问 AI';
      case 'summarize': return '总结';
      case 'translate': return '翻译';
      case 'explain': return '解释';
      case 'grammar': return '语法检查';
      default: return 'AI';
    }
  }
  switch (actionId) {
    case 'ask': return 'Ask AI';
    case 'summarize': return 'Summarize';
    case 'translate': return 'Translate';
    case 'explain': return 'Explain';
    case 'grammar': return 'Grammar Check';
    default: return 'AI';
  }
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
