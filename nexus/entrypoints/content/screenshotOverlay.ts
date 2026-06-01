/**
 * ScreenshotOverlay - Full-viewport overlay for area screenshot selection
 * User drags to select a rectangular area, then the area is cropped and sent to AI.
 */

import { t, type Language } from '../../utils/i18n';

const OVERLAY_HOST_ID = 'nexus-screenshot-overlay-host';
const OVERLAY_Z_INDEX = '2147483647';

let overlayHost: HTMLElement | null = null;
let overlayShadow: ShadowRoot | null = null;
let isDragging = false;
let startX = 0;
let startY = 0;
let screenshotDataUrl: string | null = null;
let onCancelCallback: (() => void) | null = null;
let onCompleteCallback: ((cropArea: { x: number; y: number; width: number; height: number }) => void) | null = null;

function getOverlayStyles(): string {
  return `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .nexus-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: ${OVERLAY_Z_INDEX};
      cursor: crosshair;
      user-select: none;
      overflow: hidden;
    }

    .nexus-overlay-bg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
      filter: brightness(0.6);
    }

    .nexus-overlay-selection {
      position: fixed;
      border: 2px solid #007aff;
      background-color: rgba(0, 122, 255, 0.08);
      display: none;
      pointer-events: none;
      z-index: ${OVERLAY_Z_INDEX};
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3);
    }

    .nexus-overlay-selection.has-bg {
      overflow: hidden;
    }

    .nexus-overlay-selection-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-size: 100vw 100vh;
      background-repeat: no-repeat;
      pointer-events: none;
    }

    .nexus-overlay-hint {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      background: rgba(0, 0, 0, 0.75);
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      pointer-events: none;
      z-index: ${Number(OVERLAY_Z_INDEX) + 2};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .nexus-overlay-size {
      position: fixed;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.75);
      color: white;
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      border-radius: 6px;
      pointer-events: none;
      z-index: ${Number(OVERLAY_Z_INDEX) + 2};
      display: none;
    }
  `;
}

let selectionBox: HTMLDivElement | null = null;
let innerImgRef: HTMLDivElement | null = null;
let sizeLabel: HTMLDivElement | null = null;

// Bound event handlers
const boundMouseDown = (e: MouseEvent) => onOverlayMouseDown(e);
const boundMouseMove = (e: MouseEvent) => onOverlayMouseMove(e);
const boundMouseUp = (e: MouseEvent) => onOverlayMouseUp(e);
const boundKeyDown = (e: KeyboardEvent) => onOverlayKeyDown(e);
const boundClick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
const boundContextMenu = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

export interface OverlayOptions {
  screenshotDataUrl: string;
  onCancel?: () => void;
  onComplete?: (cropArea: { x: number; y: number; width: number; height: number }) => void;
  lang?: 'en' | 'zh-CN';
}

/**
 * Start the area screenshot overlay
 */
export function startOverlay(options: OverlayOptions): void {
  cleanup();

  screenshotDataUrl = options.screenshotDataUrl;
  onCancelCallback = options.onCancel || null;
  onCompleteCallback = options.onComplete || null;
  const lang = options.lang || 'en';

  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.style.cssText = 'all: initial; position: static; width: 0; height: 0;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getOverlayStyles();
  shadow.appendChild(style);

  // Overlay container
  const overlay = document.createElement('div');
  overlay.className = 'nexus-overlay';

  // Background image
  if (screenshotDataUrl) {
    const bgImg = document.createElement('img');
    bgImg.src = screenshotDataUrl;
    bgImg.className = 'nexus-overlay-bg';
    overlay.appendChild(bgImg);
  }

  // Selection box
  selectionBox = document.createElement('div');
  selectionBox.className = 'nexus-overlay-selection';

  if (screenshotDataUrl) {
    innerImgRef = document.createElement('div');
    innerImgRef.className = 'nexus-overlay-selection-img';
    innerImgRef.style.backgroundImage = `url(${screenshotDataUrl})`;
    selectionBox.appendChild(innerImgRef);
    selectionBox.classList.add('has-bg');
  }

  overlay.appendChild(selectionBox);

  // Hint text
  const hint = document.createElement('div');
  hint.className = 'nexus-overlay-hint';
  hint.textContent = t(lang, 'overlay.dragSelect');
  overlay.appendChild(hint);

  // Size label
  sizeLabel = document.createElement('div');
  sizeLabel.className = 'nexus-overlay-size';
  overlay.appendChild(sizeLabel);

  shadow.appendChild(overlay);
  (document.documentElement || document.body).appendChild(host);

  overlayHost = host;
  overlayShadow = shadow;

  // Attach event listeners
  overlay.addEventListener('mousedown', boundMouseDown as EventListener);
  window.addEventListener('mousemove', boundMouseMove as EventListener, { capture: true });
  window.addEventListener('mouseup', boundMouseUp as EventListener, { capture: true });
  window.addEventListener('keydown', boundKeyDown as EventListener, { capture: true });
  window.addEventListener('click', boundClick as EventListener, { capture: true });
  window.addEventListener('contextmenu', boundContextMenu as EventListener, { capture: true });
}

function onOverlayMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;

  if (selectionBox) {
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';

    if (innerImgRef) {
      innerImgRef.style.marginLeft = `-${startX}px`;
      innerImgRef.style.marginTop = `-${startY}px`;
    }
  }

  // Hide hint
  const hint = overlayShadow?.querySelector('.nexus-overlay-hint');
  if (hint) (hint as HTMLElement).style.display = 'none';
}

function onOverlayMouseMove(e: MouseEvent): void {
  if (!isDragging) return;
  e.preventDefault();
  e.stopPropagation();

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(currentX, startX);
  const top = Math.min(currentY, startY);

  if (selectionBox) {
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;

    if (innerImgRef) {
      innerImgRef.style.marginLeft = `-${left}px`;
      innerImgRef.style.marginTop = `-${top}px`;
    }
  }

  // Show size label
  if (sizeLabel) {
    sizeLabel.style.display = 'block';
    sizeLabel.style.left = `${left + width / 2 - 30}px`;
    sizeLabel.style.top = `${top + height + 8}px`;
    sizeLabel.textContent = `${width} x ${height}`;
  }
}

function onOverlayMouseUp(e: MouseEvent): void {
  if (!isDragging) return;
  e.preventDefault();
  e.stopPropagation();
  isDragging = false;

  if (!selectionBox) {
    cancel();
    return;
  }

  const rect = selectionBox.getBoundingClientRect();

  if (rect.width < 5 || rect.height < 5) {
    cancel();
    return;
  }

  const cropArea = {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };

  cleanup();
  onCancelCallback = null;

  if (onCompleteCallback) {
    onCompleteCallback(cropArea);
  }
}

function onOverlayKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancel();
  }
}

/**
 * Cancel the overlay
 */
export function cancel(): void {
  const onCancel = onCancelCallback;
  cleanup();
  onCancelCallback = null;
  if (onCancel) onCancel();
}

function cleanup(): void {
  if (overlayHost) {
    // Remove event listeners
    const overlay = overlayShadow?.querySelector('.nexus-overlay');
    if (overlay) {
      overlay.removeEventListener('mousedown', boundMouseDown as EventListener);
    }
    window.removeEventListener('mousemove', boundMouseMove as EventListener, true);
    window.removeEventListener('mouseup', boundMouseUp as EventListener, true);
    window.removeEventListener('keydown', boundKeyDown as EventListener, true);

    setTimeout(() => {
      window.removeEventListener('click', boundClick as EventListener, true);
      window.removeEventListener('contextmenu', boundContextMenu as EventListener, true);
    }, 100);

    if (overlayHost.parentNode) {
      overlayHost.parentNode.removeChild(overlayHost);
    }
  }

  overlayHost = null;
  overlayShadow = null;
  selectionBox = null;
  innerImgRef = null;
  sizeLabel = null;
  isDragging = false;
  screenshotDataUrl = null;
}

/**
 * Destroy the overlay completely
 */
export function destroyOverlay(): void {
  cleanup();
  onCancelCallback = null;
  onCompleteCallback = null;
}
