/**
 * ResultPopup - Shows AI results near the selection in a popup
 * Rendered in shadow DOM for style isolation.
 * Apple-style card with copy and continue-in-sidepanel buttons.
 */

const POPUP_HOST_ID = 'nexus-result-popup-host';
const POPUP_Z_INDEX = '2147483646';

let popupHost: HTMLElement | null = null;
let popupShadow: ShadowRoot | null = null;

function getPopupStyles(): string {
  return `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .nexus-popup {
      position: fixed;
      z-index: ${POPUP_Z_INDEX};
      min-width: 240px;
      max-width: 380px;
      max-height: 320px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      opacity: 0;
      transform: translateY(4px) scale(0.97);
      transition: opacity 200ms ease, transform 200ms ease;
    }

    .nexus-popup.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .nexus-popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .nexus-popup-title {
      font-size: 13px;
      font-weight: 600;
      color: #1d1d1f;
    }

    .nexus-popup-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: none;
      background: transparent;
      color: #86868b;
      cursor: pointer;
      border-radius: 50%;
      font-size: 16px;
      line-height: 1;
      transition: background 150ms ease, color 150ms ease;
    }

    .nexus-popup-close:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #1d1d1f;
    }

    .nexus-popup-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      font-size: 13px;
      line-height: 1.5;
      color: #1d1d1f;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .nexus-popup-body::-webkit-scrollbar {
      width: 4px;
    }

    .nexus-popup-body::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 2px;
    }

    .nexus-popup-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      padding: 8px 14px;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
    }

    .nexus-popup-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 5px 12px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .nexus-popup-btn-copy {
      background: rgba(0, 0, 0, 0.05);
      color: #1d1d1f;
    }

    .nexus-popup-btn-copy:hover {
      background: rgba(0, 0, 0, 0.1);
    }

    .nexus-popup-btn-copy.copied {
      color: #34c759;
    }

    .nexus-popup-btn-continue {
      background: #007aff;
      color: #ffffff;
    }

    .nexus-popup-btn-continue:hover {
      background: #0056cc;
    }

    .nexus-popup-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 24px;
      color: #86868b;
      font-size: 13px;
    }

    .nexus-popup-loading .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #86868b;
      animation: nexus-bounce 1.4s infinite ease-in-out;
    }

    .nexus-popup-loading .dot:nth-child(1) { animation-delay: 0s; }
    .nexus-popup-loading .dot:nth-child(2) { animation-delay: 0.2s; }
    .nexus-popup-loading .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes nexus-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
  `;
}

function ensurePopupHost(): { host: HTMLElement; shadow: ShadowRoot } {
  let existing = document.getElementById(POPUP_HOST_ID);
  if (existing && existing.shadowRoot) {
    popupHost = existing;
    popupShadow = existing.shadowRoot;
    return { host: existing, shadow: existing.shadowRoot };
  }

  const host = document.createElement('div');
  host.id = POPUP_HOST_ID;
  host.style.cssText = 'all: initial; position: static; width: 0; height: 0;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getPopupStyles();
  shadow.appendChild(style);

  (document.documentElement || document.body).appendChild(host);

  popupHost = host;
  popupShadow = shadow;
  return { host, shadow };
}

function calculatePopupPosition(
  anchorRect: DOMRect | null,
  mousePoint: { x: number; y: number } | null,
): { left: number; top: number } {
  const popupWidth = 340;
  const popupHeight = 250;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = mousePoint ? mousePoint.x - 40 : anchorRect ? anchorRect.left : 40;
  let top = mousePoint ? mousePoint.y + 16 : anchorRect ? anchorRect.bottom + 8 : 40;

  // Keep within viewport
  if (left + popupWidth > viewportWidth - 12) {
    left = viewportWidth - popupWidth - 12;
  }
  if (left < 12) left = 12;

  if (top + popupHeight > viewportHeight - 12) {
    top = (mousePoint ? mousePoint.y - 16 : anchorRect ? anchorRect.top : viewportHeight - 12) - popupHeight;
  }
  if (top < 12) top = 12;

  return { left, top };
}

export interface ResultPopupOptions {
  title: string;
  anchorRect: DOMRect | null;
  mousePoint: { x: number; y: number } | null;
  onContinueInSidepanel?: () => void;
}

/**
 * Show a loading popup near the selection
 */
export function showLoadingPopup(options: ResultPopupOptions): void {
  const { shadow } = ensurePopupHost();

  // Remove any existing popup
  const existing = shadow.querySelector('.nexus-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'nexus-popup';

  const pos = calculatePopupPosition(options.anchorRect, options.mousePoint);
  popup.style.left = `${pos.left}px`;
  popup.style.top = `${pos.top}px`;

  popup.innerHTML = `
    <div class="nexus-popup-header">
      <span class="nexus-popup-title">${escapeHtml(options.title)}</span>
    </div>
    <div class="nexus-popup-loading">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  `;

  shadow.appendChild(popup);

  requestAnimationFrame(() => {
    popup.classList.add('visible');
  });
}

/**
 * Show a result popup near the selection with content
 */
export function showResultPopup(
  options: ResultPopupOptions,
  content: string,
): void {
  const { shadow } = ensurePopupHost();

  // Remove any existing popup
  const existing = shadow.querySelector('.nexus-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'nexus-popup';

  const pos = calculatePopupPosition(options.anchorRect, options.mousePoint);
  popup.style.left = `${pos.left}px`;
  popup.style.top = `${pos.top}px`;

  const titleEl = document.createElement('div');
  titleEl.className = 'nexus-popup-header';
  titleEl.innerHTML = `
    <span class="nexus-popup-title">${escapeHtml(options.title)}</span>
    <button class="nexus-popup-close">&times;</button>
  `;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'nexus-popup-body';
  bodyEl.textContent = content;

  const footerEl = document.createElement('div');
  footerEl.className = 'nexus-popup-footer';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'nexus-popup-btn nexus-popup-btn-copy';
  copyBtn.textContent = 'Copy';

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content);
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 2000);
    } catch {
      // Clipboard not available
    }
  });

  const continueBtn = document.createElement('button');
  continueBtn.className = 'nexus-popup-btn nexus-popup-btn-continue';
  continueBtn.textContent = 'Continue in panel';
  continueBtn.addEventListener('click', () => {
    destroyPopup();
    if (options.onContinueInSidepanel) {
      options.onContinueInSidepanel();
    } else {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
    }
  });

  footerEl.appendChild(copyBtn);
  footerEl.appendChild(continueBtn);

  popup.appendChild(titleEl);
  popup.appendChild(bodyEl);
  popup.appendChild(footerEl);

  // Close button handler
  const closeBtn = titleEl.querySelector('.nexus-popup-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => destroyPopup());
  }

  shadow.appendChild(popup);

  requestAnimationFrame(() => {
    popup.classList.add('visible');
  });
}

/**
 * Show an error popup
 */
export function showErrorPopup(
  options: ResultPopupOptions,
  errorMessage: string,
): void {
  showResultPopup(
    { ...options, title: 'Error' },
    errorMessage,
  );
}

/**
 * Destroy the popup
 */
export function destroyPopup(): void {
  if (!popupShadow) return;
  const popup = popupShadow.querySelector('.nexus-popup');
  if (popup) {
    popup.classList.remove('visible');
    setTimeout(() => popup.remove(), 200);
  }
}

/**
 * Destroy the popup host entirely
 */
export function destroyPopupHost(): void {
  if (popupHost && popupHost.parentNode) {
    popupHost.parentNode.removeChild(popupHost);
  }
  popupHost = null;
  popupShadow = null;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
