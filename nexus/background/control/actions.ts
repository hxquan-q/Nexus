/**
 * Browser action implementations.
 * Navigation, interaction, observation, and script evaluation via CDP.
 */

import type { BrowserConnection } from './connection';
import type { SnapshotManager } from './snapshot';

// ============================================================
// Action Waiter - waits for navigation/DOM stability after actions
// ============================================================

class ActionWaiter {
  private connection: BrowserConnection;
  private timeouts = {
    stableDom: 3000,
    stableDomFor: 100,
    expectNavigationIn: 500,
    navigation: 15000,
  };

  constructor(connection: BrowserConnection) {
    this.connection = connection;
  }

  async execute(actionFn: () => Promise<void>): Promise<{ navigatedToUrl?: string }> {
    if (!this.connection.attached) {
      await actionFn();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {};
    }

    try {
      await this.connection.sendCommand('Page.enable');
    } catch {
      // Page events unavailable, action can still run
    }

    const initialUrl = await this._getCurrentUrl();
    const mainFrameId = await this._getMainFrameId();
    const navigationWatcher = this._createNavigationWatcher(mainFrameId);

    try {
      await actionFn();
      await navigationWatcher.wait();
    } catch (error) {
      navigationWatcher.dispose();
      throw error;
    }

    await this.waitForStableDOM();
    const finalUrl = await this._getCurrentUrl();

    return {
      ...(initialUrl && finalUrl && initialUrl !== finalUrl ? { navigatedToUrl: finalUrl } : {}),
    };
  }

  private async _getCurrentUrl(): Promise<string> {
    if (!this.connection.attached) return '';
    try {
      const response = await this.connection.sendCommand('Runtime.evaluate', {
        expression: 'typeof location === "undefined" ? "" : location.href',
        returnByValue: true,
      });
      return typeof response?.result?.value === 'string' ? response.result.value : '';
    } catch {
      return '';
    }
  }

  private async _getMainFrameId(): Promise<string> {
    if (!this.connection.attached) return '';
    try {
      const response = await this.connection.sendCommand('Page.getFrameTree');
      return response?.frameTree?.frame?.id || '';
    } catch {
      return '';
    }
  }

  private _createNavigationWatcher(mainFrameId: string): { wait: () => Promise<boolean>; dispose: () => void } {
    let done = false;
    let sawNavigationStart = false;
    let sawLoadEvent = false;
    let navigationFrameId = '';
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let navigationTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      this.connection.removeListener(listener);
      if (startTimer) clearTimeout(startTimer);
      if (navigationTimer) clearTimeout(navigationTimer);
    };

    let resolvePromise: (value: boolean) => void;
    const waitPromise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });

    const listener = (method: string, params: any) => {
      if (method === 'Page.javascriptDialogOpening' || method === 'Page.navigatedWithinDocument') {
        resolvePromise!(false);
        return;
      }
      if (method === 'Page.frameStartedNavigating') {
        if (mainFrameId && params?.frameId && params.frameId !== mainFrameId) return;
        sawNavigationStart = true;
        navigationFrameId = params?.frameId || mainFrameId || '';
        if (startTimer) { clearTimeout(startTimer); startTimer = null; }
        if (sawLoadEvent) { resolvePromise!(true); return; }
        if (navigationTimer) { clearTimeout(navigationTimer); navigationTimer = null; }
        navigationTimer = setTimeout(() => resolvePromise!(false), this.timeouts.navigation);
        return;
      }
      if (method === 'Page.loadEventFired' || method === 'Page.frameStoppedLoading') {
        sawLoadEvent = true;
        if (sawNavigationStart) resolvePromise!(true);
      }
    };

    this.connection.addListener(listener);
    startTimer = setTimeout(() => resolvePromise!(false), this.timeouts.expectNavigationIn);

    return {
      wait: () => { done = true; return waitPromise; },
      dispose: cleanup,
    };
  }

  async waitForStableDOM(): Promise<void> {
    if (!this.connection.attached) return;
    if (this.connection.getDialog()) return;
    try {
      await this.connection.sendCommand('Runtime.evaluate', {
        expression: `(async () => {
          const startTime = Date.now();
          while (typeof document === 'undefined' || !document.body) {
            if (Date.now() - startTime > ${this.timeouts.stableDom}) return false;
            await new Promise(r => setTimeout(r, 100));
          }
          return await new Promise(resolve => {
            let timer = null;
            const observer = new MutationObserver(() => {
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => { observer.disconnect(); resolve(true); }, ${this.timeouts.stableDomFor});
            });
            observer.observe(document.body, { attributes: true, childList: true, subtree: true });
            timer = setTimeout(() => { observer.disconnect(); resolve(false); }, ${this.timeouts.stableDomFor});
            setTimeout(() => { observer.disconnect(); resolve(false); }, Math.max(100, ${this.timeouts.stableDom} - (Date.now() - startTime)));
          });
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
    } catch {
      // Ignore if runtime context is gone
    }
  }
}

// ============================================================
// Base action handler
// ============================================================

class BaseActionHandler {
  protected connection: BrowserConnection;
  protected snapshotManager: SnapshotManager;
  protected waitHelper: ActionWaiter;

  constructor(connection: BrowserConnection, snapshotManager: SnapshotManager, waitHelper?: ActionWaiter) {
    this.connection = connection;
    this.snapshotManager = snapshotManager;
    this.waitHelper = waitHelper || new ActionWaiter(connection);
  }

  protected cmd(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return this.connection.sendCommand(method, params);
  }

  protected async getObjectIdFromUid(uid: string): Promise<string> {
    const backendNodeId = this.snapshotManager.getBackendNodeId(uid);
    if (!backendNodeId) {
      throw new Error(`Node with uid ${uid} has no backend ID.`);
    }
    try {
      const { object } = await this.cmd('DOM.resolveNode', { backendNodeId });
      if (!object?.objectId) {
        throw new Error(`Element ${uid} is detached from the DOM. Take a new snapshot.`);
      }
      // Trigger highlight for visual feedback
      this._doHighlight({ objectId: object.objectId }).catch(() => {});
      return object.objectId;
    } catch (error) {
      throw new Error(`Element ${uid} is detached from the DOM. Take a new snapshot.`);
    }
  }

  private async _doHighlight(params: { objectId: string }): Promise<void> {
    try {
      await this.cmd('Overlay.enable');
      await this.cmd('Overlay.highlightNode', {
        ...params,
        highlightConfig: {
          showInfo: true,
          contentColor: { r: 0, g: 122, b: 255, a: 0.3 },
          borderColor: { r: 0, g: 122, b: 255, a: 0.8 },
        },
      });
      setTimeout(() => {
        this.cmd('Overlay.hideHighlight').catch(() => {});
      }, 1500);
    } catch {
      // Ignore highlight errors
    }
  }
}

// ============================================================
// Navigation actions
// ============================================================

export class NavigationActions extends BaseActionHandler {
  async navigatePage(args: { url?: string; type?: string; ignoreCache?: boolean }): Promise<string> {
    const tabId = this.connection.targetTabId || this.connection.currentTabId;
    if (!tabId) return 'Error: No target tab identified.';

    const navType = args.type || (args.url ? 'url' : '');
    if (!['url', 'back', 'forward', 'reload'].includes(navType)) {
      return "Error: 'type' must be one of: url, back, forward, reload.";
    }
    if (navType === 'url' && (typeof args.url !== 'string' || !args.url.trim())) {
      return "Error: 'url' is required when type is 'url'.";
    }

    let action = '';
    const waitResult = await this.waitHelper.execute(async () => {
      if (navType === 'back') {
        await chrome.tabs.goBack(tabId);
        action = 'Navigated back';
      } else if (navType === 'forward') {
        await chrome.tabs.goForward(tabId);
        action = 'Navigated forward';
      } else if (navType === 'reload') {
        await chrome.tabs.reload(tabId, { bypassCache: args.ignoreCache === true });
        action = args.ignoreCache ? 'Reloaded page bypassing cache' : 'Reloaded page';
      } else {
        await chrome.tabs.update(tabId, { url: args.url!.trim() });
        action = `Navigating to ${args.url!.trim()}`;
      }
    });

    this.snapshotManager.reset?.();

    if (!action) return 'Error: Invalid navigation arguments.';
    return waitResult?.navigatedToUrl
      ? `${action}. Current URL: ${waitResult.navigatedToUrl}`
      : action;
  }

  async newPage(args: { url?: string }): Promise<string> {
    const targetUrl = args.url || 'about:blank';
    const tab = await chrome.tabs.create({ url: targetUrl });
    if (!tab?.id) return 'Error: Created page did not return a tab id.';
    return `Created new page (id: ${tab.id}) loading ${targetUrl}`;
  }

  async closePage(args: { index: number }): Promise<string> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tab = tabs[args.index];
    if (!tab?.id) return `Error: Page index ${args.index} not found.`;

    await chrome.tabs.remove(tab.id);
    return `Closed page ${args.index}: ${tab.title || tab.url || 'Untitled'}`;
  }

  async listPages(): Promise<string> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const targetTabId = this.connection.targetTabId || this.connection.currentTabId;
    return tabs
      .map((tab: any, index: number) => {
        const selected = tab.id === targetTabId ? ' [selected]' : '';
        return `${index}: ${tab.title || 'Untitled'} (${tab.url || ''})${selected}`;
      })
      .join('\n');
  }

  async selectPage(args: { index: number }): Promise<string> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tab = tabs[args.index];
    if (!tab?.id) return `Error: Index ${args.index} not found.`;
    return `Selected page ${args.index}: ${tab.title || 'Untitled'}`;
  }
}

// ============================================================
// Interaction actions
// ============================================================

const MAX_LAYOUT_RETRIES = 3;
const LAYOUT_RETRY_DELAY_MS = 150;

export class InteractionActions extends BaseActionHandler {
  async clickElement(args: { uid: string }): Promise<string> {
    try {
      const objectId = await this.getObjectIdFromUid(args.uid);
      const backendNodeId = this.snapshotManager.getBackendNodeId(args.uid);

      try {
        const { x, y } = await this._getElementCenter(objectId, backendNodeId);

        // Check for occlusion
        const hitTestResult = await this.cmd('Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: `function(x, y) {
            const hit = document.elementFromPoint(x, y);
            if (!hit) return false;
            return this.contains(hit) || hit.contains(this);
          }`,
          arguments: [{ value: x }, { value: y }],
          returnByValue: true,
        });

        if (!hitTestResult?.result?.value) {
          throw new Error('OCCLUSION_DETECTED');
        }

        await this.waitHelper.execute(async () => {
          await this.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
          await this.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await this.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        });

        return `Clicked element ${args.uid} at ${Math.round(x)},${Math.round(y)}`;
      } catch (error) {
        const isOccluded = (error as Error).message === 'OCCLUSION_DETECTED';
        // JS fallback
        await this.waitHelper.execute(async () => {
          await this.cmd('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `function() {
              this.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
              const rect = this.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
                this.dispatchEvent(new MouseEvent(type, { view: window, bubbles: true, cancelable: true, composed: true, buttons: 1, clientX: x, clientY: y }));
              });
              if (this.focus) this.focus();
            }`,
          });
        });
        return `Clicked element ${args.uid} (${isOccluded ? 'Occluded, ' : ''}JS Fallback)`;
      }
    } catch (error) {
      return `Error clicking element ${args.uid}: ${(error as Error).message}. Take a new snapshot before retrying.`;
    }
  }

  async hoverElement(args: { uid: string }): Promise<string> {
    try {
      const objectId = await this.getObjectIdFromUid(args.uid);
      const backendNodeId = this.snapshotManager.getBackendNodeId(args.uid);
      try {
        const { x, y } = await this._getElementCenter(objectId, backendNodeId);
        await this.waitHelper.execute(async () => {
          await this.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        });
        return `Hovered element ${args.uid} at ${Math.round(x)},${Math.round(y)}`;
      } catch {
        // JS fallback
        await this.waitHelper.execute(async () => {
          await this.cmd('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `function() {
              this.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
              const rect = this.getBoundingClientRect();
              ['mouseover', 'mouseenter', 'mousemove'].forEach(type => {
                this.dispatchEvent(new MouseEvent(type, { view: window, bubbles: type !== 'mouseenter', cancelable: true, composed: true, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 }));
              });
            }`,
          });
        });
        return `Hovered element ${args.uid} (JS Fallback)`;
      }
    } catch (error) {
      return `Error hovering element ${args.uid}: ${(error as Error).message}`;
    }
  }

  async fillElement(args: { uid: string; value: string }): Promise<string> {
    try {
      const objectId = await this.getObjectIdFromUid(args.uid);
      await this.waitHelper.execute(async () => {
        // Focus and get element info
        const info = await this.cmd('Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: `function() {
            this.focus();
            return { tagName: this.tagName, isContentEditable: this.isContentEditable };
          }`,
          returnByValue: true,
        });

        const { tagName } = info.result.value || {};
        const isSelect = tagName === 'SELECT';

        if (isSelect) {
          await this.cmd('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `function(targetValue) {
              let found = false;
              for (let i = 0; i < this.options.length; i++) {
                if (this.options[i].value === targetValue) { this.selectedIndex = i; found = true; break; }
              }
              if (!found) {
                for (let i = 0; i < this.options.length; i++) {
                  if (this.options[i].text === targetValue) { this.selectedIndex = i; break; }
                }
              }
              this.dispatchEvent(new Event('input', { bubbles: true }));
              this.dispatchEvent(new Event('change', { bubbles: true }));
            }`,
            arguments: [{ value: args.value }],
          });
        } else {
          // Clear and type
          await this.cmd('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `function() {
              this.focus();
              if (this.select) this.select();
            }`,
          });
          await this.cmd('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' });
          await this.cmd('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' });
          if (args.value) {
            await this.cmd('Input.insertText', { text: args.value });
          }
          await this.cmd('Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `function() { this.dispatchEvent(new Event('change', { bubbles: true })); }`,
          });
        }
      });
      return `Filled element ${args.uid}`;
    } catch (error) {
      return `Error filling element ${args.uid}: ${(error as Error).message}. Take a new snapshot before retrying.`;
    }
  }

  async fillForm(args: { elements: Array<{ uid: string; value: string }> }): Promise<string> {
    if (!Array.isArray(args.elements) || args.elements.length === 0) {
      return "Error: 'elements' must be a non-empty array.";
    }
    for (let i = 0; i < args.elements.length; i++) {
      const el = args.elements[i];
      if (!el?.uid || typeof el.value !== 'string') {
        return `Error: Element ${i + 1} requires 'uid' and 'value' fields.`;
      }
      const result = await this.fillElement(el);
      if (result.startsWith('Error')) {
        return `Error filling form element ${i + 1}/${args.elements.length}: ${result}`;
      }
    }
    return `Filled form (${args.elements.length} elements)`;
  }

  async pressKey(args: { key: string }): Promise<string> {
    try {
      const MODIFIER_BITS: Record<string, number> = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
      const MODIFIER_ALIASES: Record<string, string> = { Ctrl: 'Control', Cmd: 'Meta', Command: 'Meta', Option: 'Alt' };

      const KEY_MAP: Record<string, any> = {
        Control: { windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, key: 'Control', code: 'ControlLeft' },
        Shift: { windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, key: 'Shift', code: 'ShiftLeft' },
        Alt: { windowsVirtualKeyCode: 18, nativeVirtualKeyCode: 18, key: 'Alt', code: 'AltLeft' },
        Meta: { windowsVirtualKeyCode: 91, nativeVirtualKeyCode: 91, key: 'Meta', code: 'MetaLeft' },
        Enter: { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
        Backspace: { windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' },
        Tab: { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' },
        Escape: { windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' },
        Delete: { windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46, key: 'Delete', code: 'Delete' },
        ArrowDown: { windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown' },
        ArrowUp: { windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38, key: 'ArrowUp', code: 'ArrowUp' },
        ArrowLeft: { windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft' },
        ArrowRight: { windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39, key: 'ArrowRight', code: 'ArrowRight' },
        Space: { windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, key: ' ', code: 'Space', text: ' ' },
      };

      const tokens = String(args.key).split('+').map(t => MODIFIER_ALIASES[t] || t).filter(Boolean);
      const mainKey = tokens[tokens.length - 1];
      const modifiers = tokens.slice(0, -1);

      await this.waitHelper.execute(async () => {
        let modifierBits = 0;
        for (const mod of modifiers) {
          if (!(mod in MODIFIER_BITS)) throw new Error(`Modifier '${mod}' not supported.`);
          modifierBits |= MODIFIER_BITS[mod];
          const def = KEY_MAP[mod];
          if (def) await this.cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...def, modifiers: modifierBits });
        }

        const mainDef = KEY_MAP[mainKey] || {
          windowsVirtualKeyCode: mainKey.charCodeAt(0),
          nativeVirtualKeyCode: mainKey.charCodeAt(0),
          key: mainKey,
          code: undefined,
          modifiers: modifierBits,
          ...(modifierBits === 0 ? { text: mainKey } : {}),
        };
        await this.cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...mainDef });
        await this.cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...mainDef });

        for (const mod of [...modifiers].reverse()) {
          modifierBits &= ~MODIFIER_BITS[mod];
          const def = KEY_MAP[mod];
          if (def) await this.cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...def, modifiers: modifierBits });
        }
      });

      return `Pressed key: ${args.key}`;
    } catch (error) {
      return `Error pressing key ${args.key}: ${(error as Error).message}`;
    }
  }

  async typeText(args: { text: string }): Promise<string> {
    try {
      await this.waitHelper.execute(async () => {
        if (args.text) {
          await this.cmd('Input.insertText', { text: args.text });
        }
      });
      return `Typed text: ${args.text}`;
    } catch (error) {
      return `Error typing text: ${(error as Error).message}`;
    }
  }

  private async _getElementCenter(objectId: string, backendNodeId: number): Promise<{ x: number; y: number }> {
    for (let attempt = 0; attempt < MAX_LAYOUT_RETRIES; attempt++) {
      try {
        await this.cmd('DOM.scrollIntoViewIfNeeded', { objectId });
        const { model } = await this.cmd('DOM.getBoxModel', { backendNodeId });
        if (!model?.content) throw new Error('No box model');
        return {
          x: (model.content[0] + model.content[4]) / 2,
          y: (model.content[1] + model.content[5]) / 2,
        };
      } catch (error) {
        if (attempt < MAX_LAYOUT_RETRIES - 1) {
          await new Promise(r => setTimeout(r, LAYOUT_RETRY_DELAY_MS));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Unable to resolve element center');
  }
}

// ============================================================
// Observation actions
// ============================================================

export class ObservationActions extends BaseActionHandler {
  async waitFor(args: { text: string; timeout?: number }): Promise<string> {
    const targets = [String(args.text || '').trim()].filter(Boolean);
    if (targets.length === 0) return "Error: 'text' must be a non-empty string.";
    const timeoutMs = typeof args.timeout === 'number' && args.timeout > 0 ? args.timeout : 5000;

    try {
      const result = await this.cmd('Runtime.evaluate', {
        expression: `(async () => {
          const targets = ${JSON.stringify(targets)};
          const timeoutMs = ${timeoutMs};
          const getPageText = () => document.body ? (document.body.innerText || document.body.textContent || '') : '';
          const existing = targets.find(t => getPageText().includes(t));
          if (existing) return existing;
          return await new Promise(resolve => {
            let done = false;
            let observer = null;
            const finish = (value) => { if (done) return; done = true; if (observer) observer.disconnect(); resolve(value); };
            const check = () => { const m = targets.find(t => getPageText().includes(t)); if (m) finish(m); };
            if (document.body) {
              observer = new MutationObserver(check);
              observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            }
            setTimeout(() => finish(null), timeoutMs);
          });
        })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      return result?.result?.value ? `Found text: ${result.result.value}` : `Timed out waiting for text: ${targets.join(', ')}`;
    } catch (error) {
      return `Error waiting for text: ${(error as Error).message}`;
    }
  }

  async handleDialog(args: { action: string; promptText?: string }): Promise<string> {
    try {
      if (!['accept', 'dismiss'].includes(args.action)) {
        return "Error: 'action' must be 'accept' or 'dismiss'.";
      }
      const params: Record<string, unknown> = { accept: args.action === 'accept' };
      if (args.promptText !== undefined) params.promptText = String(args.promptText);
      await this.cmd('Page.handleJavaScriptDialog', params);
      this.connection.clearDialog();
      return args.action === 'accept' ? 'Accepted dialog' : 'Dismissed dialog';
    } catch (error) {
      return `Error handling dialog: ${(error as Error).message}`;
    }
  }

  async evaluateScript(args: { script: string }): Promise<string> {
    try {
      if (typeof args.script !== 'string' || !args.script.trim()) {
        return "Error: 'script' must be a non-empty string.";
      }
      const response = await this.cmd('Runtime.evaluate', {
        expression: `(async () => { ${args.script} })()`,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      if (response.exceptionDetails) {
        return `Script Exception: ${response.exceptionDetails.text}`;
      }
      if (response.result) {
        if (response.result.type === 'undefined') return 'undefined';
        const value = response.result.value;
        if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2);
        return String(value);
      }
      return 'undefined';
    } catch (error) {
      return `Error evaluating script: ${(error as Error).message}`;
    }
  }
}

// ============================================================
// Aggregated BrowserActions
// ============================================================

export class BrowserActions {
  navigation: NavigationActions;
  interaction: InteractionActions;
  observation: ObservationActions;

  constructor(connection: BrowserConnection, snapshotManager: SnapshotManager) {
    const waitHelper = new ActionWaiter(connection);
    this.navigation = new NavigationActions(connection, snapshotManager, waitHelper);
    this.interaction = new InteractionActions(connection, snapshotManager, waitHelper);
    this.observation = new ObservationActions(connection, snapshotManager, waitHelper);
  }
}
