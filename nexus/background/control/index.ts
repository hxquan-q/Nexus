/**
 * ControlManager - Top-level browser control manager.
 * Manages the CDP connection, snapshot, and tool dispatch lifecycle.
 */

import { BrowserConnection } from './connection';
import { SnapshotManager } from './snapshot';
import { ToolDispatcher } from './dispatcher';

export class ControlManager {
  connection: BrowserConnection;
  snapshotManager: SnapshotManager;
  dispatcher: ToolDispatcher;
  private controlledGroupId: number | null = null;
  private controlledWindowId: number | null = null;

  constructor() {
    this.connection = new BrowserConnection();
    this.snapshotManager = new SnapshotManager(this.connection);
    this.dispatcher = new ToolDispatcher(this.connection, this.snapshotManager);
  }

  /**
   * Start a browser control session on a given tab.
   */
  async startSession(tabId: number, taskTitle?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const attached = await this.connection.attach(tabId);
      if (!attached) {
        return { success: false, error: 'Failed to attach debugger to tab. The page may be restricted.' };
      }

      // Get the window ID
      const tab = await chrome.tabs.get(tabId);
      this.controlledWindowId = tab.windowId;

      // Create a tab group if supported
      if (taskTitle && chrome.tabs.group) {
        try {
          const groupId = await chrome.tabs.group({ tabIds: [tabId] });
          this.controlledGroupId = groupId;
          await chrome.tabGroups.update(groupId, { title: `Nexus: ${taskTitle.substring(0, 30)}`, color: 'blue' });
        } catch {
          // Tab grouping not available or failed
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * End the browser control session.
   */
  async endSession(): Promise<void> {
    await this.connection.detach();
    this.controlledGroupId = null;
    this.controlledWindowId = null;
  }

  /**
   * Execute a browser control tool command.
   */
  async executeCommand(name: string, args: Record<string, unknown> = {}): Promise<string> {
    return this.dispatcher.dispatch(name, args);
  }

  /**
   * Check if the debugger is currently attached.
   */
  isActive(): boolean {
    return this.connection.attached;
  }

  /**
   * Get the currently controlled tab ID.
   */
  getCurrentTabId(): number | null {
    return this.connection.currentTabId;
  }
}

// Singleton instance for the background service worker
let controlManagerInstance: ControlManager | null = null;

export function getControlManager(): ControlManager {
  if (!controlManagerInstance) {
    controlManagerInstance = new ControlManager();
  }
  return controlManagerInstance;
}
