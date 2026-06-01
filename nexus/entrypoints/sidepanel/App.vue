<script setup lang="ts">
import { ref, shallowRef, triggerRef, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import {
  getAllProviders,
  getActiveProvider,
  setActiveProviderId,
  saveProvider,
  deleteProvider as deleteProviderFromStorage,
  watchProviders,
  watchActiveProviderId,
  getThemeMode,
  setThemeMode,
  watchThemeMode,
  applyTheme,
  getLanguage,
  watchLanguage,
  getSelectionQuoteEnabled,
  watchSelectionQuoteEnabled,
  getSystemPrompt,
  toAIProvider,
  getOnboardingCompleted,
  setOnboardingCompleted,
  type StoredProvider,
  type ThemeMode,
} from '../../utils/storage';
import {
  getAllSessions,
  getSessionsPaginated,
  createSession,
  updateSession,
  deleteSession,
  generateSessionTitle,
  type ChatSession,
} from '../../utils/db';
import { getLastApiMessages, setLastApiMessages, ApiError, type ApiErrorCode } from '../../utils/api';
import { renderMarkdown, decodeData, initChartRendering } from '../../utils/markdown';
import { t as i18n } from '../../utils/i18n';
import type { Language } from '../../utils/i18n';
import { parseFile, detectFormat } from '../../utils/fileParser';
import type { ChatMessage as ChatMessageType, ChatImage, ChatFileAttachment, ToolCall, ToolResult } from '../../utils/providers/types';
import { getToolsAsOpenAIFunctions, isBrowserControlTool } from '../../utils/tools';
import { mcpManager, mcpToolToOpenAITool, parseMcpToolName, isMcpTool, type McpTool } from '../../utils/mcp';
import { getEnabledMcpServers, watchMcpServers } from '../../utils/mcpStorage';
import { getAllSkills, getSkillsAsTools, getSkillFileAsText, type Skill } from '../../utils/skills';
import { executeScript, setScriptConfirmCallback, type ScriptConfirmationRequest } from '../../utils/skillsExecutor';
import { estimateMessagesTokens } from '../../utils/tokenCount';
import { getAllTemplates, type ChatTemplate } from '../../utils/templates';
import { useStreamChat } from '../../composables/useStreamChat';
import { getPresetActions, type PresetAction, getSoundEffects, watchSoundEffects, getShowReactions, watchShowReactions } from '../../utils/storage';
import { playSentSound, playReceivedSound, playErrorSound } from '../../utils/sounds';
import { trimMessagesToContextLimit, createTrimNotice, getContextLimit } from '../../utils/contextTrim';

// Extracted components
import ChatMessage from '../../components/ChatMessage.vue';
import ModelSelector from '../../components/ModelSelector.vue';
import SessionHistory from '../../components/SessionHistory.vue';
import MessageInput from '../../components/MessageInput.vue';
import CodeFullscreen from '../../components/CodeFullscreen.vue';
import OnboardingWizard from '../../components/OnboardingWizard.vue';
import HeaderMenu from '../../components/HeaderMenu.vue';
import ChatSearch from '../../components/ChatSearch.vue';

// Alias for readability
type ChatMessageData = ChatMessageType;

// ============================================================
// State
// ============================================================

const messages = shallowRef<ChatMessageData[]>([]);
const inputText = ref('');
const isLoading = ref(false);
const showHistory = ref(false);
const chatAreaRef = ref<HTMLElement | null>(null);
const pendingImages = ref<ChatImage[]>([]);
const pendingFiles = ref<ChatFileAttachment[]>([]);
const chatAbortController = ref<AbortController | null>(null);
const fullscreenCodeBlock = ref<{ code: string; language: string } | null>(null);

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

// Theme state
const currentThemeMode = ref<ThemeMode>('system');

// Language state
const currentLanguage = ref<Language>('en');

// Thinking/reasoning expanded state
const reasoningExpanded = ref<Record<number, boolean>>({});

// Image lightbox
const lightboxImage = ref<string | null>(null);

// Copied message feedback
const copiedMessageIndex = ref<number | null>(null);

// Edit message state
const editingMessageIndex = ref<number | null>(null);
const editingMessageText = ref('');

// Scroll-to-bottom button
const showScrollToBottom = ref(false);

// Context menu prompt (received from background)
const contextMenuPrompt = ref<string | null>(null);

// Unwatch refs
const unwatchProviders = ref<(() => void) | null>(null);
const unwatchActiveProviderId = ref<(() => void) | null>(null);
const unwatchLanguage = ref<(() => void) | null>(null);
const unwatchThemeMode = ref<(() => void) | null>(null);
const unwatchSelectionQuoteEnabled = ref<(() => void) | null>(null);
const systemThemeMediaQuery = ref<MediaQueryList | null>(null);
let markdownActionClickHandler: ((event: MouseEvent) => void) | null = null;
let globalKeydownHandler: ((event: KeyboardEvent) => void) | null = null;
const selectionQuoteEnabled = ref(true);
const selectionQuotePopup = ref({ visible: false, x: 0, y: 0, text: '' });

// Debounced save timer
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 300;

// Last error info for the error display component
const lastErrorInfo = ref<{
  message: string;
  code: ApiErrorCode;
  rawError: string;
} | null>(null);

// Toast notification system
const toastMessage = ref<string | null>(null);
const toastType = ref<'success' | 'error' | 'info' | 'warning'>('info');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// Network offline state
const isOffline = ref(!navigator.onLine);

function showToast(message: string, duration: number = 2000, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.value = message;
  toastType.value = type;
  toastTimer = setTimeout(() => {
    toastMessage.value = null;
    toastType.value = 'info';
    toastTimer = null;
  }, duration);
}

// Browser automation state
const browserAutomationActive = ref(false);
const browserAutomationTabId = ref<number | null>(null);
const browserAutomationTabTitle = ref('');
const toolExecutionStatus = ref<string | null>(null);
const sharePageContentEnabled = ref(false);
const sharePageContentTitle = ref('');
const sharePageContentUrl = ref('');
const sharePageContentFavicon = ref('');
const sharePageContentLoading = ref(false);

// MCP state
const mcpTools = ref<McpTool[]>([]);
const mcpConnected = ref(false);
const unwatchMcpServers = ref<(() => void) | null>(null);

// Skills state
const loadedSkills = ref<Skill[]>([]);
const activeSkillInstructions = ref<string | null>(null);

// Script confirmation state
const scriptConfirmation = ref<{
  visible: boolean;
  request: ScriptConfirmationRequest | null;
  resolve: ((result: { confirmed: boolean; trustForever: boolean }) => void) | null;
}>({ visible: false, request: null, resolve: null });

// Confirmation dialog for sensitive actions
const confirmationDialog = ref<{
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
} | null>(null);

// Templates state
const chatTemplates = ref<ChatTemplate[]>([]);

// Preset actions state
const presetActions = ref<PresetAction[]>([]);
const defaultPresetActions: PresetAction[] = [
  { id: 'default-summarize-page', name: 'Summarize this page', content: 'Please summarize the current page.' },
  { id: 'default-translate', name: 'Translate text', content: 'Please translate the following text to ' },
  { id: 'default-help-write', name: 'Help me write', content: 'Help me write: ' },
  { id: 'default-analyze-image', name: 'Analyze image', content: 'What is in this image?' },
  { id: 'default-explain-code', name: 'Explain code', content: 'Please explain this code: ' },
  { id: 'default-ask-anything', name: 'Ask anything', content: '' },
];

// Sound effects state
const soundEffectsEnabled = ref(false);
const unwatchSoundEffects = ref<(() => void) | null>(null);

// Onboarding state
const showOnboarding = ref(false);

// Chat search state
const showSearch = ref(false);

// Context trimming warning
const contextTrimmedWarning = ref(false);

// Reaction display state
const showReactionsEnabled = ref(true);
const unwatchShowReactions = ref<(() => void) | null>(null);

// Context window state
const contextUsagePercent = ref(0);
const contextTokenEstimate = ref(0);
const contextTokenMax = ref(128000);

// Model selector ref
const modelSelectorRef = ref<InstanceType<typeof ModelSelector> | null>(null);
const messageInputRef = ref<InstanceType<typeof MessageInput> | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Image limits
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// File limits
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS = 5;

// Throttled streaming render - now handled by useStreamChat composable
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
// Helpers
// ============================================================

function extractErrorInfo(error: any): { message: string; code: ApiErrorCode; rawError: string } {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
      rawError: `${error.code}${error.status ? ` (${error.status})` : ''}: ${error.message}`,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    code: 'UNKNOWN' as ApiErrorCode,
    rawError: message,
  };
}

function updateContextUsage() {
  if (messages.value.length === 0) {
    contextUsagePercent.value = 0;
    contextTokenEstimate.value = 0;
    return;
  }
  contextTokenEstimate.value = estimateMessagesTokens(messages.value as { content: string }[]);

  // Update context max based on current model
  if (activeProvider.value) {
    contextTokenMax.value = getContextLimit(activeProvider.value.selectedModel);
  }

  contextUsagePercent.value = Math.min(100, Math.round((contextTokenEstimate.value / contextTokenMax.value) * 100));
}

function getEffectivePresets(): PresetAction[] {
  if (presetActions.value.length > 0) return presetActions.value;
  return defaultPresetActions;
}

// ============================================================
// Share chat as Markdown
// ============================================================

async function shareChatAsMarkdown(): Promise<void> {
  if (messages.value.length === 0) return;

  const lines: string[] = [];
  lines.push('# Chat with Nexus');
  const dateStr = new Date().toLocaleDateString(
    currentLanguage.value === 'zh-CN' ? 'zh-CN' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );
  lines.push(`Date: ${dateStr}`);
  if (activeProvider.value) {
    lines.push(`Model: ${activeProvider.value.selectedModel}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages.value) {
    if (msg.content?.startsWith('__ERROR__:')) continue;

    const role = msg.role === 'user' ? '**User:**' : '**Nexus:**';
    lines.push(role);
    lines.push('');

    // For user messages with file content, show only the display part
    let content = msg.content || '';
    if (msg.role === 'user' && msg.fileAttachments && msg.fileAttachments.length > 0) {
      const separatorIndex = content.indexOf('\n\n---\n\n');
      if (separatorIndex !== -1) {
        content = content.substring(0, separatorIndex).trim();
      }
    }

    if (content.trim()) {
      lines.push(content);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');
  const copied = await writeTextToClipboard(markdown);
  if (copied) {
    showToast(i18n(currentLanguage.value, 'share.copied'));
  } else {
    showToast(i18n(currentLanguage.value, 'share.copiedFailed'), 3000);
  }
}

// ============================================================
// Pop out window
// ============================================================

async function popOutChat(): Promise<void> {
  try {
    const currentWindow = await browser.windows.getCurrent();
    browser.windows.create({
      url: browser.runtime.getURL('/assistant-window.html' as any),
      type: 'popup',
      width: 420,
      height: 640,
      left: (currentWindow.left || 0) + (currentWindow.width || 800) - 440,
      top: currentWindow.top || 0,
    });
  } catch {
    // Fallback: open in new tab
    browser.tabs.create({ url: browser.runtime.getURL('/assistant-window.html' as any) });
  }
}

// ============================================================
// Clear current conversation
// ============================================================

async function clearCurrentChat(): Promise<void> {
  const confirmed = await showConfirmation(
    i18n(currentLanguage.value, 'history.deleteConfirm'),
    ''
  );
  if (!confirmed) return;
  if (currentSession.value) {
    await deleteSession(currentSession.value.id);
  }
  currentSession.value = null;
  messages.value = [];
  setLastApiMessages([]);
  pendingImages.value = [];
  pendingFiles.value = [];
  contextTrimmedWarning.value = false;
  updateContextUsage();
  await loadInitialSessions();
}

function openLightbox(dataUrl: string) {
  lightboxImage.value = dataUrl;
}

function closeLightbox() {
  lightboxImage.value = null;
}

// Auto-scroll management
let isUserScrolledUp = false;
let scrollRafId: number | null = null;

const checkUserScroll = () => {
  if (scrollRafId !== null) return; // Already scheduled
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;
    const el = chatAreaRef.value;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isUserScrolledUp = distFromBottom > 100;
    showScrollToBottom.value = distFromBottom > 200;
  });
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

async function copyMessage(index: number): Promise<void> {
  const message = messages.value[index];
  if (!message.content || message.role !== 'assistant') return;

  const copied = await writeTextToClipboard(message.content);
  if (copied) {
    copiedMessageIndex.value = index;
    setTimeout(() => {
      if (copiedMessageIndex.value === index) {
        copiedMessageIndex.value = null;
      }
    }, 2000);
  }
}

// ============================================================
// Message actions: Edit, Regenerate, Delete
// ============================================================

function startEditMessage(index: number): void {
  const message = messages.value[index];
  if (message.role !== 'user') return;
  editingMessageIndex.value = index;
  const displayContent = getUserMessageDisplayContent(message);
  editingMessageText.value = displayContent;
}

function getUserMessageDisplayContent(message: ChatMessageData): string {
  if (!message.content) return '';
  if (message.fileAttachments && message.fileAttachments.length > 0) {
    const separatorIndex = message.content.indexOf('\n\n---\n\n');
    if (separatorIndex !== -1) {
      return message.content.substring(0, separatorIndex).trim();
    }
  }
  return message.content;
}

function cancelEditMessage(): void {
  editingMessageIndex.value = null;
  editingMessageText.value = '';
}

async function saveEditMessage(): Promise<void> {
  const index = editingMessageIndex.value;
  if (index === null) return;
  const newText = editingMessageText.value.trim();
  if (!newText) return;

  const truncated = messages.value.slice(0, index);
  const editedMessage = { ...messages.value[index] };
  editedMessage.content = newText;
  editedMessage.timestamp = Date.now();
  editedMessage.fileAttachments = undefined;
  editedMessage.images = undefined;
  editedMessage.quote = undefined;
  truncated.push(editedMessage);

  messages.value = truncated;
  triggerRef(messages);
  editingMessageIndex.value = null;
  editingMessageText.value = '';

  await saveCurrentSession();
  await resendFromLastUserMessage();
}

async function resendFromLastUserMessage(): Promise<void> {
  const lastUserIdx = messages.value.findLastIndex((m) => m.role === 'user');
  if (lastUserIdx === -1) return;

  const messagesForApi = messages.value.slice(0, lastUserIdx + 1);
  messages.value = messagesForApi;
  triggerRef(messages);

  await sendWithExistingMessages();
}

async function sendWithExistingMessages(): Promise<void> {
  isLoading.value = true;
  isUserScrolledUp = false;
  chatAbortController.value?.abort();
  chatAbortController.value = new AbortController();

  const storedProvider = await getActiveProvider();
  if (!storedProvider) {
    chatAbortController.value = null;
    isLoading.value = false;
    openSettings();
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
  const skillTools = getSkillsAsTools(loadedSkills.value);
  openaiTools.push(...skillTools);

  try {
    browser.runtime.sendMessage({ type: 'STREAM_START', sessionId: currentSession.value?.id }).catch(() => {});
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
        if (soundEffectsEnabled.value) playErrorSound();
        browser.runtime.sendMessage({ type: 'STREAMING_ERROR' }).catch(() => {});
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
    browser.runtime.sendMessage({ type: 'STREAMING_END' }).catch(() => {});
  }
}

async function regenerateLastResponse(): Promise<void> {
  const lastMsg = messages.value[messages.value.length - 1];
  if (lastMsg?.role === 'assistant') {
    messages.value.pop();
    triggerRef(messages);
  }
  await resendFromLastUserMessage();
}

async function deleteMessagePair(index: number): Promise<void> {
  const message = messages.value[index];
  if (message.role !== 'user') return;

  const truncated = messages.value.slice(0, index);
  messages.value = truncated;
  triggerRef(messages);
  await saveCurrentSession();
  updateContextUsage();
}

// ============================================================
// Markdown action handlers
// ============================================================

function flashMarkdownCodeButton(button: HTMLButtonElement): void {
  const label = button.querySelector<HTMLElement>('.markdown-code-btn-label');
  if (!label) return;

  const copiedLabel = button.dataset.copiedLabel || i18n(currentLanguage.value, 'chat.copied');
  const defaultLabel = button.dataset.defaultLabel || label.textContent || '';
  const previousTimer = button.dataset.resetTimer ? Number(button.dataset.resetTimer) : null;
  if (previousTimer) window.clearTimeout(previousTimer);

  label.textContent = copiedLabel;
  button.classList.add('copied');

  const timerId = window.setTimeout(() => {
    label.textContent = defaultLabel;
    button.classList.remove('copied');
    delete button.dataset.resetTimer;
  }, 1600);

  button.dataset.resetTimer = String(timerId);
}

function openFullscreenCodeBlock(code: string, language: string): void {
  fullscreenCodeBlock.value = { code, language };
}

function closeFullscreenCodeBlock(): void {
  fullscreenCodeBlock.value = null;
}

async function copyFullscreenCodeBlock(): Promise<void> {
  if (!fullscreenCodeBlock.value) return;
  await writeTextToClipboard(fullscreenCodeBlock.value.code);
}

async function handleMarkdownActionClick(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement | null;
  const actionButton = target?.closest<HTMLButtonElement>('[data-markdown-action]');
  if (!actionButton) return;

  event.preventDefault();
  event.stopPropagation();

  const code = decodeData(actionButton.dataset.code);
  const language = decodeData(actionButton.dataset.language);
  const action = actionButton.dataset.markdownAction;

  if (action === 'copy-code') {
    const copied = await writeTextToClipboard(code);
    if (copied) flashMarkdownCodeButton(actionButton);
  } else if (action === 'expand-code') {
    openFullscreenCodeBlock(code, language);
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (lightboxImage.value) {
      closeLightbox();
    } else if (fullscreenCodeBlock.value) {
      closeFullscreenCodeBlock();
    } else if (isLoading.value) {
      terminateCurrentGeneration();
    } else if (editingMessageIndex.value !== null) {
      cancelEditMessage();
    }
    return;
  }

  if (event.ctrlKey && event.key === 'n') {
    event.preventDefault();
    newChat();
    return;
  }

  if (event.ctrlKey && event.key === 'h') {
    event.preventDefault();
    if (showHistory.value) {
      showHistory.value = false;
    } else {
      openHistory();
    }
    return;
  }

  if (event.ctrlKey && event.key === ',') {
    event.preventDefault();
    openSettings();
    return;
  }

  if (event.ctrlKey && event.shiftKey && event.key === 'C') {
    event.preventDefault();
    const lastAssistantIdx = messages.value.findLastIndex((m) => m.role === 'assistant');
    if (lastAssistantIdx >= 0) {
      copyMessage(lastAssistantIdx);
    }
    return;
  }

  if (event.ctrlKey && event.key === 'f') {
    event.preventDefault();
    showSearch.value = true;
    return;
  }
}

// ============================================================
// Image & File handling (delegated to App-level since it manages state)
// ============================================================

function removePendingImage(imageId: string): void {
  pendingImages.value = pendingImages.value.filter((image) => image.id !== imageId);
}

function removePendingFile(fileId: string): void {
  pendingFiles.value = pendingFiles.value.filter((f) => f.id !== fileId);
}

function openFilePicker(): void {
  fileInputRef.value?.click();
}

function isSupportedImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function isSupportedDocumentFile(file: File): boolean {
  return detectFormat(file.name) !== null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function addPendingImageFiles(fileList: FileList | File[]): Promise<void> {
  if (!activeModelSupportsVision.value) return;

  const files = Array.from(fileList);
  if (files.length === 0) return;

  const imageFiles = files.filter(isSupportedImageFile);
  if (imageFiles.length === 0) return;

  const totalAttachments = pendingImages.value.length + pendingFiles.value.length;
  const availableSlots = Math.max(0, MAX_TOTAL_ATTACHMENTS - totalAttachments);
  if (availableSlots <= 0) return;

  const filesToProcess = imageFiles.slice(0, availableSlots);
  for (const file of filesToProcess) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      showToast(i18n(currentLanguage.value, 'input.imageTooLarge', { size: MAX_IMAGE_SIZE_MB }), 3000);
      continue;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) continue;
      pendingImages.value.push({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type || 'image/*',
        dataUrl,
      });
    } catch (error) {
      console.error('Failed to read image file:', error);
    }
  }
}

async function addPendingDocumentFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  const docFiles = files.filter(isSupportedDocumentFile);
  if (docFiles.length === 0) return;

  const totalAttachments = pendingImages.value.length + pendingFiles.value.length;
  const availableSlots = Math.max(0, MAX_TOTAL_ATTACHMENTS - totalAttachments);
  if (availableSlots <= 0) return;

  const filesToProcess = docFiles.slice(0, availableSlots);
  for (const file of filesToProcess) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(i18n(currentLanguage.value, 'input.fileTooLarge', { size: MAX_FILE_SIZE_MB }), 3000);
      continue;
    }

    try {
      const parsed = await parseFile(file);
      pendingFiles.value.push({
        id: crypto.randomUUID(),
        name: parsed.name,
        format: parsed.format,
        text: parsed.text,
      });
    } catch (error) {
      console.error('Failed to parse document file:', error);
    }
  }
}

async function handleFileInputChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const files = Array.from(input.files);
  const imageFiles = files.filter(isSupportedImageFile);
  const docFiles = files.filter(isSupportedDocumentFile);

  if (imageFiles.length > 0 && activeModelSupportsVision.value) {
    await addPendingImageFiles(imageFiles);
  }
  if (docFiles.length > 0) {
    await addPendingDocumentFiles(docFiles);
  }

  input.value = '';
}

async function handleInputPaste(event: ClipboardEvent): Promise<void> {
  if (!event.clipboardData) return;

  const imageFiles: File[] = [];
  for (const item of Array.from(event.clipboardData.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) imageFiles.push(file);
  }

  if (imageFiles.length === 0) return;
  if (!activeModelSupportsVision.value) return;
  event.preventDefault();
  await addPendingImageFiles(imageFiles);
}

function handleInputDrop(event: DragEvent): Promise<void> {
  if (!event.dataTransfer?.files?.length) return Promise.resolve();

  const files = Array.from(event.dataTransfer.files);
  const imageFiles = files.filter(isSupportedImageFile);
  const docFiles = files.filter(isSupportedDocumentFile);

  const promises: Promise<void>[] = [];
  if (imageFiles.length > 0 && activeModelSupportsVision.value) {
    promises.push(addPendingImageFiles(imageFiles));
  }
  if (docFiles.length > 0) {
    promises.push(addPendingDocumentFiles(docFiles));
  }
  return Promise.all(promises).then(() => {});
}

function handleInputDragEnter(event: DragEvent): void {
  // handled by MessageInput component
}

function handleInputDragOver(event: DragEvent): void {
  // handled by MessageInput component
}

function handleInputDragLeave(event: DragEvent): void {
  // handled by MessageInput component
}

// ============================================================
// Browser automation & tool execution
// ============================================================

async function getActiveTab(): Promise<{ id?: number; url?: string; title?: string; windowId?: number; favIconUrl?: string } | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  } catch {
    return null;
  }
}

async function startBrowserAutomation(tabId: number, taskTitle?: string): Promise<boolean> {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'BROWSER_AUTOMATION_START',
      tabId,
      taskTitle,
    });
    if (response?.success) {
      browserAutomationActive.value = true;
      browserAutomationTabId.value = tabId;
      const tab = await browser.tabs.get(tabId);
      browserAutomationTabTitle.value = tab?.title || '';
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to start browser automation:', error);
    return false;
  }
}

async function endBrowserAutomation(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'BROWSER_AUTOMATION_END' });
  } catch {
    // Ignore errors during cleanup
  }
  browserAutomationActive.value = false;
  browserAutomationTabId.value = null;
  browserAutomationTabTitle.value = '';
}

async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const name = toolCall.name;
  const args = toolCall.arguments;

  try {
    if (isBrowserControlTool(name) && name !== 'browser_take_screenshot') {
      if (!browserAutomationActive.value) {
        const tab = await getActiveTab();
        if (tab?.id) {
          const started = await startBrowserAutomation(tab.id);
          if (!started) {
            return { tool_call_id: toolCall.id, name, result: 'Error: Could not start browser automation. The page may be restricted.', success: false };
          }
        }
      }

      toolExecutionStatus.value = `Executing: ${name.replace('browser_', '').replace('_', ' ')}...`;

      const response = await browser.runtime.sendMessage({
        type: 'BROWSER_AUTOMATION_COMMAND',
        name,
        args,
      });

      const resultText = response?.result || response?.error || 'Tool executed';
      toolExecutionStatus.value = null;

      if (typeof resultText === 'string' && resultText.startsWith('[SCREENSHOT:')) {
        const dataUrl = resultText.substring('[SCREENSHOT:'.length, resultText.length - 1);
        return { tool_call_id: toolCall.id, name, result: 'Screenshot captured successfully. The screenshot has been provided as an image.', success: true };
      }

      return { tool_call_id: toolCall.id, name, result: resultText, success: !resultText.startsWith('Error') };
    }

    if (name === 'browser_take_screenshot') {
      toolExecutionStatus.value = 'Taking screenshot...';
      const response = await browser.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
      toolExecutionStatus.value = null;

      if (response?.dataUrl) {
        return { tool_call_id: toolCall.id, name, result: 'Screenshot captured. [SCREENSHOT_DATA_AVAILABLE]', success: true };
      }
      return { tool_call_id: toolCall.id, name, result: response?.error || 'Failed to take screenshot', success: false };
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

      const { formatPageContent } = await import('../../utils/pageExtractor');
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

      const { formatVideoInfo } = await import('../../utils/videoSummary');
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

    if (name === 'activate_skill') {
      const skillName = args.name as string;
      if (!skillName) {
        return { tool_call_id: toolCall.id, name, result: 'Missing skill name', success: false };
      }
      const skill = loadedSkills.value.find((s) => s.metadata.name === skillName);
      if (!skill) {
        return { tool_call_id: toolCall.id, name, result: `Skill "${skillName}" not found`, success: false };
      }
      activeSkillInstructions.value = skill.instructions;
      return { tool_call_id: toolCall.id, name, result: `Skill "${skillName}" activated. Instructions loaded.\n\n${skill.instructions}`, success: true };
    }

    if (name === 'execute_skill_script') {
      const skillName = args.skillName as string;
      const scriptName = args.scriptName as string;
      const skill = loadedSkills.value.find((s) => s.metadata.name === skillName);
      if (!skill) {
        return { tool_call_id: toolCall.id, name, result: `Skill "${skillName}" not found`, success: false };
      }
      const script = skill.scripts.find((s) => s.name === scriptName || s.path.endsWith(scriptName));
      if (!script) {
        return { tool_call_id: toolCall.id, name, result: `Script "${scriptName}" not found in skill "${skillName}"`, success: false };
      }
      toolExecutionStatus.value = `Running skill script: ${scriptName}...`;
      try {
        const result = await executeScript({
          skill,
          script,
          arguments: (args.arguments as Record<string, unknown>) || {},
        });
        toolExecutionStatus.value = null;
        if (result.success) {
          return { tool_call_id: toolCall.id, name, result: `Script output: ${JSON.stringify(result.output)}`, success: true };
        } else {
          return { tool_call_id: toolCall.id, name, result: `Script error: ${result.error}`, success: false };
        }
      } catch (scriptError) {
        toolExecutionStatus.value = null;
        return { tool_call_id: toolCall.id, name, result: `Script execution error: ${(scriptError as Error).message}`, success: false };
      }
    }

    if (name === 'read_skill_file') {
      const skillName = args.skillName as string;
      const filePath = args.filePath as string;
      const skill = loadedSkills.value.find((s) => s.metadata.name === skillName);
      if (!skill) {
        return { tool_call_id: toolCall.id, name, result: `Skill "${skillName}" not found`, success: false };
      }
      const content = await getSkillFileAsText(skill.id, filePath);
      if (content === null) {
        return { tool_call_id: toolCall.id, name, result: `File "${filePath}" not found in skill "${skillName}"`, success: false };
      }
      return { tool_call_id: toolCall.id, name, result: content, success: true };
    }

    return { tool_call_id: toolCall.id, name, result: `Unknown tool: ${name}`, success: false };
  } catch (error) {
    toolExecutionStatus.value = null;
    return { tool_call_id: toolCall.id, name, result: `Error: ${(error as Error).message}`, success: false };
  }
}

async function extractCurrentPageContent(): Promise<string | null> {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return null;

    sharePageContentLoading.value = true;
    sharePageContentTitle.value = tab.title || '';

    const response = await browser.runtime.sendMessage({
      type: 'EXTRACT_PAGE_CONTENT',
      tabId: tab.id,
      maxLength: 30000,
    });

    sharePageContentLoading.value = false;

    if (response?.error || !response?.content) return null;

    const { formatPageContent } = await import('../../utils/pageExtractor');
    return formatPageContent(response);
  } catch {
    sharePageContentLoading.value = false;
    return null;
  }
}

async function toggleSharePageContent(): Promise<void> {
  if (sharePageContentEnabled.value) {
    sharePageContentEnabled.value = false;
    sharePageContentTitle.value = '';
    sharePageContentUrl.value = '';
    sharePageContentFavicon.value = '';
  } else {
    const tab = await getActiveTab();
    if (tab) {
      sharePageContentTitle.value = tab.title || '';
      sharePageContentUrl.value = tab.url ? new URL(tab.url).hostname.replace('www.', '') : '';
      sharePageContentFavicon.value = tab.favIconUrl || '';
      sharePageContentEnabled.value = true;
    }
  }
}

function showConfirmation(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmationDialog.value = {
      visible: true,
      title,
      message,
      onConfirm: () => {
        confirmationDialog.value = null;
        resolve(true);
      },
      onCancel: () => {
        confirmationDialog.value = null;
        resolve(false);
      },
    };
  });
}

// ============================================================
// MCP connection management
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

function handleScriptConfirmation(
  request: ScriptConfirmationRequest,
): Promise<{ confirmed: boolean; trustForever: boolean }> {
  return new Promise((resolve) => {
    scriptConfirmation.value = {
      visible: true,
      request,
      resolve,
    };
  });
}

function confirmScriptExecution(trustForever: boolean): void {
  scriptConfirmation.value.resolve?.({ confirmed: true, trustForever });
  scriptConfirmation.value = { visible: false, request: null, resolve: null };
}

function cancelScriptExecution(): void {
  scriptConfirmation.value.resolve?.({ confirmed: false, trustForever: false });
  scriptConfirmation.value = { visible: false, request: null, resolve: null };
}

// ============================================================
// Chat
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
    openSettings();
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

  if (sharePageContentEnabled.value) {
    const pageContent = await extractCurrentPageContent();
    if (pageContent) {
      messageContent = `[Shared Page Content]\n${pageContent}\n\n---\n\n${messageContent}`;
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
  if (messageInputRef.value) {
    messageInputRef.value.text = '';
  }
  pendingImages.value = [];
  pendingFiles.value = [];
  scrollToBottom();

  if (soundEffectsEnabled.value) playSentSound();

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
    browser.runtime.sendMessage({ type: 'STREAM_START', sessionId: currentSession.value?.id }).catch(() => {});
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
        if (soundEffectsEnabled.value) playErrorSound();
        browser.runtime.sendMessage({ type: 'STREAMING_ERROR' }).catch(() => {});
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
    if (soundEffectsEnabled.value) playReceivedSound();
    browser.runtime.sendMessage({ type: 'STREAMING_END' }).catch(() => {});
  }
}

function handleMessageReaction(index: number, reaction: 'good' | 'bad'): void {
  const message = messages.value[index];
  if (!message || message.role !== 'assistant') return;
  // Toggle reaction: if same reaction clicked, remove it
  if (message.reaction === reaction) {
    message.reaction = undefined;
  } else {
    message.reaction = reaction;
  }
  triggerRef(messages);
  debouncedSave();
}

function terminateCurrentGeneration(): void {
  if (!chatAbortController.value) return;
  chatAbortController.value.abort();
  isLoading.value = false;
  browser.runtime.sendMessage({ type: 'STREAMING_END' }).catch(() => {});
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

async function loadMoreSessions() {
  if (sessionsLoading.value || !sessionsHasMore.value) return;
  sessionsLoading.value = true;
  try {
    const result = await getSessionsPaginated(SESSIONS_PAGE_SIZE, sessionsOffset.value);
    sessions.value = [...sessions.value, ...result.sessions];
    sessionsHasMore.value = result.hasMore;
    sessionsOffset.value += result.sessions.length;
  } finally {
    sessionsLoading.value = false;
  }
}

async function newChat() {
  currentSession.value = null;
  messages.value = [];
  setLastApiMessages([]);
  pendingImages.value = [];
  pendingFiles.value = [];
  showHistory.value = false;
  updateContextUsage();
}

async function openHistory() {
  await loadInitialSessions();
  showHistory.value = true;
}

async function loadSession(session: ChatSession) {
  currentSession.value = session;
  messages.value = session.messages;
  if (session.apiMessages) {
    setLastApiMessages(session.apiMessages);
  } else {
    setLastApiMessages([]);
  }
  showHistory.value = false;
  updateContextUsage();
  scrollToBottom();
}

async function removeSession(id: string) {
  if (confirm(i18n(currentLanguage.value, 'history.deleteConfirm'))) {
    await deleteSession(id);
    await loadInitialSessions();
    if (currentSession.value?.id === id) {
      if (sessions.value.length > 0) {
        await loadSession(sessions.value[0]);
      } else {
        currentSession.value = null;
        messages.value = [];
      }
    }
  }
}

async function renameSession(id: string, newTitle: string) {
  if (!newTitle) return;
  const session = sessions.value.find((s) => s.id === id);
  if (!session || session.title === newTitle) return;

  session.title = newTitle;
  if (currentSession.value?.id === id) {
    currentSession.value.title = newTitle;
  }
  await saveCurrentSession();
  await loadInitialSessions();
}

// ============================================================
// Settings
// ============================================================

function openSettings() {
  browser.runtime.openOptionsPage();
}

// ============================================================
// Import/Export in sidepanel
// ============================================================

async function handleExportCurrentSession() {
  if (!currentSession.value) return;
  try {
    const { downloadAsMarkdown } = await import('../../utils/chatImportExport');
    downloadAsMarkdown(currentSession.value);
  } catch (error) {
    console.error('Export failed:', error);
  }
}

async function handleExportCurrentSessionAsHtml() {
  if (!currentSession.value) return;
  try {
    const { downloadAsHtml } = await import('../../utils/chatImportExport');
    downloadAsHtml(currentSession.value);
  } catch (error) {
    console.error('Export failed:', error);
  }
}

async function handleImportSession(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const { readImportFile, validateImportData, importSessions } = await import('../../utils/chatImportExport');
    const data = await readImportFile(file);
    const validation = validateImportData(data);
    if (!validation.valid) {
      showToast(`${i18n(currentLanguage.value, 'data.invalidFile')}: ${validation.errors.join(', ')}`, 3000);
      return;
    }
    const count = await importSessions(data, 'merge');
    showToast(i18n(currentLanguage.value, 'data.importSuccess', { count }));
    await loadInitialSessions();
  } catch (error) {
    showToast(i18n(currentLanguage.value, 'data.importFailed', { error: error instanceof Error ? error.message : 'Unknown error' }), 3000);
  } finally {
    input.value = '';
  }
}

// ============================================================
// Quick action fill / context cards
// ============================================================

function handleFillInput(text: string): void {
  if (!text) {
    messageInputRef.value?.focus();
    return;
  }
  inputText.value = text;
  if (messageInputRef.value) {
    messageInputRef.value.text = text;
  }
  nextTick(() => {
    messageInputRef.value?.focus();
  });
}

async function handleContextAction(action: string): Promise<void> {
  switch (action) {
    case 'summarize-page': {
      sharePageContentEnabled.value = true;
      const tab = await getActiveTab();
      if (tab) {
        sharePageContentTitle.value = tab.title || '';
      }
      inputText.value = 'Please summarize this page.';
      if (messageInputRef.value) {
        messageInputRef.value.text = inputText.value;
      }
      nextTick(() => {
        sendMessage();
      });
      break;
    }
    case 'analyze-image': {
      // Trigger image file picker
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = false;
      input.onchange = async () => {
        if (!input.files?.length) return;
        await addPendingImageFiles(Array.from(input.files));
        inputText.value = 'What is in this image?';
        if (messageInputRef.value) {
          messageInputRef.value.text = inputText.value;
        }
        nextTick(() => {
          messageInputRef.value?.focus();
        });
      };
      input.click();
      break;
    }
    case 'help-write': {
      inputText.value = 'Help me write: ';
      if (messageInputRef.value) {
        messageInputRef.value.text = inputText.value;
      }
      nextTick(() => {
        messageInputRef.value?.focus();
      });
      break;
    }
    case 'ask-anything': {
      nextTick(() => {
        messageInputRef.value?.focus();
      });
      break;
    }
  }
}

// ============================================================
// Model selector
// ============================================================

async function selectProviderModel(providerId: string, model: string) {
  const allProviders = await getAllProviders();
  const target = allProviders.find((p) => p.id === providerId);
  if (!target) return;

  if (!target.models.includes(model)) {
    console.error('Model not found in provider:', model, target.models);
    return;
  }

  if (target.selectedModel !== model) {
    target.selectedModel = model;
    await saveProvider(target);
  }

  await setActiveProviderId(providerId);
  activeProviderId.value = providerId;
}

// ============================================================
// Onboarding
// ============================================================

async function completeOnboarding(): Promise<void> {
  showOnboarding.value = false;
  providers.value = await getAllProviders();
  const active = await getActiveProvider();
  activeProviderId.value = active?.id || null;
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
// Selection quote
// ============================================================

function getSelectionEndPosition(): { x: number; y: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const endRange = range.cloneRange();
  endRange.collapse(false);
  const rects = endRange.getClientRects();

  if (rects.length > 0) {
    const lastRect = rects[rects.length - 1];
    return { x: lastRect.right, y: lastRect.bottom };
  }

  const boundingRect = range.getBoundingClientRect();
  if (boundingRect.width === 0 && boundingRect.height === 0) return null;
  return { x: boundingRect.right, y: boundingRect.bottom };
}

function hideSelectionQuotePopup(): void {
  selectionQuotePopup.value.visible = false;
}

function useSidepanelSelectionQuote(): void {
  if (!selectionQuotePopup.value.text) return;
  inputText.value = `[Quote: "${selectionQuotePopup.value.text}"]\n\n` + inputText.value;
  if (messageInputRef.value) {
    messageInputRef.value.text = inputText.value;
  }
  hideSelectionQuotePopup();
  window.getSelection()?.removeAllRanges();
  nextTick(() => {
    messageInputRef.value?.focus();
  });
}

function handleSidepanelSelectionMouseup(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest('textarea, input, [contenteditable="true"], .input-area, .message-content, button')) {
    return;
  }

  if (!selectionQuoteEnabled.value) {
    hideSelectionQuotePopup();
    return;
  }

  const selection = window.getSelection();
  const text = selection?.toString().trim() || '';
  if (!text) {
    hideSelectionQuotePopup();
    return;
  }

  const position = getSelectionEndPosition();
  if (!position) {
    hideSelectionQuotePopup();
    return;
  }

  selectionQuotePopup.value = {
    visible: true,
    x: Math.max(position.x, 12),
    y: Math.max(position.y + 10, 12),
    text,
  };
}

function handleSidepanelSelectionMousedown(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.selection-quote-popup')) return;
  hideSelectionQuotePopup();
}

// ============================================================
// Content script message handler
// ============================================================

let contentMessageHandler: ((message: any) => void) | null = null;

function handleContentMessage(message: any): void {
  if (!message?.type) return;

  switch (message.type) {
    case 'CONTENT_IMAGE_TO_CHAT': {
      if (message.imageUrl) {
        handleContentImageMessage(message.imageUrl, message.prompt || 'What is in this screenshot?');
      }
      break;
    }
    case 'TOGGLE_BROWSER_CONTROL': {
      if (browserAutomationActive.value) {
        endBrowserAutomation();
      }
      break;
    }
    case 'CONTEXT_MENU_ACTION': {
      if (message.prompt) {
        inputText.value = message.prompt;
        if (messageInputRef.value) {
          messageInputRef.value.text = message.prompt;
        }
        nextTick(() => {
          sendMessage();
        });
      }
      break;
    }
  }
}

async function handleContentImageMessage(imageUrl: string, prompt: string): Promise<void> {
  isLoading.value = true;
  isUserScrolledUp = false;
  chatAbortController.value?.abort();
  chatAbortController.value = new AbortController();

  const storedProvider = await getActiveProvider();
  if (!storedProvider) {
    chatAbortController.value = null;
    isLoading.value = false;
    openSettings();
    return;
  }

  const provider = toAIProvider(storedProvider);

  if (!currentSession.value) {
    currentSession.value = await createSession(storedProvider.id);
    await loadInitialSessions();
  }

  const userMessage: ChatMessageData = {
    role: 'user',
    content: prompt,
    timestamp: Date.now(),
    images: [{
      id: crypto.randomUUID(),
      name: 'screenshot.png',
      mimeType: 'image/png',
      dataUrl: imageUrl,
    }],
  };

  messages.value.push(userMessage);
  triggerRef(messages);
  scrollToBottom();

  if (messages.value.length === 1) {
    currentSession.value.title = await generateSessionTitle('Screenshot');
  }

  const openaiTools = getToolsAsOpenAIFunctions() as any;

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
        if (soundEffectsEnabled.value) playErrorSound();
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

// ============================================================
// Template handling
// ============================================================

async function startTemplate(template: ChatTemplate) {
  if (!activeProvider.value) {
    openSettings();
    return;
  }
  // Create a new session with the template's system prompt baked into the first message
  await newChat();
  inputText.value = '';
  if (messageInputRef.value) {
    messageInputRef.value.text = '';
  }
  // We set the system prompt via storage - the API layer reads it
  const { setSystemPrompt } = await import('../../utils/storage');
  await setSystemPrompt(template.systemPrompt);
  // Give the user a visual hint
  showToast(`Template: ${template.name}`, 1500);
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(async () => {
  try {
    providers.value = await getAllProviders();
    const active = await getActiveProvider();
    activeProviderId.value = active?.id || null;

    // Check if onboarding should be shown
    const onboardingDone = await getOnboardingCompleted();
    if (!onboardingDone && providers.value.length === 0) {
      showOnboarding.value = true;
    }

    currentThemeMode.value = await getThemeMode();
    applyTheme(currentThemeMode.value);

    currentLanguage.value = await getLanguage();

    selectionQuoteEnabled.value = await getSelectionQuoteEnabled();

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

    unwatchSelectionQuoteEnabled.value = watchSelectionQuoteEnabled((enabled) => {
      selectionQuoteEnabled.value = enabled;
      if (!enabled) hideSelectionQuotePopup();
    });

    markdownActionClickHandler = (event: MouseEvent) => {
      void handleMarkdownActionClick(event);
    };
    globalKeydownHandler = (event: KeyboardEvent) => {
      handleGlobalKeydown(event);
    };
    document.addEventListener('click', markdownActionClickHandler);
    document.addEventListener('keydown', globalKeydownHandler);
    document.addEventListener('mouseup', handleSidepanelSelectionMouseup);
    document.addEventListener('mousedown', handleSidepanelSelectionMousedown);
    if (chatAreaRef.value) {
      chatAreaRef.value.addEventListener('scroll', checkUserScroll, { passive: true });
    }

    contentMessageHandler = (message: any) => {
      handleContentMessage(message);
    };
    browser.runtime.onMessage.addListener(contentMessageHandler);

    await connectEnabledMcpServers();

    unwatchMcpServers.value = watchMcpServers(async () => {
      await connectEnabledMcpServers();
    });

    loadedSkills.value = await getAllSkills();

    setScriptConfirmCallback(handleScriptConfirmation);

    // Load templates
    chatTemplates.value = await getAllTemplates();

    // Load preset actions
    presetActions.value = await getPresetActions();

    // Load sound effects setting
    soundEffectsEnabled.value = await getSoundEffects();

    unwatchSoundEffects.value = watchSoundEffects((enabled) => {
      soundEffectsEnabled.value = enabled;
    });

    // Load reactions display setting
    showReactionsEnabled.value = await getShowReactions();

    unwatchShowReactions.value = watchShowReactions((enabled) => {
      showReactionsEnabled.value = enabled;
    });

    // Network status monitoring
    const handleOnline = () => { isOffline.value = false; };
    const handleOffline = () => { isOffline.value = true; };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Auto-focus input after short delay
    setTimeout(() => {
      messageInputRef.value?.focus();
    }, 300);

    // Store refs for cleanup
    (window as any).__nexusOnlineHandler = handleOnline;
    (window as any).__nexusOfflineHandler = handleOffline;
  } catch (error) {
    console.error('[Nexus] Sidepanel initialization failed:', error);
    showToast('Failed to initialize. Please reload the panel.', 5000);
  }
});

onUnmounted(() => {
  chatAbortController.value?.abort();

  browser.runtime.sendMessage({ type: 'STREAM_END' }).catch(() => {});

  if (currentSession.value && messages.value.length > 0) {
    saveCurrentSession().catch(() => {});
  }

  if (saveTimer) clearTimeout(saveTimer);
  if (toastTimer) clearTimeout(toastTimer);
  clearStreamRenderState();
  // Cleanup network listeners
  const onlineHandler = (window as any).__nexusOnlineHandler;
  const offlineHandler = (window as any).__nexusOfflineHandler;
  if (onlineHandler) window.removeEventListener('online', onlineHandler);
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);
  unwatchProviders.value?.();
  unwatchActiveProviderId.value?.();
  unwatchLanguage.value?.();
  unwatchThemeMode.value?.();
  unwatchSelectionQuoteEnabled.value?.();
  unwatchMcpServers.value?.();
  unwatchSoundEffects.value?.();
  unwatchShowReactions.value?.();
  systemThemeMediaQuery.value?.removeEventListener('change', handleSystemThemeChange);
  mcpManager.disconnectAll().catch(() => {});
  if (markdownActionClickHandler) document.removeEventListener('click', markdownActionClickHandler);
  if (globalKeydownHandler) document.removeEventListener('keydown', globalKeydownHandler);
  document.removeEventListener('mouseup', handleSidepanelSelectionMouseup);
  document.removeEventListener('mousedown', handleSidepanelSelectionMousedown);
  if (chatAreaRef.value) {
    chatAreaRef.value.removeEventListener('scroll', checkUserScroll);
  }
  isUserScrolledUp = false;
  if (contentMessageHandler) {
    browser.runtime.onMessage.removeListener(contentMessageHandler);
    contentMessageHandler = null;
  }
});
</script>

<template>
  <div class="sidepanel">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="header-btn" @click="openHistory" :title="i18n(currentLanguage, 'header.history')" :aria-label="i18n(currentLanguage, 'header.history')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
      </div>

      <div class="header-center">
        <ModelSelector
          ref="modelSelectorRef"
          :providers="providers"
          :active-provider-id="activeProviderId"
          :active-model-name="activeModelName"
          :language="currentLanguage"
          @select="selectProviderModel"
        />
        <!-- Context usage bar -->
        <div v-if="messages.length > 0" class="context-bar" :title="`${contextTokenEstimate.toLocaleString()} / ${contextTokenMax.toLocaleString()} tokens`">
          <div class="context-bar-fill" :style="{ width: contextUsagePercent + '%', background: contextBarColor }"></div>
        </div>
      </div>

      <div class="header-right">
        <button class="header-btn" @click="toggleTheme" :title="i18n(currentLanguage, 'header.toggleTheme')" :aria-label="i18n(currentLanguage, 'header.toggleTheme')">
          <svg v-if="currentThemeMode === 'light'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg v-else-if="currentThemeMode === 'dark'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </button>
        <button class="header-btn" @click="newChat" :title="i18n(currentLanguage, 'header.newChat')" :aria-label="i18n(currentLanguage, 'header.newChat')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <HeaderMenu
          :language="currentLanguage"
          :has-session="!!currentSession && messages.length > 0"
          @share-chat="shareChatAsMarkdown"
          @export-chat="handleExportCurrentSession"
          @search="showSearch = true"
          @pop-out="popOutChat"
          @clear-chat="clearCurrentChat"
        />
        <button class="header-btn" @click="openSettings" :title="i18n(currentLanguage, 'header.settings')" :aria-label="i18n(currentLanguage, 'header.settings')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Chat area -->
    <ChatSearch
      v-if="showSearch"
      :language="currentLanguage"
      :chat-area-ref="chatAreaRef"
      @close="showSearch = false"
    />
    <div class="chat-area" ref="chatAreaRef" role="log" aria-label="Chat messages" aria-live="polite">
      <!-- Onboarding wizard -->
      <OnboardingWizard
        v-if="showOnboarding && messages.length === 0"
        :language="currentLanguage"
        @complete="completeOnboarding"
        @open-settings="openSettings"
      />

      <!-- Empty state -->
      <div v-if="messages.length === 0 && !showOnboarding" class="empty-state">
        <div class="empty-state-bg"></div>
        <div class="empty-state-content">
          <div class="empty-state-logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h2 class="empty-state-title">Nexus</h2>
          <p v-if="!activeProvider" class="empty-state-subtitle">{{ i18n(currentLanguage, 'empty.noProvider') }}</p>
          <p v-else class="empty-state-subtitle">{{ i18n(currentLanguage, 'empty.subtitle') }}</p>
          <button v-if="!activeProvider" class="empty-state-cta" @click="openSettings">
            {{ i18n(currentLanguage, 'empty.configure') }}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          <!-- Context action cards (shown when provider is configured) -->
          <div v-if="activeProvider" class="context-cards">
            <button class="context-card" @click="handleContextAction('summarize-page')">
              <div class="context-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div class="context-card-text">
                <span class="context-card-title">{{ i18n(currentLanguage, 'context.summarizePage') }}</span>
                <span class="context-card-desc">{{ i18n(currentLanguage, 'context.summarizePageDesc') }}</span>
              </div>
            </button>
            <button class="context-card" @click="handleContextAction('analyze-image')">
              <div class="context-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <div class="context-card-text">
                <span class="context-card-title">{{ i18n(currentLanguage, 'context.analyzeImage') }}</span>
                <span class="context-card-desc">{{ i18n(currentLanguage, 'context.analyzeImageDesc') }}</span>
              </div>
            </button>
            <button class="context-card" @click="handleContextAction('help-write')">
              <div class="context-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <div class="context-card-text">
                <span class="context-card-title">{{ i18n(currentLanguage, 'context.helpWrite') }}</span>
                <span class="context-card-desc">{{ i18n(currentLanguage, 'context.helpWriteDesc') }}</span>
              </div>
            </button>
            <button class="context-card" @click="handleContextAction('ask-anything')">
              <div class="context-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div class="context-card-text">
                <span class="context-card-title">{{ i18n(currentLanguage, 'context.askAnything') }}</span>
                <span class="context-card-desc">{{ i18n(currentLanguage, 'context.askAnythingDesc') }}</span>
              </div>
            </button>
          </div>

          <!-- Template cards -->
          <div v-if="activeProvider && chatTemplates.length > 0" class="template-cards">
            <button
              v-for="template in chatTemplates"
              :key="template.id"
              class="template-card"
              @click="startTemplate(template)"
            >
              <span class="template-card-icon">
                <svg v-if="template.icon === 'translate'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M12 22l5-10 5 10"/><path d="M14.5 18h5"/></svg>
                <svg v-else-if="template.icon === 'code'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <svg v-else-if="template.icon === 'edit'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <span class="template-card-name">{{ template.name }}</span>
            </button>
          </div>
          <p v-if="!activeProvider" class="empty-state-hint">{{ i18n(currentLanguage, 'empty.hint') }}</p>
        </div>
      </div>

      <!-- Messages -->
      <ChatMessage
        v-for="(message, index) in messages"
        :key="index"
        :message="message"
        :index="index"
        :is-last="index === messages.length - 1"
        :language="currentLanguage"
        :is-loading="isLoading"
        :is-editing="editingMessageIndex === index"
        :editing-text="editingMessageText"
        :copied="copiedMessageIndex === index"
        :reasoning-expanded="!!reasoningExpanded[index]"
        :show-reactions="showReactionsEnabled"
        @edit="startEditMessage"
        @cancel-edit="cancelEditMessage"
        @save-edit="saveEditMessage"
        @update:editing-text="editingMessageText = $event"
        @copy="copyMessage"
        @delete="deleteMessagePair"
        @regenerate="regenerateLastResponse"
        @toggle-reasoning="(i) => reasoningExpanded[i] = !reasoningExpanded[i]"
        @open-lightbox="openLightbox"
        @copy-error="(rawError) => { writeTextToClipboard(rawError).then((ok) => { if (ok) showToast(i18n(currentLanguage, 'chat.copied')); }); }"
        @react="handleMessageReaction"
      />

      <!-- Scroll to bottom button -->
      <button
        v-if="showScrollToBottom"
        class="scroll-to-bottom-btn"
        @click="handleScrollToBottom"
        :title="i18n(currentLanguage, 'action.scrollToBottom')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    </div>

    <!-- Network offline warning -->
    <div v-if="isOffline" class="offline-warning-bar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 015.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0122.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 016.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
      <span>{{ i18n(currentLanguage, 'network.offline') }}</span>
    </div>

    <!-- Browser automation status -->
    <div v-if="browserAutomationActive || toolExecutionStatus" class="automation-status-bar">
      <div class="automation-status-indicator"></div>
      <span v-if="toolExecutionStatus" class="automation-status-text">{{ toolExecutionStatus }}</span>
      <span v-else class="automation-status-text">{{ i18n(currentLanguage, 'browser.activeTab', { title: browserAutomationTabTitle }) }}</span>
      <button v-if="browserAutomationActive" class="automation-status-stop" @click="endBrowserAutomation">{{ i18n(currentLanguage, 'browser.end') }}</button>
    </div>

    <!-- Context trimming warning -->
    <div v-if="contextUsagePercent >= 90" class="context-warning-bar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>{{ i18n(currentLanguage, 'context.nearLimit') }}</span>
    </div>

    <!-- Context trimmed notice -->
    <Transition name="toast">
      <div v-if="contextTrimmedWarning" class="context-trimmed-bar" @click="contextTrimmedWarning = false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ i18n(currentLanguage, 'context.trimmed') }}</span>
      </div>
    </Transition>

    <!-- Input area -->
    <input
      type="file"
      ref="fileInputRef"
      accept="image/*,.pdf,.docx,.csv,.txt,.md"
      multiple
      style="display: none"
      @change="handleFileInputChange"
    />
    <MessageInput
      ref="messageInputRef"
      :language="currentLanguage"
      :supports-vision="activeModelSupportsVision"
      :is-loading="isLoading"
      :has-active-provider="!!activeProvider"
      :pending-images="pendingImages"
      :pending-files="pendingFiles"
      :share-page-enabled="sharePageContentEnabled"
      :share-page-title="sharePageContentTitle"
      :share-page-url="sharePageContentUrl"
      :share-page-favicon="sharePageContentFavicon"
      :share-page-loading="sharePageContentLoading"
      :preset-actions="getEffectivePresets()"
      :is-chat-empty="messages.length === 0"
      :sound-enabled="soundEffectsEnabled"
      @send="sendMessage"
      @stop="terminateCurrentGeneration"
      @update:text="inputText = $event"
      @remove-image="removePendingImage"
      @remove-file="removePendingFile"
      @toggle-share-page="toggleSharePageContent"
      @open-file-picker="openFilePicker"
      @paste="handleInputPaste"
      @drop="handleInputDrop"
      @fill-input="handleFillInput"
    />

    <!-- History panel -->
    <Transition name="history-panel">
      <div v-if="showHistory" class="history-overlay" @click="showHistory = false">
        <SessionHistory
          :sessions="sessions"
          :current-session-id="currentSession?.id || null"
          :language="currentLanguage"
          :has-more="sessionsHasMore"
          :loading="sessionsLoading"
          @load="loadSession"
          @delete="removeSession"
          @load-more="loadMoreSessions"
          @rename="renameSession"
          @export-markdown="handleExportCurrentSession"
          @export-html="handleExportCurrentSessionAsHtml"
          @import="handleImportSession"
          @new-chat="newChat"
          @close="showHistory = false"
        />
      </div>
    </Transition>

    <!-- Selection quote popup -->
    <div
      v-if="selectionQuotePopup.visible"
      class="selection-quote-popup"
      :style="{ left: selectionQuotePopup.x + 'px', top: selectionQuotePopup.y + 'px' }"
    >
      <button @click="useSidepanelSelectionQuote">{{ i18n(currentLanguage, 'selectionQuote.quote') }}</button>
    </div>

    <!-- Fullscreen code modal -->
    <CodeFullscreen
      v-if="fullscreenCodeBlock"
      :code="fullscreenCodeBlock.code"
      :language="fullscreenCodeBlock.language"
      :lang="currentLanguage"
      @close="closeFullscreenCodeBlock"
      @copy="copyFullscreenCodeBlock"
    />

    <!-- Confirmation dialog -->
    <div v-if="confirmationDialog?.visible" class="confirmation-overlay" @click="confirmationDialog.onCancel">
      <div class="confirmation-dialog" @click.stop>
        <h4 class="confirmation-title">{{ confirmationDialog.title }}</h4>
        <p class="confirmation-message">{{ confirmationDialog.message }}</p>
        <div class="confirmation-actions">
          <button class="confirmation-btn cancel" @click="confirmationDialog.onCancel">{{ i18n(currentLanguage, 'confirm.cancel') }}</button>
          <button class="confirmation-btn confirm" @click="confirmationDialog.onConfirm">{{ i18n(currentLanguage, 'confirm.confirm') }}</button>
        </div>
      </div>
    </div>

    <!-- Script execution confirmation -->
    <div v-if="scriptConfirmation.visible && scriptConfirmation.request" class="confirmation-overlay" @click="cancelScriptExecution">
      <div class="confirmation-dialog" @click.stop>
        <h4 class="confirmation-title">{{ i18n(currentLanguage, 'script.title') }}</h4>
        <p class="confirmation-message">
          <strong>{{ scriptConfirmation.request.skillName }}</strong> {{ i18n(currentLanguage, 'script.wantsToRun') }}
          <strong>{{ scriptConfirmation.request.scriptName }}</strong>.
        </p>
        <details class="script-details">
          <summary>{{ i18n(currentLanguage, 'script.viewSource') }}</summary>
          <pre class="script-source">{{ scriptConfirmation.request.scriptContent }}</pre>
        </details>
        <div class="confirmation-actions">
          <button class="confirmation-btn cancel" @click="cancelScriptExecution">{{ i18n(currentLanguage, 'confirm.cancel') }}</button>
          <button class="confirmation-btn confirm" @click="confirmScriptExecution(false)">{{ i18n(currentLanguage, 'script.runOnce') }}</button>
          <button class="confirmation-btn confirm" @click="confirmScriptExecution(true)">{{ i18n(currentLanguage, 'script.trustForever') }}</button>
        </div>
      </div>
    </div>

    <!-- Image lightbox -->
    <div v-if="lightboxImage" class="lightbox-overlay" @click="closeLightbox">
      <div class="lightbox-container" @click.stop>
        <button class="lightbox-close" @click="closeLightbox">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <img :src="lightboxImage" alt="Preview" class="lightbox-image" />
      </div>
    </div>

    <!-- Toast notification -->
    <Transition name="toast">
      <div v-if="toastMessage" class="toast-notification" :class="'toast-' + toastType">
        <svg v-if="toastType === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else-if="toastType === 'error'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <svg v-else-if="toastType === 'warning'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.sidepanel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: var(--color-bg-primary);
  position: relative;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  position: sticky;
  top: 0;
  z-index: 10;
  min-height: 48px;
  transition: background 500ms ease, border-color 500ms ease;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.header-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.header-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  transform: scale(1.05);
}

.header-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Context bar */
.context-bar {
  width: 120px;
  height: 3px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
  cursor: default;
}

.context-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 300ms ease, background 300ms ease;
}

/* Chat area */
.chat-area {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Add visual grouping: gap after assistant message before next user message */
.chat-area > :deep(.message-wrapper.message-assistant) {
  margin-bottom: var(--spacing-lg);
}

/* Small gap between messages in same pair */
.chat-area > :deep(.message-wrapper.message-user) {
  margin-bottom: var(--spacing-xs);
}

.chat-area > :deep(.message-wrapper.message-assistant:last-child) {
  margin-bottom: 0;
}

.chat-area > :deep(.message-wrapper.message-user:last-child) {
  margin-bottom: 0;
}

/* Empty state */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  color: var(--color-text-secondary);
  position: relative;
}

.empty-state-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 40%, rgba(0, 122, 255, 0.06), transparent 70%);
  pointer-events: none;
}

[data-theme="dark"] .empty-state-bg {
  background: radial-gradient(circle at 50% 40%, rgba(10, 132, 255, 0.1), transparent 70%);
}

.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  animation: empty-fade-in 400ms ease;
}

@keyframes empty-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.empty-state-logo {
  opacity: 0.8;
}

.empty-state-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

.empty-state-subtitle {
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
}

.empty-state-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  font-size: var(--font-size-md);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-full);
  transition: all var(--transition-normal);
  font-family: var(--font-body);
}

.empty-state-cta:hover {
  background: var(--color-accent-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.empty-state-hint {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

/* Context action cards */
.context-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
  max-width: 380px;
  width: 100%;
}

.context-card {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-body);
  transition: all var(--transition-fast);
}

.context-card:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.context-card-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-success-bg);
  color: var(--color-accent);
}

.context-card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.context-card-title {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-card-desc {
  font-size: 10px;
  color: var(--color-text-secondary);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Template cards */
.template-cards {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
  justify-content: center;
  max-width: 380px;
}

.template-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-full);
  transition: all var(--transition-fast);
  font-family: var(--font-body);
}

.template-card:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
  transform: scale(1.02);
}

.template-card-icon {
  display: flex;
  align-items: center;
  color: var(--color-accent);
}

.template-card-name {
  white-space: nowrap;
}

/* Scroll to bottom button */
.scroll-to-bottom-btn {
  position: sticky;
  bottom: var(--spacing-md);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 50%;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-fast);
  z-index: 5;
  margin: var(--spacing-sm) auto;
  align-self: center;
}

.scroll-to-bottom-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-lg);
  transform: translateX(-50%) scale(1.05);
}

/* History overlay */
.history-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-overlay);
  backdrop-filter: var(--blur-frost);
  z-index: 50;
  display: flex;
  justify-content: flex-start;
}

/* History panel transitions */
.history-panel-enter-active {
  animation: history-enter 250ms ease;
}

.history-panel-leave-active {
  animation: history-leave 200ms ease;
}

@keyframes history-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes history-leave {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Browser automation status bar */
.automation-status-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.automation-status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: pulse-dot 2s infinite ease-in-out;
  flex-shrink: 0;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.automation-status-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.automation-status-stop {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-error);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.automation-status-stop:hover {
  background: var(--color-error);
  color: var(--color-text-on-accent);
}

/* Network offline warning bar */
.offline-warning-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-error-bg);
  border-top: 1px solid var(--color-error-border);
  font-size: var(--font-size-xs);
  color: var(--color-error);
}

/* Context warning bar */
.context-warning-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-warning-bg);
  border-top: 1px solid var(--color-warning-border);
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}

/* Context trimmed notice bar */
.context-trimmed-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-success-bg);
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  cursor: pointer;
  animation: trimmed-bar-in 200ms ease;
}

@keyframes trimmed-bar-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Selection quote popup */
.selection-quote-popup {
  position: fixed;
  z-index: 40;
  display: flex;
  gap: var(--spacing-xs);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: var(--spacing-xs) var(--spacing-sm);
  box-shadow: var(--shadow-md);
  backdrop-filter: var(--blur-frost);
  animation: popup-fade-in 150ms ease;
}

@keyframes popup-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.selection-quote-popup button {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-full);
  transition: all var(--transition-fast);
}

.selection-quote-popup button:hover {
  background: var(--color-bg-secondary);
}

/* Confirmation dialog */
.confirmation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-overlay-heavy);
  backdrop-filter: var(--blur-frost);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlay-fade 200ms ease;
}

.confirmation-dialog {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-lg);
  max-width: 360px;
  width: 90%;
  animation: dialog-scale-in 200ms ease;
}

@keyframes dialog-scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.confirmation-title {
  font-size: var(--font-size-md);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.confirmation-message {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
  line-height: var(--line-height-normal);
}

.confirmation-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
}

.confirmation-btn {
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.confirmation-btn.cancel {
  background: transparent;
  color: var(--color-text-secondary);
}

.confirmation-btn.cancel:hover {
  background: var(--color-bg-secondary);
}

.confirmation-btn.confirm {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-text-on-accent);
}

.confirmation-btn.confirm:hover {
  background: var(--color-accent-hover);
}

/* Script confirmation */
.script-details {
  margin-bottom: var(--spacing-md);
}

.script-details summary {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  cursor: pointer;
  margin-bottom: var(--spacing-xs);
}

.script-source {
  max-height: 150px;
  overflow-y: auto;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Image lightbox */
.lightbox-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-overlay-heavy);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
  animation: lightbox-fade-in 150ms ease;
}

@keyframes lightbox-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.lightbox-container {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: lightbox-scale-in 200ms ease;
}

@keyframes lightbox-scale-in {
  from { transform: scale(0.9); }
  to { transform: scale(1); }
}

.lightbox-close {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-on-accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
  z-index: 10;
}

.lightbox-close:hover {
  background: var(--color-bg-secondary);
}

.lightbox-image {
  max-width: 100%;
  max-height: 85vh;
  border-radius: var(--radius-md);
  object-fit: contain;
}

/* Toast notification */
.toast-notification {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-size-sm);
  z-index: 300;
  max-width: 90%;
  text-align: center;
  pointer-events: none;
  backdrop-filter: var(--blur-frost);
}

.toast-success { color: var(--color-success); }
.toast-error { color: var(--color-error); }
.toast-warning { color: var(--color-warning); }
.toast-info { color: var(--color-accent); }

.toast-notification span {
  color: var(--color-text-primary);
}

.toast-enter-active {
  animation: toast-in 200ms ease;
}

.toast-leave-active {
  animation: toast-out 200ms ease;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes toast-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Responsive fixes for narrow sidepanel (as low as 280px) */
.sidepanel .chat-area {
  padding: var(--spacing-sm);
}

.sidepanel :deep(.message-bubble) {
  max-width: 90%;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.sidepanel :deep(.model-selector-btn .model-name) {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Narrow panel context cards */
@media (max-width: 340px) {
  .context-cards {
    grid-template-columns: 1fr;
  }

  .header-center {
    min-width: 0;
  }
}

/* Theme transition - applied via JS class toggle during theme switch */
.sidepanel.theme-transitioning,
.sidepanel.theme-transitioning .header,
.sidepanel.theme-transitioning .chat-area,
.sidepanel.theme-transitioning .input-area {
  transition: background-color var(--transition-slow), border-color var(--transition-slow), color var(--transition-slow);
}

/* Global interactive element transitions */
.sidepanel button,
.sidepanel input,
.sidepanel select,
.sidepanel textarea {
  transition: all var(--transition-fast);
}
</style>
