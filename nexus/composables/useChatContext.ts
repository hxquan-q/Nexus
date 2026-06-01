/**
 * Composable that provides core chat context for window-based chat UIs.
 * Shares the same session data via IndexedDB so the sidepanel and
 * pop-out window are always in sync.
 */

import { ref, shallowRef, triggerRef, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import {
  getAllProviders,
  getActiveProvider,
  setActiveProviderId,
  saveProvider,
  watchProviders,
  watchActiveProviderId,
  getThemeMode,
  setThemeMode,
  watchThemeMode,
  applyTheme,
  getLanguage,
  watchLanguage,
  toAIProvider,
  type StoredProvider,
  type ThemeMode,
} from '../utils/storage';
import {
  getAllSessions,
  getSessionsPaginated,
  createSession,
  updateSession,
  deleteSession,
  generateSessionTitle,
  type ChatSession,
} from '../utils/db';
import { getLastApiMessages, setLastApiMessages, type ApiErrorCode } from '../utils/api';
import { initChartRendering } from '../utils/markdown';
import { t as i18n } from '../utils/i18n';
import type { Language } from '../utils/i18n';
import type { ChatMessage as ChatMessageType, ChatImage, ChatFileAttachment, ToolCall, ToolResult } from '../utils/providers/types';
import { getToolsAsOpenAIFunctions, isBrowserControlTool } from '../utils/tools';
import { mcpManager, mcpToolToOpenAITool, parseMcpToolName, isMcpTool, type McpTool } from '../utils/mcp';
import { getEnabledMcpServers, watchMcpServers } from '../utils/mcpStorage';
import { getAllSkills, getSkillsAsTools, type Skill } from '../utils/skills';
import { estimateMessagesTokens } from '../utils/tokenCount';
import { useStreamChat } from './useStreamChat';

type ChatMessageData = ChatMessageType;

export function useChatContext() {
  // State
  const messages = shallowRef<ChatMessageData[]>([]);
  const inputText = ref('');
  const isLoading = ref(false);
  const chatAreaRef = ref<HTMLElement | null>(null);
  const pendingImages = ref<ChatImage[]>([]);
  const pendingFiles = ref<ChatFileAttachment[]>([]);
  const chatAbortController = ref<AbortController | null>(null);

  // Session state
  const currentSession = ref<ChatSession | null>(null);
  const sessions = ref<ChatSession[]>([]);
  const sessionsHasMore = ref(true);
  const sessionsLoading = ref(false);
  const sessionsOffset = ref(0);
  const SESSIONS_PAGE_SIZE = 15;

  // Provider state
  const providers = ref<StoredProvider[]>([]);
  const activeProviderId = ref<string | null>(null);

  // Theme
  const currentThemeMode = ref<ThemeMode>('system');

  // Language
  const currentLanguage = ref<Language>('en');

  // Thinking/reasoning expanded state
  const reasoningExpanded = ref<Record<number, boolean>>({});

  // Scroll-to-bottom button
  const showScrollToBottom = ref(false);

  // Toast
  const toastMessage = ref<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Tool execution status
  const toolExecutionStatus = ref<string | null>(null);

  // MCP state
  const mcpTools = ref<McpTool[]>([]);
  const mcpConnected = ref(false);

  // Skills state
  const loadedSkills = ref<Skill[]>([]);

  // Debounced save timer
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const SAVE_DEBOUNCE_MS = 300;

  // Error info
  const lastErrorInfo = ref<{
    message: string;
    code: ApiErrorCode;
    rawError: string;
  } | null>(null);

  // Network state
  const isOffline = ref(!navigator.onLine);

  // Context window state
  const contextUsagePercent = ref(0);
  const contextTokenEstimate = ref(0);
  const contextTokenMax = ref(128000);

  // Unwatch refs
  const unwatchProviders = ref<(() => void) | null>(null);
  const unwatchActiveProviderId = ref<(() => void) | null>(null);
  const unwatchLanguage = ref<(() => void) | null>(null);
  const unwatchThemeMode = ref<(() => void) | null>(null);
  const unwatchMcpServers = ref<(() => void) | null>(null);
  const systemThemeMediaQuery = ref<MediaQueryList | null>(null);
  let contentMessageHandler: ((message: any) => void) | null = null;

  // Streaming
  const { runStream, clearStreamRenderState } = useStreamChat(messages);

  // ============================================================
  // Computed
  // ============================================================

  const activeProvider = computed(() => {
    return providers.value.find((p) => p.id === activeProviderId.value) || null;
  });

  const activeModelName = computed(() => {
    if (!activeProvider.value) return i18n(currentLanguage.value, 'model.notConfigured');
    return activeProvider.value.selectedModel;
  });

  const activeModelSupportsVision = computed(() => {
    if (!activeProvider.value) return false;
    return activeProvider.value.visionModels?.includes(activeProvider.value.selectedModel) ?? false;
  });

  const contextBarColor = computed(() => {
    if (contextUsagePercent.value < 50) return 'var(--color-success)';
    if (contextUsagePercent.value < 80) return 'var(--color-warning)';
    return 'var(--color-error)';
  });

  // ============================================================
  // Toast
  // ============================================================

  function showToast(message: string, duration: number = 2000): void {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.value = message;
    toastTimer = setTimeout(() => {
      toastMessage.value = null;
      toastTimer = null;
    }, duration);
  }

  // ============================================================
  // Clipboard
  // ============================================================

  async function writeTextToClipboard(content: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Scroll
  // ============================================================

  let isUserScrolledUp = false;

  const checkUserScroll = () => {
    const el = chatAreaRef.value;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUp = distFromBottom > 100;
    showScrollToBottom.value = distFromBottom > 200;
  };

  function handleScrollToBottom() {
    isUserScrolledUp = false;
    showScrollToBottom.value = false;
    nextTick(() => {
      if (chatAreaRef.value) {
        chatAreaRef.value.scrollTop = chatAreaRef.value.scrollHeight;
      }
    });
  }

  const scrollToBottom = () => {
    nextTick(() => {
      if (chatAreaRef.value && !isUserScrolledUp) {
        chatAreaRef.value.scrollTop = chatAreaRef.value.scrollHeight;
      }
    });
  };

  // ============================================================
  // Context usage
  // ============================================================

  function updateContextUsage() {
    if (messages.value.length === 0) {
      contextUsagePercent.value = 0;
      contextTokenEstimate.value = 0;
      return;
    }
    contextTokenEstimate.value = estimateMessagesTokens(messages.value as { content: string }[]);
    contextUsagePercent.value = Math.min(100, Math.round((contextTokenEstimate.value / contextTokenMax.value) * 100));
  }

  // ============================================================
  // Browser automation & tool execution
  // ============================================================

  async function getActiveTab(): Promise<{ id?: number; url?: string; title?: string } | null> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0] || null;
    } catch {
      return null;
    }
  }

  async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const name = toolCall.name;
    const args = toolCall.arguments;

    try {
      if (name === 'browser_take_screenshot') {
        toolExecutionStatus.value = 'Taking screenshot...';
        const response = await browser.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
        toolExecutionStatus.value = null;
        if (response?.dataUrl) {
          return { tool_call_id: toolCall.id, name, result: 'Screenshot captured.', success: true };
        }
        return { tool_call_id: toolCall.id, name, result: response?.error || 'Failed to take screenshot', success: false };
      }

      if (isBrowserControlTool(name)) {
        toolExecutionStatus.value = `Executing: ${name.replace('browser_', '').replace('_', ' ')}...`;
        const response = await browser.runtime.sendMessage({
          type: 'BROWSER_AUTOMATION_COMMAND',
          name,
          args,
        });
        const resultText = response?.result || response?.error || 'Tool executed';
        toolExecutionStatus.value = null;
        return { tool_call_id: toolCall.id, name, result: resultText, success: !resultText.startsWith('Error') };
      }

      if (name === 'extract_page_content') {
        toolExecutionStatus.value = 'Extracting page content...';
        const tab = await getActiveTab();
        if (!tab?.id) {
          toolExecutionStatus.value = null;
          return { tool_call_id: toolCall.id, name, result: 'Error: No active tab found.', success: false };
        }
        const response = await browser.runtime.sendMessage({
          type: 'EXTRACT_PAGE_CONTENT',
          tabId: tab.id,
          maxLength: (args.maxLength as number) || 30000,
          rawExtract: args.rawExtract as boolean,
        });
        toolExecutionStatus.value = null;
        if (response?.error) {
          return { tool_call_id: toolCall.id, name, result: `Error: ${response.error}`, success: false };
        }
        const { formatPageContent } = await import('../utils/pageExtractor');
        const formatted = formatPageContent(response);
        return { tool_call_id: toolCall.id, name, result: formatted, success: true };
      }

      if (name === 'extract_youtube_transcript') {
        toolExecutionStatus.value = 'Extracting video transcript...';
        const tab = await getActiveTab();
        if (!tab?.id) {
          toolExecutionStatus.value = null;
          return { tool_call_id: toolCall.id, name, result: 'Error: No active tab found.', success: false };
        }
        const response = await browser.runtime.sendMessage({
          type: 'EXTRACT_YOUTUBE_INFO',
          tabId: tab.id,
        });
        toolExecutionStatus.value = null;
        if (response?.error) {
          return { tool_call_id: toolCall.id, name, result: `Error: ${response.error}`, success: false };
        }
        const { formatVideoInfo } = await import('../utils/videoSummary');
        const formatted = formatVideoInfo(response);
        return { tool_call_id: toolCall.id, name, result: formatted, success: true };
      }

      if (isMcpTool(name)) {
        const parsed = parseMcpToolName(name);
        if (!parsed) {
          return { tool_call_id: toolCall.id, name, result: 'Invalid MCP tool name', success: false };
        }
        toolExecutionStatus.value = `MCP: ${parsed.toolName}...`;
        try {
          const result = await mcpManager.callTool(parsed.serverId, parsed.toolName, args as Record<string, unknown>);
          toolExecutionStatus.value = null;
          return { tool_call_id: toolCall.id, name, result: result.content, success: result.success };
        } catch (mcpError) {
          toolExecutionStatus.value = null;
          return { tool_call_id: toolCall.id, name, result: `MCP error: ${(mcpError as Error).message}`, success: false };
        }
      }

      return { tool_call_id: toolCall.id, name, result: `Unknown tool: ${name}`, success: false };
    } catch (error) {
      toolExecutionStatus.value = null;
      return { tool_call_id: toolCall.id, name, result: `Error: ${(error as Error).message}`, success: false };
    }
  }

  // ============================================================
  // Session management
  // ============================================================

  async function saveCurrentSession() {
    if (!currentSession.value) return;
    const sessionToSave: ChatSession = {
      ...currentSession.value,
      messages: JSON.parse(JSON.stringify(messages.value)),
      apiMessages: JSON.parse(JSON.stringify(getLastApiMessages())),
    };
    await updateSession(sessionToSave);
    await loadInitialSessions();
  }

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveCurrentSession();
    }, SAVE_DEBOUNCE_MS);
  }

  async function loadInitialSessions() {
    sessionsOffset.value = 0;
    const result = await getSessionsPaginated(SESSIONS_PAGE_SIZE, 0);
    sessions.value = result.sessions;
    sessionsHasMore.value = result.hasMore;
    sessionsOffset.value = result.sessions.length;
  }

  async function loadSession(session: ChatSession) {
    currentSession.value = session;
    messages.value = session.messages;
    if (session.apiMessages) {
      setLastApiMessages(session.apiMessages);
    } else {
      setLastApiMessages([]);
    }
    updateContextUsage();
    scrollToBottom();
  }

  async function newChat() {
    currentSession.value = null;
    messages.value = [];
    setLastApiMessages([]);
    pendingImages.value = [];
    pendingFiles.value = [];
    updateContextUsage();
  }

  // ============================================================
  // MCP connection
  // ============================================================

  async function connectEnabledMcpServers(): Promise<void> {
    try {
      await mcpManager.disconnectAll();
      const servers = await getEnabledMcpServers();
      if (servers.length === 0) {
        mcpTools.value = [];
        mcpConnected.value = false;
        return;
      }
      const allTools: McpTool[] = [];
      for (const server of servers) {
        try {
          const tools = await mcpManager.connect(server);
          allTools.push(...tools);
        } catch (error) {
          console.error(`[Nexus] MCP connection failed for ${server.name}:`, error);
        }
      }
      mcpTools.value = allTools;
      mcpConnected.value = allTools.length > 0;
    } catch (error) {
      console.error('[Nexus] MCP initialization error:', error);
      mcpConnected.value = false;
    }
  }

  // ============================================================
  // Model selector
  // ============================================================

  async function selectProviderModel(providerId: string, model: string) {
    const allProviders = await getAllProviders();
    const target = allProviders.find((p) => p.id === providerId);
    if (!target) return;
    if (!target.models.includes(model)) return;
    if (target.selectedModel !== model) {
      target.selectedModel = model;
      await saveProvider(target);
    }
    await setActiveProviderId(providerId);
    activeProviderId.value = providerId;
  }

  // ============================================================
  // Send message
  // ============================================================

  async function sendMessage() {
    const text = inputText.value.trim();
    const hasImages = pendingImages.value.length > 0;
    const hasFiles = pendingFiles.value.length > 0;
    if ((!text && !hasImages && !hasFiles) || isLoading.value) return;

    isLoading.value = true;
    isUserScrolledUp = false;
    chatAbortController.value?.abort();
    chatAbortController.value = new AbortController();

    const storedProvider = await getActiveProvider();
    if (!storedProvider) {
      chatAbortController.value = null;
      isLoading.value = false;
      return;
    }

    const provider = toAIProvider(storedProvider);

    if (!currentSession.value) {
      currentSession.value = await createSession(storedProvider.id);
      await loadInitialSessions();
    }

    const messageImages = pendingImages.value.map((image) => ({ ...image }));
    const messageFiles = pendingFiles.value.map((f) => ({ ...f }));

    let messageContent = text;
    if (messageFiles.length > 0) {
      const fileContexts = messageFiles.map((f) => `[File: ${f.name}]\n${f.text}`).join('\n\n');
      if (messageContent) {
        messageContent = `${messageContent}\n\n---\n\n${fileContexts}`;
      } else {
        messageContent = fileContexts;
      }
    }

    const userMessage: ChatMessageData = {
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      images: messageImages.length > 0 ? messageImages : undefined,
      fileAttachments: messageFiles.length > 0 ? messageFiles : undefined,
    };

    messages.value.push(userMessage);
    triggerRef(messages);
    inputText.value = '';
    pendingImages.value = [];
    pendingFiles.value = [];
    scrollToBottom();

    if (messages.value.length === 1) {
      currentSession.value.title = await generateSessionTitle(text || (hasImages ? 'Image' : (hasFiles ? 'File' : 'Chat')));
    }

    const openaiTools = getToolsAsOpenAIFunctions() as any;
    for (const mcpTool of mcpTools.value) {
      openaiTools.push(mcpToolToOpenAITool(mcpTool));
    }
    const skillTools = getSkillsAsTools(loadedSkills.value);
    openaiTools.push(...skillTools);

    try {
      await runStream(provider, messages.value.slice(0, -1), {
        abortSignal: chatAbortController.value.signal,
        tools: openaiTools,
        toolExecutor: executeToolCall,
        maxToolIterations: 10,
      }, {
        onAssistantMessageCreated: () => scrollToBottom(),
        onContentUpdate: () => scrollToBottom(),
        onError: (errorInfo) => {
          lastErrorInfo.value = errorInfo;
          messages.value.push({
            role: 'assistant',
            content: `__ERROR__:${JSON.stringify(errorInfo)}`,
            timestamp: Date.now(),
          });
          triggerRef(messages);
        },
        onAborted: () => {},
        language: currentLanguage.value,
      });
    } finally {
      chatAbortController.value = null;
      isLoading.value = false;
      toolExecutionStatus.value = null;
      clearStreamRenderState();
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      await saveCurrentSession();
      updateContextUsage();
      scrollToBottom();
    }
  }

  function terminateCurrentGeneration(): void {
    if (!chatAbortController.value) return;
    chatAbortController.value.abort();
    isLoading.value = false;
  }

  async function regenerateLastResponse(): Promise<void> {
    const lastMsg = messages.value[messages.value.length - 1];
    if (lastMsg?.role === 'assistant') {
      messages.value.pop();
      triggerRef(messages);
    }
    // Resend from last user message
    const lastUserIdx = messages.value.findLastIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    messages.value = messages.value.slice(0, lastUserIdx + 1);
    triggerRef(messages);

    isLoading.value = true;
    isUserScrolledUp = false;
    chatAbortController.value?.abort();
    chatAbortController.value = new AbortController();

    const storedProvider = await getActiveProvider();
    if (!storedProvider) {
      chatAbortController.value = null;
      isLoading.value = false;
      return;
    }
    const provider = toAIProvider(storedProvider);

    if (!currentSession.value) {
      currentSession.value = await createSession(storedProvider.id);
      await loadInitialSessions();
    }

    const openaiTools = getToolsAsOpenAIFunctions() as any;
    for (const mcpTool of mcpTools.value) {
      openaiTools.push(mcpToolToOpenAITool(mcpTool));
    }

    try {
      await runStream(provider, messages.value.slice(0, -1), {
        abortSignal: chatAbortController.value.signal,
        tools: openaiTools,
        toolExecutor: executeToolCall,
        maxToolIterations: 10,
      }, {
        onAssistantMessageCreated: () => scrollToBottom(),
        onContentUpdate: () => scrollToBottom(),
        onError: (errorInfo) => {
          lastErrorInfo.value = errorInfo;
          messages.value.push({
            role: 'assistant',
            content: `__ERROR__:${JSON.stringify(errorInfo)}`,
            timestamp: Date.now(),
          });
          triggerRef(messages);
        },
        onAborted: () => {},
        language: currentLanguage.value,
      });
    } finally {
      chatAbortController.value = null;
      isLoading.value = false;
      toolExecutionStatus.value = null;
      clearStreamRenderState();
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      await saveCurrentSession();
      updateContextUsage();
      scrollToBottom();
    }
  }

  async function copyMessage(index: number): Promise<void> {
    const message = messages.value[index];
    if (!message.content || message.role !== 'assistant') return;
    const copied = await writeTextToClipboard(message.content);
    if (copied) {
      showToast(i18n(currentLanguage.value, 'chat.copied'));
    }
  }

  async function deleteMessagePair(index: number): Promise<void> {
    const message = messages.value[index];
    if (message.role !== 'user') return;
    messages.value = messages.value.slice(0, index);
    triggerRef(messages);
    await saveCurrentSession();
    updateContextUsage();
  }

  // ============================================================
  // Theme
  // ============================================================

  function handleSystemThemeChange() {
    if (currentThemeMode.value === 'system') {
      applyTheme('system');
    }
  }

  async function toggleTheme() {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIdx = modes.indexOf(currentThemeMode.value);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    currentThemeMode.value = nextMode;
    await setThemeMode(nextMode);
    applyTheme(nextMode);
  }

  // ============================================================
  // Chart rendering on content change
  // ============================================================

  watch(messages, () => {
    nextTick(() => {
      if (chatAreaRef.value) {
        initChartRendering(chatAreaRef.value);
      }
    });
  }, { deep: true });

  // ============================================================
  // Lifecycle
  // ============================================================

  async function initialize() {
    providers.value = await getAllProviders();
    const active = await getActiveProvider();
    activeProviderId.value = active?.id || null;

    currentThemeMode.value = await getThemeMode();
    applyTheme(currentThemeMode.value);

    currentLanguage.value = await getLanguage();

    systemThemeMediaQuery.value = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeMediaQuery.value.addEventListener('change', handleSystemThemeChange);

    unwatchProviders.value = watchProviders((newProviders) => {
      providers.value = newProviders;
    });

    unwatchActiveProviderId.value = watchActiveProviderId((newId) => {
      activeProviderId.value = newId;
    });

    unwatchLanguage.value = watchLanguage((newLang) => {
      currentLanguage.value = newLang;
    });

    unwatchThemeMode.value = watchThemeMode((newMode) => {
      currentThemeMode.value = newMode;
      applyTheme(newMode);
    });

    // MCP
    await connectEnabledMcpServers();
    unwatchMcpServers.value = watchMcpServers(async () => {
      await connectEnabledMcpServers();
    });

    // Skills
    loadedSkills.value = await getAllSkills();

    // Content message handler
    contentMessageHandler = (message: any) => {
      if (!message?.type) return;
      if (message.type === 'CONTENT_IMAGE_TO_CHAT' && message.imageUrl) {
        // Handle image from content script
      }
    };
    browser.runtime.onMessage.addListener(contentMessageHandler);

    // Network status
    const handleOnline = () => { isOffline.value = false; };
    const handleOffline = () => { isOffline.value = true; };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  function cleanup() {
    chatAbortController.value?.abort();
    if (currentSession.value && messages.value.length > 0) {
      saveCurrentSession().catch(() => {});
    }
    if (saveTimer) clearTimeout(saveTimer);
    if (toastTimer) clearTimeout(toastTimer);
    clearStreamRenderState();
    unwatchProviders.value?.();
    unwatchActiveProviderId.value?.();
    unwatchLanguage.value?.();
    unwatchThemeMode.value?.();
    unwatchMcpServers.value?.();
    systemThemeMediaQuery.value?.removeEventListener('change', handleSystemThemeChange);
    mcpManager.disconnectAll().catch(() => {});
    if (contentMessageHandler) {
      browser.runtime.onMessage.removeListener(contentMessageHandler);
      contentMessageHandler = null;
    }
  }

  return {
    // State
    messages,
    inputText,
    isLoading,
    chatAreaRef,
    pendingImages,
    pendingFiles,
    currentSession,
    sessions,
    sessionsHasMore,
    sessionsLoading,
    providers,
    activeProviderId,
    currentThemeMode,
    currentLanguage,
    reasoningExpanded,
    showScrollToBottom,
    toastMessage,
    toolExecutionStatus,
    isOffline,
    contextUsagePercent,
    contextTokenEstimate,
    contextTokenMax,
    lastErrorInfo,

    // Computed
    activeProvider,
    activeModelName,
    activeModelSupportsVision,
    contextBarColor,

    // Methods
    showToast,
    writeTextToClipboard,
    handleScrollToBottom,
    checkUserScroll,
    updateContextUsage,
    selectProviderModel,
    sendMessage,
    terminateCurrentGeneration,
    regenerateLastResponse,
    copyMessage,
    deleteMessagePair,
    toggleTheme,
    loadSession,
    newChat,
    loadInitialSessions,
    saveCurrentSession,
    debouncedSave,
    initialize,
    cleanup,
    scrollToBottom,
  };
}
