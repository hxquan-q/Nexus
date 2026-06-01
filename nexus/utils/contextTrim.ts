/**
 * Context trimming utility
 * Estimates token counts and trims old messages when approaching provider limits.
 * The full messages remain in IndexedDB; only the API context is trimmed.
 */

import type { ChatMessage } from './providers/types';
import { estimateTokens } from './tokenCount';

// ============================================================
// Per-provider context limits (tokens)
// ============================================================

const CONTEXT_LIMITS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 128000,
  'gpt-3.5-turbo': 16384,
  'o1': 200000,
  'o1-mini': 128000,
  'o3-mini': 200000,
  'claude-sonnet': 200000,
  'claude-sonnet-4': 200000,
  'claude-opus': 200000,
  'claude-opus-4': 200000,
  'claude-haiku': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'gemini-2': 1000000,
  'gemini-2.5': 1000000,
  'gemini-2.0': 1000000,
  'gemini-1.5': 1000000,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'deepseek-v3': 64000,
  'qwen-max': 32000,
  'qwen-plus': 128000,
  'qwen-turbo': 128000,
};

const DEFAULT_CONTEXT_LIMIT = 128000;

/**
 * Get the context limit for a given model name.
 * Does a fuzzy match - checks if the model name contains any of the keys.
 */
export function getContextLimit(modelName: string): number {
  if (!modelName) return DEFAULT_CONTEXT_LIMIT;

  const lowerModel = modelName.toLowerCase();

  // Exact match first
  if (CONTEXT_LIMITS[lowerModel]) {
    return CONTEXT_LIMITS[lowerModel];
  }

  // Fuzzy match: check if the model name contains the key
  for (const [key, limit] of Object.entries(CONTEXT_LIMITS)) {
    if (lowerModel.includes(key)) {
      return limit;
    }
  }

  return DEFAULT_CONTEXT_LIMIT;
}

export interface TrimResult {
  /** Trimmed messages ready for API */
  messages: ChatMessage[];
  /** Whether any messages were trimmed */
  trimmed: boolean;
  /** Number of messages removed from the beginning */
  trimmedCount: number;
  /** Estimated total tokens before trimming */
  originalTokens: number;
  /** Estimated tokens after trimming */
  trimmedTokens: number;
}

/**
 * Trim messages to fit within context limits.
 * Keeps the system prompt, recent messages, and trims older ones.
 * A trim notice is added as a system note when trimming occurs.
 *
 * @param messages - Full message history
 * @param modelName - Model name for context limit lookup
 * @param systemPromptLength - Estimated tokens for system prompt (to reserve space)
 * @param maxOutputReserve - Tokens to reserve for model output
 */
export function trimMessagesToContextLimit(
  messages: ChatMessage[],
  modelName: string,
  systemPromptLength: number = 0,
  maxOutputReserve: number = 4096,
): TrimResult {
  const contextLimit = getContextLimit(modelName);
  const availableTokens = contextLimit - systemPromptLength - maxOutputReserve;

  // Calculate total tokens
  let totalTokens = 0;
  const messageTokens: number[] = [];
  for (const msg of messages) {
    const tokens = estimateTokens(msg.content || '');
    messageTokens.push(tokens);
    totalTokens += tokens;
  }

  // If total fits, no trimming needed
  if (totalTokens <= availableTokens) {
    return {
      messages,
      trimmed: false,
      trimmedCount: 0,
      originalTokens: totalTokens,
      trimmedTokens: totalTokens,
    };
  }

  // Strategy: keep recent messages, trim from the beginning
  // Keep removing messages from the start until we're under the limit
  // But always keep at least the last 2 message pairs (4 messages)

  const minKeep = Math.min(4, messages.length);
  let trimFrom = 0;

  let runningTokens = totalTokens;
  while (trimFrom < messages.length - minKeep && runningTokens > availableTokens) {
    runningTokens -= messageTokens[trimFrom];
    trimFrom++;
  }

  // If still over limit after aggressive trimming, keep only the last pair
  if (runningTokens > availableTokens && trimFrom < messages.length - 2) {
    trimFrom = messages.length - 2;
    runningTokens = messageTokens.slice(trimFrom).reduce((a, b) => a + b, 0);
  }

  const trimmedMessages = messages.slice(trimFrom);

  return {
    messages: trimmedMessages,
    trimmed: true,
    trimmedCount: trimFrom,
    originalTokens: totalTokens,
    trimmedTokens: runningTokens,
  };
}

/**
 * Create a trimming notice to prepend to messages when trimming occurred.
 */
export function createTrimNotice(trimResult: TrimResult): string {
  return `[Earlier messages trimmed for context length. ${trimResult.trimmedCount} older messages removed to fit within the model's context window.]`;
}
