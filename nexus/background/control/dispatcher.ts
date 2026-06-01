/**
 * Tool dispatcher - maps tool names to executable actions.
 * Routes browser control tool calls to the appropriate action handler.
 */

import { BrowserActions } from './actions';
import { SnapshotManager } from './snapshot';
import type { BrowserConnection } from './connection';

export interface DispatchResult {
  output: string;
  meta?: {
    switchTabId?: number;
    clearTarget?: boolean;
  };
}

export class ToolDispatcher {
  private actions: BrowserActions;
  private snapshotManager: SnapshotManager;
  private connection: BrowserConnection;

  constructor(connection: BrowserConnection, snapshotManager: SnapshotManager) {
    this.connection = connection;
    this.snapshotManager = snapshotManager;
    this.actions = new BrowserActions(connection, snapshotManager);
  }

  async dispatch(name: string, args: Record<string, unknown> = {}): Promise<string> {
    let result: any = '';

    switch (name) {
      // Navigation
      case 'browser_navigate':
        result = await this.actions.navigation.navigatePage(args as any);
        break;
      case 'browser_new_page':
        result = await this.actions.navigation.newPage(args as any);
        break;
      case 'browser_close_page':
        result = await this.actions.navigation.closePage(args as any);
        break;
      case 'browser_list_pages':
        result = await this.actions.navigation.listPages();
        break;
      case 'browser_select_page':
        result = await this.actions.navigation.selectPage(args as any);
        break;

      // Interaction
      case 'browser_click':
        result = await this.actions.interaction.clickElement(args as any);
        break;
      case 'browser_hover':
        result = await this.actions.interaction.hoverElement(args as any);
        break;
      case 'browser_fill':
        result = await this.actions.interaction.fillElement(args as any);
        break;
      case 'browser_fill_form':
        result = await this.actions.interaction.fillForm(args as any);
        break;
      case 'browser_press_key':
        result = await this.actions.interaction.pressKey(args as any);
        break;
      case 'browser_type_text':
        result = await this.actions.interaction.typeText(args as any);
        break;

      // Observation
      case 'browser_take_snapshot':
        result = await this.snapshotManager.takeSnapshot(args as any);
        break;
      case 'browser_wait_for':
        result = await this.actions.observation.waitFor(args as any);
        break;
      case 'browser_handle_dialog':
        result = await this.actions.observation.handleDialog(args as any);
        break;

      // Script
      case 'browser_evaluate':
        result = await this.actions.observation.evaluateScript(args as any);
        break;

      // Vision
      case 'browser_take_screenshot':
        result = await this.takeScreenshot();
        break;

      default:
        return `Error: Unknown tool '${name}'`;
    }

    // Handle structured results
    if (typeof result === 'object' && result !== null && 'output' in result) {
      // Append dialog hint if applicable
      const dialog = this.connection.getDialog();
      let output: string = result.output;
      if (dialog && name !== 'browser_handle_dialog') {
        output += `\n\n# Open dialog\n${dialog.type}: ${dialog.message}. Call browser_handle_dialog before continuing.`;
      }
      return output;
    }

    return String(result);
  }

  private async takeScreenshot(): Promise<string> {
    try {
      // Use chrome.tabs.captureVisibleTab for screenshot
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) return 'Error: No active tab found.';
      const windowId = tabs[0].windowId;
      if (!windowId) return 'Error: No window ID.';

      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      if (!dataUrl) return 'Error: Failed to capture screenshot.';

      // Return the data URL - the sidepanel will handle displaying it
      return `[SCREENSHOT:${dataUrl}]`;
    } catch (error) {
      return `Error taking screenshot: ${(error as Error).message}`;
    }
  }
}
