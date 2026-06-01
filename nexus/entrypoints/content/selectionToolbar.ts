/**
 * SelectionToolbar - Floating pill toolbar that appears on text selection
 * Rendered in a shadow DOM container for style isolation.
 * Apple-style frosted glass aesthetic.
 */

import type { SelectionData } from '../../utils/selectionObserver';
import { t, type Language } from '../../utils/i18n';

const HOST_ID = 'nexus-selection-toolbar-host';
const TOOLBAR_Z_INDEX = '2147483646';

export interface ToolbarAction {
  id: string;
  labelKey: string;
  icon: string;
}

export const DEFAULT_ACTIONS: ToolbarAction[] = [
  { id: 'ask', labelKey: 'selection.ask', icon: '✨' },
  { id: 'summarize', labelKey: 'selection.summarize', icon: '\u{1F4DD}' },
  { id: 'translate', labelKey: 'selection.translate', icon: '\u{1F310}' },
  { id: 'explain', labelKey: 'selection.explain', icon: '\u{1F4A1}' },
  { id: 'grammar', labelKey: 'selection.grammar', icon: '✍️' },
];

let toolbarHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let currentSelectionData: SelectionData | null = null;
let onActionCallback: ((actionId: string, selection: SelectionData) => void) | null = null;
let currentLang: 'en' | 'zh-CN' = 'en';

function getToolbarStyles(): string {
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

    .nexus-toolbar {
      position: fixed;
      z-index: ${TOOLBAR_Z_INDEX};
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 6px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 20px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      opacity: 0;
      transform: translateY(4px) scale(0.96);
      transition: opacity 200ms ease, transform 200ms ease;
      pointer-events: none;
      user-select: none;
    }

    .nexus-toolbar.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .nexus-toolbar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 6px 10px;
      border: none;
      background: transparent;
      color: #1d1d1f;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      border-radius: 14px;
      transition: background 150ms ease, color 150ms ease;
      white-space: nowrap;
      line-height: 1;
    }

    .nexus-toolbar-btn:hover {
      background: rgba(0, 122, 255, 0.12);
      color: #007aff;
    }

    .nexus-toolbar-btn:active {
      background: rgba(0, 122, 255, 0.2);
      transform: scale(0.96);
    }

    .nexus-toolbar-btn .btn-icon {
      font-size: 13px;
      line-height: 1;
    }

    .nexus-toolbar-btn .btn-label {
      font-size: 11px;
    }

    .nexus-toolbar-divider {
      width: 1px;
      height: 16px;
      background: rgba(0, 0, 0, 0.1);
      margin: 0 2px;
      flex-shrink: 0;
    }
  `;
}

function ensureHost(): { host: HTMLElement; shadow: ShadowRoot } {
  let existing = document.getElementById(HOST_ID);
  if (existing && existing.shadowRoot) {
    toolbarHost = existing;
    shadowRoot = existing.shadowRoot;
    return { host: existing, shadow: existing.shadowRoot };
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: static; width: 0; height: 0;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getToolbarStyles();
  shadow.appendChild(style);

  const toolbar = document.createElement('div');
  toolbar.className = 'nexus-toolbar';
  toolbar.id = 'nexus-toolbar';
  shadow.appendChild(toolbar);

  (document.documentElement || document.body).appendChild(host);

  toolbarHost = host;
  shadowRoot = shadow;
  return { host, shadow };
}

function getLabel(action: ToolbarAction): string {
  return t(currentLang, action.labelKey);
}

function renderToolbarActions(): void {
  if (!shadowRoot) return;
  const toolbar = shadowRoot.getElementById('nexus-toolbar');
  if (!toolbar) return;

  toolbar.innerHTML = '';

  const actions = DEFAULT_ACTIONS;
  actions.forEach((action, index) => {
    if (index > 0) {
      const divider = document.createElement('div');
      divider.className = 'nexus-toolbar-divider';
      toolbar.appendChild(divider);
    }

    const btn = document.createElement('button');
    btn.className = 'nexus-toolbar-btn';
    btn.dataset.actionId = action.id;
    btn.innerHTML = `<span class="btn-icon">${action.icon}</span><span class="btn-label">${getLabel(action)}</span>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAction(action.id);
    });

    toolbar.appendChild(btn);
  });
}

function handleAction(actionId: string): void {
  if (!currentSelectionData) return;
  hide();
  if (onActionCallback) {
    onActionCallback(actionId, currentSelectionData);
  }
}

function calculatePosition(selectionData: SelectionData): { left: number; top: number } {
  const rect = selectionData.rect;
  const mousePoint = selectionData.mousePoint;

  // Position below the end of the selection, aligned to the right
  let left = mousePoint ? mousePoint.x : rect.right;
  let top = mousePoint ? mousePoint.y + 12 : rect.bottom + 8;

  // Ensure toolbar stays within viewport
  const toolbarWidth = 320;
  const toolbarHeight = 40;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Adjust horizontal position
  if (left + toolbarWidth > viewportWidth - 12) {
    left = viewportWidth - toolbarWidth - 12;
  }
  if (left < 12) {
    left = 12;
  }

  // Adjust vertical position - show above selection if near bottom
  if (top + toolbarHeight > viewportHeight - 12) {
    top = (mousePoint ? mousePoint.y - 12 : rect.top) - toolbarHeight;
  }
  if (top < 12) {
    top = 12;
  }

  return { left, top };
}

export function initSelectionToolbar(
  onAction: (actionId: string, selection: SelectionData) => void,
  lang: 'en' | 'zh-CN' = 'en',
): void {
  onActionCallback = onAction;
  currentLang = lang;
  ensureHost();
}

export function show(selectionData: SelectionData): void {
  const { shadow } = ensureHost();
  const toolbar = shadow.getElementById('nexus-toolbar');
  if (!toolbar) return;

  currentSelectionData = selectionData;
  renderToolbarActions();

  const pos = calculatePosition(selectionData);
  toolbar.style.left = `${pos.left}px`;
  toolbar.style.top = `${pos.top}px`;

  // Trigger show animation
  requestAnimationFrame(() => {
    toolbar.classList.add('visible');
  });
}

export function hide(): void {
  if (!shadowRoot) return;
  const toolbar = shadowRoot.getElementById('nexus-toolbar');
  if (!toolbar) return;

  toolbar.classList.remove('visible');
  currentSelectionData = null;
}

export function setLanguage(lang: 'en' | 'zh-CN'): void {
  currentLang = lang;
  if (currentSelectionData) {
    renderToolbarActions();
  }
}

export function destroy(): void {
  hide();
  if (toolbarHost && toolbarHost.parentNode) {
    toolbarHost.parentNode.removeChild(toolbarHost);
  }
  toolbarHost = null;
  shadowRoot = null;
  currentSelectionData = null;
  onActionCallback = null;
}
