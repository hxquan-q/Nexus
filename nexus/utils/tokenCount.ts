/**
 * Simple token estimation for context window management.
 * Not exact, but good enough for UI indicators and auto-trimming.
 *
 * Average: 1 token ~ 4 chars for English, ~ 2 chars for Chinese.
 */

export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(otherChars / 4 + chineseChars / 2);
}

export function estimateMessagesTokens(messages: { content: string }[]): number {
  return messages.reduce((sum, m) => {
    return sum + estimateTokens(m.content || '');
  }, 0);
}
