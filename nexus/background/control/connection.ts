/**
 * Manages the connection to the Chrome Debugger API.
 * Handles attach/detach lifecycle, CDP command sending, and event routing.
 */

export class BrowserConnection {
  currentTabId: number | null = null;
  targetTabId: number | null = null;
  attached = false;
  private onDetachCallbacks: Array<() => void> = [];
  private eventListeners = new Set<(method: string, params: any) => void>();
  private _currentDialog: { type: string; message: string; defaultPrompt: string } | null = null;

  constructor() {
    // Global listener for CDP events
    chrome.debugger.onEvent.addListener(this._handleEvent.bind(this));
    // Monitor external detachments (user closed tab, clicked Cancel on infobar)
    chrome.debugger.onDetach.addListener(this._onDebuggerDetached.bind(this));
  }

  private _handleEvent(source: { tabId?: number }, method: string, params: any): void {
    if (this.attached && this.currentTabId === source.tabId) {
      if (method === 'Page.javascriptDialogOpening') {
        this._currentDialog = {
          type: params?.type || 'dialog',
          message: params?.message || '',
          defaultPrompt: params?.defaultPrompt || '',
        };
      } else if (method === 'Page.javascriptDialogClosed') {
        this._currentDialog = null;
      }
      for (const callback of Array.from(this.eventListeners)) {
        try {
          callback(method, params);
        } catch (error) {
          console.warn('[BrowserConnection] Event listener failed:', error);
        }
      }
    }
  }

  private _onDebuggerDetached(source: { tabId?: number }): void {
    if (this.currentTabId === source.tabId) {
      this._cleanupState();
    }
  }

  private _cleanupState(): void {
    this.attached = false;
    this.currentTabId = null;
    this._currentDialog = null;
    for (const callback of this.onDetachCallbacks) {
      try {
        callback();
      } catch (error) {
        console.warn('[BrowserConnection] Detach callback failed:', error);
      }
    }
  }

  addListener(callback: (method: string, params: any) => void): void {
    this.eventListeners.add(callback);
  }

  removeListener(callback: (method: string, params: any) => void): void {
    this.eventListeners.delete(callback);
  }

  onDetach(callback: () => void): void {
    this.onDetachCallbacks.push(callback);
  }

  getDialog(): { type: string; message: string; defaultPrompt: string } | null {
    return this._currentDialog;
  }

  clearDialog(): void {
    this._currentDialog = null;
  }

  private async _enableDomains(): Promise<void> {
    await this.sendCommand('Runtime.enable');
    await this.sendCommand('Page.enable');
    try {
      await this.sendCommand('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      });
    } catch {
      // Target auto-attach unavailable in some contexts
    }
  }

  async attach(tabId: number): Promise<boolean> {
    this.targetTabId = tabId;

    // Already attached to the same tab - refresh domains
    if (this.attached && this.currentTabId === tabId) {
      try {
        await this._enableDomains();
      } catch (error) {
        console.warn('Failed to refresh debugger domains:', error);
      }
      return true;
    }

    // Attached to a different tab - detach first
    if (this.attached && this.currentTabId !== tabId) {
      await this.detach();
    }

    return new Promise((resolve) => {
      chrome.debugger.attach({ tabId }, '1.3', async () => {
        if (chrome.runtime.lastError) {
          const message = chrome.runtime.lastError.message;
          console.warn('[BrowserConnection] Attach failed:', message);
          resolve(false);
          return;
        }

        this.attached = true;
        this.currentTabId = tabId;

        try {
          await this._enableDomains();
        } catch (error) {
          console.warn('Failed to enable debugger domains:', error);
          await this.detach();
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  async detach(): Promise<void> {
    if (!this.attached || !this.currentTabId) return;
    const tabId = this.currentTabId;
    return new Promise((resolve) => {
      chrome.debugger.detach({ tabId }, () => {
        // Consume lastError to prevent warnings if tab was already closed
        if (chrome.runtime.lastError) {
          console.debug('[BrowserConnection] Detach ignored:', chrome.runtime.lastError.message);
        }
        this._cleanupState();
        resolve();
      });
    });
  }

  sendCommand(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (!this.attached || !this.currentTabId) {
      throw new Error('No active debugger session');
    }
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(
        { tabId: this.currentTabId! },
        method,
        params,
        (result: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        },
      );
    });
  }
}
