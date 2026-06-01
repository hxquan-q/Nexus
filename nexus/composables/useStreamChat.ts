/**
 * Composable for the streaming chat loop.
 * Extracts the duplicated for-await loop into a single reusable function.
 */

import { triggerRef, type ShallowRef } from 'vue';
import type { AIProvider, ChatMessage as ChatMessageType, ToolCall, ToolResult } from '../utils/providers/types';
import { streamChat, ApiError, type ApiErrorCode } from '../utils/api';
import { t } from '../utils/i18n';

interface StreamCallbacks {
  onAssistantMessageCreated: (msg: ChatMessageType) => void;
  onContentUpdate: () => void;
  onError: (errorInfo: { message: string; code: ApiErrorCode; rawError: string }) => void;
  onAborted: () => void;
  language?: 'en' | 'zh-CN';
}

interface StreamOptions {
  abortSignal: AbortSignal;
  tools: any[];
  toolExecutor: (toolCall: ToolCall) => Promise<ToolResult>;
  maxToolIterations?: number;
}

export function useStreamChat(
  messages: ShallowRef<ChatMessageType[]>,
) {
  // Throttled render state - instance-scoped to avoid cross-component leaks
  let streamRenderTimer: ReturnType<typeof requestAnimationFrame> | null = null;
  let streamContentDirty = false;

  function triggerStreamRender() {
    streamContentDirty = true;
    if (streamRenderTimer) return;
    streamRenderTimer = requestAnimationFrame(() => {
      streamRenderTimer = null;
      if (streamContentDirty) {
        streamContentDirty = false;
        triggerRef(messages);
      }
    });
  }

  function clearStreamRenderState() {
    streamContentDirty = false;
    if (streamRenderTimer) {
      cancelAnimationFrame(streamRenderTimer);
      streamRenderTimer = null;
    }
  }

  /**
   * Run a streaming chat loop. Pushes an assistant message onto messages array
   * and streams the response into it.
   *
   * Returns the assistant message (may have partial content if aborted).
   */
  async function runStream(
    provider: AIProvider,
    apiMessages: ChatMessageType[],
    options: StreamOptions,
    callbacks: StreamCallbacks,
  ): Promise<ChatMessageType | null> {
    const assistantMessage: ChatMessageType = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    messages.value.push(assistantMessage);
    triggerRef(messages);
    callbacks.onAssistantMessageCreated(assistantMessage);

    try {
      for await (const event of streamChat(provider, apiMessages, {
        abortSignal: options.abortSignal,
        tools: options.tools,
        toolExecutor: options.toolExecutor,
        maxToolIterations: options.maxToolIterations || 10,
      })) {
        switch (event.type) {
          case 'reasoning':
            if (!assistantMessage.reasoning) assistantMessage.reasoning = '';
            assistantMessage.reasoning += event.content;
            triggerStreamRender();
            break;
          case 'content':
            assistantMessage.content += event.content;
            triggerStreamRender();
            callbacks.onContentUpdate();
            break;
          case 'thinking':
            break;
          case 'tool_call':
            if (event.toolCall) {
              const toolName = event.toolCall.name.replace('browser_', '').replace(/_/g, ' ');
              const toolArgs = event.toolCall.arguments;
              let toolDescription = `**Tool: ${toolName}**`;
              if (toolArgs.url) toolDescription += ` -> ${toolArgs.url}`;
              if (toolArgs.uid) toolDescription += ` (element: ${toolArgs.uid})`;
              if (toolArgs.key) toolDescription += ` (${toolArgs.key})`;
              if (toolArgs.text) toolDescription += ` "${String(toolArgs.text).substring(0, 50)}"`;
              assistantMessage.content += `\n> ${toolDescription}\n\n`;
              triggerRef(messages);
              callbacks.onContentUpdate();
            }
            break;
          case 'tool_result':
            break;
          case 'done':
            assistantMessage.content = assistantMessage.content.trim();
            if (assistantMessage.reasoning) {
              assistantMessage.reasoning = assistantMessage.reasoning.trim();
            }
            triggerRef(messages);
            break;
        }
      }

      assistantMessage.timestamp = Date.now();
      return assistantMessage;
    } catch (error: any) {
      const isUserAborted = error instanceof ApiError && error.code === 'ABORTED';

      if (isUserAborted) {
        if (!assistantMessage.content.trim() && !(assistantMessage.reasoning || '').trim()) {
          // Remove empty assistant message
          const lastMessage = messages.value[messages.value.length - 1];
          if (lastMessage === assistantMessage) {
            messages.value.pop();
            triggerRef(messages);
          }
          callbacks.onAborted();
          return null;
        } else {
          assistantMessage.content = (assistantMessage.content || '').trim();
          if (assistantMessage.content) {
            assistantMessage.content += '\n\n---\n*' + t(callbacks.language || 'en', 'chat.generationInterrupted') + '*';
            triggerRef(messages);
          }
          return assistantMessage;
        }
      } else {
        // Remove the assistant message and report error
        const lastMessage = messages.value[messages.value.length - 1];
        if (lastMessage === assistantMessage) {
          messages.value.pop();
          triggerRef(messages);
        }

        const message = error instanceof Error ? error.message : String(error);
        const errorInfo = {
          message,
          code: (error instanceof ApiError ? error.code : 'UNKNOWN') as ApiErrorCode,
          rawError: error instanceof ApiError
            ? `${error.code}${error.status ? ` (${error.status})` : ''}: ${error.message}`
            : message,
        };
        callbacks.onError(errorInfo);
        return null;
      }
    } finally {
      clearStreamRenderState();
    }
  }

  return {
    runStream,
    clearStreamRenderState,
  };
}
