/**
 * Keyboard shortcuts manager for content scripts
 * Listens for configured shortcuts and triggers appropriate actions
 */

const MODIFIER_KEYS = ['ctrl', 'alt', 'shift', 'meta', 'command'];

export interface ShortcutConfig {
  quickAsk: string;       // Default: Ctrl+G
  openPanel: string;      // Default: Alt+S
  areaScreenshot: string; // Default: Ctrl+Shift+S
  fullScreenshot: string; // Default: Ctrl+Shift+A
  ocrCapture: string;     // Default: Alt+O
  browserControl: string; // Default: Ctrl+B
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  quickAsk: 'Ctrl+G',
  openPanel: 'Alt+S',
  areaScreenshot: 'Ctrl+Shift+S',
  fullScreenshot: 'Ctrl+Shift+A',
  ocrCapture: 'Alt+O',
  browserControl: 'Ctrl+B',
};

export interface ShortcutActions {
  onOpenPanel?: () => void;
  onQuickAsk?: () => void;
  onAreaScreenshot?: () => void;
  onFullScreenshot?: () => void;
  onOcrCapture?: () => void;
  onBrowserControl?: () => void;
}

let currentShortcuts: ShortcutConfig = { ...DEFAULT_SHORTCUTS };
let actions: ShortcutActions = {};
let handleDocumentKeydown: ((event: KeyboardEvent) => void) | null = null;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[contenteditable=""], [contenteditable="true"]')) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

/**
 * Parse a shortcut string like "Ctrl+Shift+S" into modifier parts and main key
 */
function parseShortcut(shortcut: string): { modifiers: Set<string>; mainKey: string } | null {
  if (!shortcut || typeof shortcut !== 'string') return null;
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase());
  const mainKeys = parts.filter((p) => !MODIFIER_KEYS.includes(p));
  if (mainKeys.length !== 1) return null;

  const modifiers = new Set(parts.filter((p) => MODIFIER_KEYS.includes(p)));
  return { modifiers, mainKey: mainKeys[0] };
}

/**
 * Check if a keyboard event matches a shortcut string
 */
function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut || typeof shortcut !== 'string') return false;
  if (!event || typeof event.key !== 'string') return false;

  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;

  const key = event.key.toLowerCase();

  const hasCtrl = parsed.modifiers.has('ctrl');
  const hasAlt = parsed.modifiers.has('alt');
  const hasShift = parsed.modifiers.has('shift');
  const hasMeta = parsed.modifiers.has('meta') || parsed.modifiers.has('command');

  if (event.ctrlKey !== hasCtrl) return false;
  if (event.altKey !== hasAlt) return false;
  if (event.shiftKey !== hasShift) return false;
  if (event.metaKey !== hasMeta) return false;

  return key === parsed.mainKey;
}

/**
 * Initialize the shortcut manager
 */
export function initShortcuts(shortcutActions: ShortcutActions): void {
  actions = shortcutActions;

  // Load shortcuts from storage
  chrome.storage.local.get(['nexusShortcuts'], (result: { nexusShortcuts?: Partial<ShortcutConfig> }) => {
    if (chrome.runtime.lastError) {
      console.warn('[Nexus] Failed to load shortcuts:', chrome.runtime.lastError.message);
      return;
    }
    if (result?.nexusShortcuts && typeof result.nexusShortcuts === 'object') {
      currentShortcuts = { ...DEFAULT_SHORTCUTS, ...result.nexusShortcuts };
    }
  });

  // Watch for shortcut changes
  chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: any; oldValue?: any }>, area: string) => {
    if (area === 'local' && changes.nexusShortcuts) {
      const stored = changes.nexusShortcuts.newValue;
      if (stored && typeof stored === 'object') {
        currentShortcuts = { ...DEFAULT_SHORTCUTS, ...stored };
      } else {
        currentShortcuts = { ...DEFAULT_SHORTCUTS };
      }
    }
  });

  // Listen for keydown events
  handleDocumentKeydown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;

    if (matchShortcut(event, currentShortcuts.openPanel)) {
      event.preventDefault();
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
      if (actions.onOpenPanel) actions.onOpenPanel();
      return;
    }

    if (matchShortcut(event, currentShortcuts.quickAsk)) {
      event.preventDefault();
      event.stopPropagation();
      if (actions.onQuickAsk) actions.onQuickAsk();
      return;
    }

    if (matchShortcut(event, currentShortcuts.areaScreenshot)) {
      event.preventDefault();
      event.stopPropagation();
      if (actions.onAreaScreenshot) actions.onAreaScreenshot();
      return;
    }

    if (matchShortcut(event, currentShortcuts.fullScreenshot)) {
      event.preventDefault();
      event.stopPropagation();
      if (actions.onFullScreenshot) actions.onFullScreenshot();
      return;
    }

    if (matchShortcut(event, currentShortcuts.ocrCapture)) {
      event.preventDefault();
      event.stopPropagation();
      if (actions.onOcrCapture) actions.onOcrCapture();
      return;
    }

    if (matchShortcut(event, currentShortcuts.browserControl)) {
      event.preventDefault();
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: 'TOGGLE_SIDE_PANEL_CONTROL' }).catch(() => {});
      if (actions.onBrowserControl) actions.onBrowserControl();
      return;
    }
  };

  document.addEventListener('keydown', handleDocumentKeydown, true);
}

/**
 * Destroy the shortcut manager
 */
export function destroyShortcuts(): void {
  if (handleDocumentKeydown) {
    document.removeEventListener('keydown', handleDocumentKeydown, true);
    handleDocumentKeydown = null;
  }
  actions = {};
}
