/**
 * Skill script execution
 * Handles user confirmation and execution of skill scripts via chrome.scripting API
 */

import type { Skill, SkillScript } from './skills';
import { getSkillFileAsText } from './skills';

// ============================================================
// Types
// ============================================================

export interface ScriptExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executedAt: number;
}

export interface ScriptConfirmationRequest {
  skillId: string;
  skillName: string;
  scriptName: string;
  scriptContent: string;
}

export type ScriptConfirmCallback = (
  request: ScriptConfirmationRequest,
) => Promise<{ confirmed: boolean; trustForever: boolean }>;

// ============================================================
// State
// ============================================================

let confirmCallback: ScriptConfirmCallback | null = null;

// Trusted scripts stored in memory (session-only for simplicity)
const trustedScripts = new Set<string>();

export function setScriptConfirmCallback(callback: ScriptConfirmCallback): void {
  confirmCallback = callback;
}

// ============================================================
// Execution
// ============================================================

/**
 * Execute a skill script.
 * First-time execution requires user confirmation unless already trusted.
 */
export async function executeScript(options: {
  skill: Skill;
  script: SkillScript;
  tabId?: number;
  arguments?: Record<string, unknown>;
}): Promise<ScriptExecutionResult> {
  const { skill, script, tabId } = options;
  const scriptKey = `${skill.id}:${script.name}`;

  // Check if trusted
  if (!trustedScripts.has(scriptKey)) {
    if (!confirmCallback) {
      return {
        success: false,
        error: 'Script execution requires user confirmation, but no confirmation handler is set',
        executedAt: Date.now(),
      };
    }

    const scriptContent = script.content || (await getSkillFileAsText(skill.id, script.path)) || '';

    const confirmation = await confirmCallback({
      skillId: skill.id,
      skillName: skill.metadata.name,
      scriptName: script.name,
      scriptContent,
    });

    if (!confirmation.confirmed) {
      return {
        success: false,
        error: 'User declined script execution',
        executedAt: Date.now(),
      };
    }

    if (confirmation.trustForever) {
      trustedScripts.add(scriptKey);
    }
  }

  try {
    const scriptContent = script.content || (await getSkillFileAsText(skill.id, script.path)) || '';
    const targetTabId = tabId || (await getActiveTabId());

    if (!targetTabId) {
      return {
        success: false,
        error: 'No active tab found for script execution',
        executedAt: Date.now(),
      };
    }

    const result = await executeViaBackground(targetTabId, scriptContent, options.arguments || {});
    return {
      success: true,
      output: result,
      executedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Script execution failed',
      executedAt: Date.now(),
    };
  }
}

/**
 * Validate a script for potential security issues.
 */
export function validateScript(content: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  const patterns = [
    { pattern: /eval\s*\(/, message: 'Uses eval() - potential security risk' },
    { pattern: /Function\s*\(/, message: 'Uses Function constructor - potential security risk' },
    { pattern: /document\.cookie/, message: 'Attempts to access cookies' },
    { pattern: /localStorage|sessionStorage/, message: 'Attempts to access local storage' },
    { pattern: /chrome\.|browser\./, message: 'Attempts to access browser extension APIs' },
  ];

  for (const { pattern, message } of patterns) {
    if (pattern.test(content)) {
      warnings.push(message);
    }
  }

  return { valid: true, warnings };
}

// ============================================================
// Internal
// ============================================================

async function getActiveTabId(): Promise<number | undefined> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  } catch {
    return undefined;
  }
}

async function executeViaBackground(
  tabId: number,
  code: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await browser.runtime.sendMessage({
    type: 'EXECUTE_SKILL_SCRIPT',
    tabId,
    code,
    args,
  });

  if (response?.success) {
    return response.result;
  } else {
    throw new Error(response?.error || 'Script execution failed');
  }
}
