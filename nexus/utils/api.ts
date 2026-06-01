/**
 * Multi-provider streaming API layer
 * Uses the OpenAI SDK with provider-specific configuration
 * Supports tool calling (ReAct loop) for browser control and extraction tools.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { AIProvider, ChatMessage, ChatImage, StreamEvent, ToolCall, ToolResult } from './providers/types';
import { getAdapterConfig, isOpenAICompatible } from './providers/adapters';
import { getSystemPrompt } from './storage';

// ============================================================
// Error handling
// ============================================================

export type ApiErrorCode =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'MODEL_NOT_FOUND'
  | 'CONTEXT_LENGTH'
  | 'PROVIDER_ERROR'
  | 'ABORTED'
  | 'UNKNOWN';

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly originalError?: unknown;

  constructor(
    message: string,
    code: ApiErrorCode,
    retryable: boolean = false,
    originalError?: unknown,
    status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable;
    this.originalError = originalError;
    this.status = status;
  }

  /**
   * Create an ApiError from an HTTP status code.
   */
  static fromStatusCode(status: number, message: string): ApiError {
    if (status === 401 || status === 403) {
      return new ApiError('Invalid API key. Please check your credentials in Settings.', 'AUTH', false, undefined, status);
    }
    if (status === 429) {
      return new ApiError('Rate limited by the provider. Please wait a moment and try again.', 'RATE_LIMIT', true, undefined, status);
    }
    if (status === 404) {
      return new ApiError('Model not found. The selected model may not be available.', 'MODEL_NOT_FOUND', false, undefined, status);
    }
    if (status === 400) {
      // Check for context_length_exceeded pattern in message
      if (message.includes('context_length_exceeded') || message.includes('max_tokens') || message.includes('too many tokens') || message.includes('reduce the length')) {
        return new ApiError('The conversation is too long. The context length limit has been exceeded. Try starting a new chat or using fewer attachments.', 'CONTEXT_LENGTH', false, undefined, status);
      }
      return new ApiError('Invalid request. The model may not support this feature.', 'PROVIDER_ERROR', false, undefined, status);
    }
    if (status === 402) {
      return new ApiError('Payment required. Please check your provider billing or add credits.', 'AUTH', false, undefined, status);
    }
    if (status >= 500) {
      return new ApiError('The AI provider server is experiencing issues. Please try again later.', 'PROVIDER_ERROR', true, undefined, status);
    }
    return new ApiError(message || 'An unknown error occurred.', 'UNKNOWN', false, undefined, status);
  }
}

function parseError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('Request aborted', 'ABORTED', false, error);
  }

  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;
    const message = error.message ?? '';

    if (status === 401 || status === 403) {
      return new ApiError('Invalid API key. Please check your credentials in Settings.', 'AUTH', false, error, status);
    }
    if (status === 429) {
      return new ApiError('Rate limited by the provider. Please wait a moment and try again.', 'RATE_LIMIT', true, error, status);
    }
    if (status === 404) {
      return new ApiError('Model not found. The selected model may not be available on this provider.', 'MODEL_NOT_FOUND', false, error, status);
    }
    if (status === 400) {
      if (message.includes('context_length_exceeded') || message.includes('max_tokens') || message.includes('too many tokens') || message.includes('reduce the length')) {
        return new ApiError('The conversation is too long. Context length limit exceeded. Try starting a new chat or using fewer attachments.', 'CONTEXT_LENGTH', false, error, status);
      }
      return new ApiError('Invalid request. The model may not support this feature or the parameters are invalid.', 'PROVIDER_ERROR', false, error, status);
    }
    if (status === 402) {
      return new ApiError('Payment required. Please check your provider billing or add credits.', 'AUTH', false, error, status);
    }
    if (status >= 500) {
      return new ApiError('The AI provider server is experiencing issues. Please try again later.', 'PROVIDER_ERROR', true, error, status);
    }

    return new ApiError(message || `API error (${status})`, 'PROVIDER_ERROR', false, error, status);
  }

  // Network errors
  if (error instanceof TypeError) {
    const msg = error.message || '';
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return new ApiError('Network error. Please check your internet connection.', 'NETWORK', true, error);
    }
  }

  // Generic Error with network hints
  if (error instanceof Error) {
    const msg = error.message || '';
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT') || msg.includes('socket hang up')) {
      return new ApiError('Cannot reach server. Please check the base URL and your network connection.', 'NETWORK', true, error);
    }
    return new ApiError(msg, 'UNKNOWN', false, error);
  }

  const message = String(error);
  return new ApiError(message, 'UNKNOWN', false, error);
}

// ============================================================
// Retry helpers
// ============================================================

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  timeout: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  timeout: 60000,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

function createTimeoutController(
  timeout: number,
  externalSignal?: AbortSignal,
): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const handleExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  return {
    controller,
    clear: () => {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', handleExternalAbort);
      }
    },
  };
}

// ============================================================
// Message conversion
// ============================================================

interface ApiMessageTextPart {
  type: 'text';
  text: string;
}

interface ApiMessageImagePart {
  type: 'image_url';
  image_url: { url: string };
}

type ApiMessageContent = string | Array<ApiMessageTextPart | ApiMessageImagePart> | null;

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ApiMessageContent;
  reasoning?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

let lastApiMessages: ApiMessage[] = [];

export function getLastApiMessages(): ApiMessage[] {
  return lastApiMessages;
}

export function setLastApiMessages(messages: ApiMessage[]): void {
  lastApiMessages = messages;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getQuotedText(message: Pick<ChatMessage, 'content' | 'quote'>): string {
  return message.quote ? `[Quote: "${message.quote}"]\n\n${message.content}` : message.content;
}

function buildUserMessageContent(
  message: Pick<ChatMessage, 'content' | 'quote' | 'images'>,
  allowImages: boolean,
): ApiMessageContent {
  const text = getQuotedText(message);
  if (!allowImages || !message.images?.length) return text;

  const parts: Array<ApiMessageTextPart | ApiMessageImagePart> = [];
  if (text.trim().length > 0) {
    parts.push({ type: 'text', text });
  }
  for (const image of message.images) {
    if (image.dataUrl) {
      parts.push({ type: 'image_url', image_url: { url: image.dataUrl } });
    }
  }
  return parts;
}

function convertToOpenAIMessages(messages: ApiMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        tool_call_id: m.tool_call_id || '',
      };
    }
    if (m.role === 'assistant') {
      const msg: any = {
        role: 'assistant' as const,
        content: typeof m.content === 'string' ? m.content : '',
      };
      if (m.tool_calls && m.tool_calls.length > 0) {
        msg.tool_calls = m.tool_calls;
      }
      return msg;
    }
    if (m.role === 'system') {
      return {
        role: 'system' as const,
        content: typeof m.content === 'string' ? m.content : '',
      };
    }
    return {
      role: 'user' as const,
      content: Array.isArray(m.content) ? m.content : (m.content || ''),
    };
  });
}

// ============================================================
// Streaming chat
// ============================================================

export interface StreamChatConfig {
  abortSignal?: AbortSignal;
  retryConfig?: RetryConfig;
  tools?: ChatCompletionTool[];
  toolExecutor?: (toolCall: ToolCall) => Promise<ToolResult>;
  maxToolIterations?: number;
}

function isVisionSupported(provider: AIProvider): boolean {
  return provider.visionModels?.includes(provider.selectedModel) ?? false;
}

/**
 * Main streaming chat function.
 * Yields StreamEvent objects as the AI generates a response.
 * Supports tool calling with ReAct loop pattern.
 */
export async function* streamChat(
  provider: AIProvider,
  messages: ChatMessage[],
  config?: StreamChatConfig,
): AsyncGenerator<StreamEvent, void, unknown> {
  const retryConfig = config?.retryConfig ?? DEFAULT_RETRY_CONFIG;
  const abortSignal = config?.abortSignal;
  const allowImages = isVisionSupported(provider);
  const tools = config?.tools;
  const toolExecutor = config?.toolExecutor;
  const maxToolIterations = config?.maxToolIterations ?? 10;

  const ensureNotAborted = () => {
    if (abortSignal?.aborted) {
      throw new ApiError('Aborted by user', 'ABORTED', false);
    }
  };

  // Only support OpenAI-compatible providers in Phase 1
  if (!isOpenAICompatible(provider.type)) {
    // For Anthropic/Gemini, if the user configured a compatible proxy endpoint,
    // the isOpenAICompatible check may be wrong. Allow it to try anyway since
    // many providers expose OpenAI-compatible endpoints.
    // If it fails, the error will be caught and surfaced to the user.
  }

  const adapterConfig = getAdapterConfig(provider);
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: adapterConfig.baseURL,
    defaultHeaders: adapterConfig.headers,
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
  });

  const systemPrompt = await buildSystemPrompt(!!(tools && tools.length > 0));

  const apiMessages: ApiMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'user' ? buildUserMessageContent(m, allowImages) : m.content,
    })),
  ];

  lastApiMessages = [...apiMessages];

  // ReAct loop: continue until no more tool calls or max iterations reached
  for (let iteration = 0; iteration <= maxToolIterations; iteration++) {
    ensureNotAborted();

    // Streaming with retry loop
    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      ensureNotAborted();
      const { controller, clear } = createTimeoutController(retryConfig.timeout, abortSignal);

      try {
        const createParams: any = {
          model: provider.selectedModel,
          messages: convertToOpenAIMessages(apiMessages),
          stream: true,
        };
        if (tools && tools.length > 0) {
          createParams.tools = tools;
        }

        try {
          stream = await client.chat.completions.create(createParams as OpenAI.ChatCompletionCreateParamsStreaming, {
            signal: controller.signal,
          });
        } catch (toolError: any) {
          // If the provider doesn't support tool calling, retry without tools
          if (tools && tools.length > 0 && toolError?.status === 400) {
            const createParamsNoTools: any = {
              model: provider.selectedModel,
              messages: convertToOpenAIMessages(apiMessages),
              stream: true,
            };
            stream = await client.chat.completions.create(createParamsNoTools as OpenAI.ChatCompletionCreateParamsStreaming, {
              signal: controller.signal,
            });
          } else {
            throw toolError;
          }
        }
        clear();
        break;
      } catch (error) {
        clear();
        if (abortSignal?.aborted) {
          throw new ApiError('Aborted by user', 'ABORTED', false, error);
        }

        const apiError = parseError(error);
        if (!apiError.retryable || attempt >= retryConfig.maxRetries) {
          throw apiError;
        }

        const retryDelay = getRetryDelay(attempt, retryConfig);
        yield { type: 'thinking', message: `Retrying in ${Math.round(retryDelay / 1000)}s (${attempt + 1}/${retryConfig.maxRetries})...` };
        await delay(retryDelay);
        ensureNotAborted();
      }
    }

    if (!stream) {
      throw new ApiError('Failed to create stream', 'UNKNOWN', false);
    }

    // Process stream
    let fullContent = '';
    let fullReasoning = '';
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason: string | null = null;

    try {
      for await (const chunk of stream) {
        ensureNotAborted();

        // Guard against malformed chunks
        if (!chunk?.choices?.length) continue;
        const choice = chunk.choices[0];
        const delta = choice?.delta;
        if (!delta) continue;

        // Track finish_reason
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        // Handle reasoning/thinking content (DeepSeek reasoning_content)
        const reasoningContent = (delta as any)?.reasoning_content;
        if (reasoningContent) {
          fullReasoning += reasoningContent;
          yield { type: 'reasoning', content: reasoningContent };
        }

        // Handle text content (skip empty/whitespace-only deltas that add nothing)
        if (delta?.content) {
          fullContent += delta.content;
          yield { type: 'content', content: delta.content };
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const idx = toolCallDelta.index;
            if (typeof idx !== 'number') continue;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
              });
            }
            const existing = toolCallsMap.get(idx)!;
            if (toolCallDelta.id) existing.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) existing.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments) existing.arguments += toolCallDelta.function.arguments;
          }
        }
      }
    } catch (streamError) {
      // If we already received content, preserve it instead of losing everything
      if (fullContent || fullReasoning) {
        // Yield what we have and stop gracefully
        lastApiMessages = [...apiMessages];
        yield { type: 'done' };
        return;
      }
      if (abortSignal?.aborted) {
        throw new ApiError('Aborted by user', 'ABORTED', false, streamError);
      }
      throw parseError(streamError);
    }

    // Handle finish_reason edge cases
    if (finishReason === 'length') {
      // Context limit hit - append truncation notice
      fullContent += '\n\n*[Response truncated due to context length limit. The conversation may be too long.]*';
      yield { type: 'content', content: '\n\n*[Response truncated due to context length limit. The conversation may be too long.]*' };
    } else if (finishReason === 'content_filter') {
      // Content was blocked by provider filter
      fullContent += '\n\n*[Response was filtered by the AI provider\'s content policy.]*';
      yield { type: 'content', content: '\n\n*[Response was filtered by the AI provider\'s content policy.]*' };
    }

    // Collect tool calls in order, filtering out any without valid IDs
    const toolCalls = Array.from(toolCallsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => tc)
      .filter((tc) => tc.id && tc.name);

    // Update API messages with assistant response
    const assistantMessage: ApiMessage = {
      role: 'assistant',
      content: fullContent || null,
      reasoning: fullReasoning || null,
    };
    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments || '{}',
        },
      }));
    }
    apiMessages.push(assistantMessage);

    // If no tool calls or no executor, we're done
    if (toolCalls.length === 0 || !toolExecutor) {
      lastApiMessages = [...apiMessages];
      yield { type: 'done' };
      return;
    }

    // Execute tool calls
    for (const tc of toolCalls) {
      ensureNotAborted();

      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        parsedArgs = {};
      }

      const toolCall: ToolCall = {
        id: tc.id,
        name: tc.name,
        arguments: parsedArgs,
      };

      // Yield tool_call event so UI can show "Navigating to..." etc.
      yield { type: 'tool_call', toolCall };

      // Execute the tool
      const toolResult = await toolExecutor(toolCall);

      // Yield tool_result event
      yield { type: 'tool_result', content: toolResult.result, toolCall };

      // Add tool result to messages
      apiMessages.push({
        role: 'tool',
        content: toolResult.result,
        tool_call_id: tc.id,
        name: tc.name,
      });
    }

    // Continue the loop - the AI will see the tool results and respond
  }

  // Max iterations reached
  lastApiMessages = [...apiMessages];
  yield { type: 'done' };
}

/**
 * Build the system prompt with optional tool instructions.
 * Includes the user's custom system prompt if set.
 * Includes language instruction from settings.
 */
async function buildSystemPrompt(hasTools: boolean): Promise<string> {
  const customPrompt = await getSystemPrompt();
  let prompt = customPrompt || `You are a helpful AI assistant. Always respond using Markdown format for better readability. Use:
- Headers (##, ###) for sections
- **bold** and *italic* for emphasis
- \`code\` for inline code and \`\`\` for code blocks with language specification
- Lists (- or 1.) for enumerations
- > for quotes
- Tables when presenting structured data`;

  if (hasTools) {
    prompt += `

When you need to interact with the browser or extract web content, use the provided tools. Here are guidelines:

1. First use browser_take_snapshot to understand the page structure before interacting
2. Use the UIDs from the snapshot to click, fill, or hover on elements
3. After navigation or interaction, take a new snapshot to see the updated page
4. Use extract_page_content to get the main text content of a page
5. Use extract_youtube_transcript to get video captions from YouTube pages
6. Always take a fresh snapshot if the page has changed (after navigation, clicks, etc.)
7. Be careful with sensitive actions like filling forms - confirm with the user if needed
8. Report what you see and what actions you're taking clearly`;
  }

  // Append language instruction from user's language setting
  const { getLanguage } = await import('./storage');
  const lang = await getLanguage();
  if (lang === 'zh-CN') {
    prompt += '\n\nPlease respond in Chinese (Simplified).';
  }

  return prompt;
}

/**
 * Test a provider connection by making a simple API call.
 * Returns success/failure with response time.
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  responseTime?: number;
  models?: string[];
}

export async function testProviderConnection(
  baseUrl: string,
  apiKey: string,
  model?: string,
): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  try {
    function resolveBaseUrl(url: string): string {
      const trimmed = url.trim();
      if (!trimmed) return trimmed;
      if (trimmed.endsWith('/')) return trimmed;
      if (/\/v1$/i.test(trimmed)) return trimmed;
      return `${trimmed}/v1`;
    }

    const client = new OpenAI({
      apiKey,
      baseURL: resolveBaseUrl(baseUrl),
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      timeout: 15000,
    });

    // Try listing models first (lightweight operation)
    try {
      const response = await client.models.list();
      const models = response.data.map((m) => m.id);
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        message: `Connected successfully. Found ${models.length} model(s).`,
        responseTime,
        models,
      };
    } catch (modelError: any) {
      // If model listing fails, try a minimal completion
      if (modelError?.status === 401 || modelError?.status === 403) {
        return {
          success: false,
          message: 'Invalid API key. Please check your credentials.',
          responseTime: Date.now() - startTime,
        };
      }

      if (modelError?.status === 429) {
        return {
          success: false,
          message: 'Rate limited. Connection works but please wait before trying again.',
          responseTime: Date.now() - startTime,
        };
      }

      // Try a minimal chat completion as fallback
      if (model) {
        try {
          await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1,
            stream: false,
          });
          return {
            success: true,
            message: `Connected successfully. Model "${model}" is available.`,
            responseTime: Date.now() - startTime,
          };
        } catch (completionError: any) {
          if (completionError?.status === 401 || completionError?.status === 403) {
            return {
              success: false,
              message: 'Invalid API key. Please check your credentials.',
              responseTime: Date.now() - startTime,
            };
          }
          if (completionError?.status === 404) {
            return {
              success: false,
              message: `Model "${model}" not found. The model may not be available.`,
              responseTime: Date.now() - startTime,
            };
          }
          throw completionError;
        }
      }

      throw modelError;
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    if (error?.status === 401 || error?.status === 403) {
      return {
        success: false,
        message: 'Invalid API key. Please check your credentials.',
        responseTime,
      };
    }

    if (error instanceof TypeError && (error.message?.includes('fetch') || error.message?.includes('network'))) {
      return {
        success: false,
        message: 'Cannot reach server. Check the base URL and your network connection.',
        responseTime,
      };
    }

    return {
      success: false,
      message: error?.message || 'Connection test failed.',
      responseTime,
    };
  }
}

/**
 * Fetch available models from a provider.
 * Handles 401 (invalid key), 404 (endpoint not supported), 429 (rate limit),
 * and network timeout errors.
 */
export async function fetchModels(
  baseUrl: string,
  apiKey: string,
): Promise<{ id: string; name?: string }[]> {
  try {
    function resolveBaseUrl(url: string): string {
      const trimmed = url.trim();
      if (!trimmed) return trimmed;
      if (trimmed.endsWith('/')) return trimmed;
      if (/\/v1$/i.test(trimmed)) return trimmed;
      return `${trimmed}/v1`;
    }

    const client = new OpenAI({
      apiKey,
      baseURL: resolveBaseUrl(baseUrl),
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
      timeout: 10000,
    });

    const response = await client.models.list();
    return response.data.map((m) => ({ id: m.id, name: m.id }));
  } catch (error: any) {
    // 401/403 - invalid API key
    if (error?.status === 401 || error?.status === 403) {
      console.warn('[Nexus] fetchModels: Invalid API key (401/403)');
      throw new Error('Invalid API key');
    }
    // 404 - provider doesn't support /models endpoint
    if (error?.status === 404) {
      console.warn('[Nexus] fetchModels: /models endpoint not found (404). Provider may not support model listing.');
      return [];
    }
    // 429 - rate limited
    if (error?.status === 429) {
      console.warn('[Nexus] fetchModels: Rate limited (429)');
      throw new Error('Rate limited. Please try again in a moment.');
    }
    console.error('[Nexus] fetchModels error:', error);
    return [];
  }
}
