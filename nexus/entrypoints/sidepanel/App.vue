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
  toAIProvider,
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
import { streamChat, getLastApiMessages, setLastApiMessages, ApiError, type StreamChatConfig } from '../../utils/api';
import { renderMarkdown, decodeData, initChartRendering } from '../../utils/markdown';
import { t as i18n } from '../../utils/i18n';
import type { Language } from '../../utils/i18n';
import { parseFile, detectFormat, type ParsedFile } from '../../utils/fileParser';
import type { ChatMessage, ChatImage, ChatFileAttachment, ToolCall, ToolResult } from '../../utils/providers/types';
import { getToolsAsOpenAIFunctions, isBrowserControlTool, isExtractionTool } from '../../utils/tools';
import { mcpManager, mcpToolToOpenAITool, parseMcpToolName, isMcpTool, type McpTool } from '../../utils/mcp';
import { getEnabledMcpServers, watchMcpServers } from '../../utils/mcpStorage';
import { getAllSkills, getSkillByName, getSkillsAsTools, getSkillFileAsText, type Skill } from '../../utils/skills';
import { executeScript, setScriptConfirmCallback, validateScript, type ScriptConfirmationRequest } from '../../utils/skillsExecutor';

// ============================================================
// State
// ============================================================

const messages = shallowRef<ChatMessage[]>([]);
const inputText = ref('');
const isLoading = ref(false);
const showHistory = ref(false);
const chatAreaRef = ref<HTMLElement | null>(null);
const pendingImages = ref<ChatImage[]>([]);
const pendingFiles = ref<ChatFileAttachment[]>([]);
const isImageDragActive = ref(false);
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
const showModelSelector = ref(false);

// Theme state
const currentThemeMode = ref<ThemeMode>('system');

// Language state
const currentLanguage = ref<Language>('en');

// Thinking/reasoning expanded state
const reasoningExpanded = ref<Record<number, boolean>>({});

// Copied message feedback
const copiedMessageIndex = ref<number | null>(null);

// Textarea
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isInputComposing = ref(false);

// Image limits
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// File limits
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS = 5;

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

// Browser automation state
const browserAutomationActive = ref(false);
const browserAutomationTabId = ref<number | null>(null);
const browserAutomationTabTitle = ref('');
const toolExecutionStatus = ref<string | null>(null);
const sharePageContentEnabled = ref(false);
const sharePageContentTitle = ref('');
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

const allModelOptions = computed(() => {
  const options: { providerId: string; providerName: string; model: string }[] = [];
  for (const p of providers.value) {
    const models = Array.isArray(p.models) ? p.models : [];
    for (const m of models) {
      options.push({
        providerId: p.id,
        providerName: p.name,
        model: m,
      });
    }
  }
  return options;
});

const hasPendingImages = computed(() => pendingImages.value.length > 0);
const hasPendingFiles = computed(() => pendingFiles.value.length > 0);
const totalPendingAttachments = computed(() => pendingImages.value.length + pendingFiles.value.length);
const canSendMessage = computed(() => {
  return !isLoading.value && (inputText.value.trim().length > 0 || hasPendingImages.value || hasPendingFiles.value);
});

// ============================================================
// Helpers
// ============================================================

function getFileIcon(format: string): string {
  switch (format) {
    case 'pdf': return '\u{1F4D1}';
    case 'docx': return '\u{1F4C4}';
    case 'csv': return '\u{1F4CA}';
    case 'md': return '\u{1F4DD}';
    case 'txt': return '\u{1F4C3}';
    default: return '\u{1F4CE}';
  }
}

/**
 * Get display content for user messages.
 * Strips file context blocks that were injected for the AI.
 */
function getUserMessageDisplayContent(message: ChatMessage): string {
  if (!message.content) return '';
  // If there are file attachments, the content has file context injected.
  // Show just the original user text before the "---" separator.
  if (message.fileAttachments && message.fileAttachments.length > 0) {
    const separatorIndex = message.content.indexOf('\n\n---\n\n');
    if (separatorIndex !== -1) {
      return message.content.substring(0, separatorIndex).trim();
    }
  }
  return message.content;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const locale = currentLanguage.value === 'zh-CN' ? 'zh-CN' : 'en-US';

  if (isToday) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSessionDate(timestamp: number): string {
  const date = new Date(timestamp);
  const locale = currentLanguage.value === 'zh-CN' ? 'zh-CN' : 'en-US';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toggleReasoning(idx: number) {
  reasoningExpanded.value[idx] = !reasoningExpanded.value[idx];
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatAreaRef.value) {
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
  if (event.key === 'Escape' && fullscreenCodeBlock.value) {
    closeFullscreenCodeBlock();
  }
}

// ============================================================
// Image & File handling
// ============================================================

const imageInputRef = ref<HTMLInputElement | null>(null);

function removePendingImage(imageId: string): void {
  pendingImages.value = pendingImages.value.filter((image) => image.id !== imageId);
}

function removePendingFile(fileId: string): void {
  pendingFiles.value = pendingFiles.value.filter((f) => f.id !== fileId);
}

function openImagePicker(): void {
  imageInputRef.value?.click();
}

function openFilePicker(): void {
  imageInputRef.value?.click();
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

  const availableSlots = Math.max(0, MAX_TOTAL_ATTACHMENTS - totalPendingAttachments.value);
  if (availableSlots <= 0) return;

  const filesToProcess = imageFiles.slice(0, availableSlots);
  for (const file of filesToProcess) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) continue;

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

  const availableSlots = Math.max(0, MAX_TOTAL_ATTACHMENTS - totalPendingAttachments.value);
  if (availableSlots <= 0) return;

  const filesToProcess = docFiles.slice(0, availableSlots);
  for (const file of filesToProcess) {
    if (file.size > MAX_FILE_SIZE_BYTES) continue;

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

function handleInputBoxDragEnter(event: DragEvent): void {
  if (event.dataTransfer?.types.includes('Files')) {
    isImageDragActive.value = true;
  }
}

function handleInputBoxDragOver(event: DragEvent): void {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  isImageDragActive.value = true;
}

function handleInputBoxDragLeave(event: DragEvent): void {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
  isImageDragActive.value = false;
}

async function handleInputBoxDrop(event: DragEvent): Promise<void> {
  isImageDragActive.value = false;
  if (!event.dataTransfer?.files?.length) return;

  const files = Array.from(event.dataTransfer.files);
  const imageFiles = files.filter(isSupportedImageFile);
  const docFiles = files.filter(isSupportedDocumentFile);

  if (imageFiles.length > 0 && activeModelSupportsVision.value) {
    await addPendingImageFiles(imageFiles);
  }
  if (docFiles.length > 0) {
    await addPendingDocumentFiles(docFiles);
  }
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

// ============================================================
// Textarea auto-resize
// ============================================================

function handleCompositionStart() {
  isInputComposing.value = true;
}

function handleCompositionEnd() {
  isInputComposing.value = false;
}

function autoResizeTextarea() {
  const textarea = textareaRef.value;
  if (!textarea) return;

  textarea.style.height = 'auto';
  const lineHeight = 22;
  const maxLines = 6;
  const maxHeight = lineHeight * maxLines;
  const paddingY = 24;

  const newHeight = Math.min(textarea.scrollHeight, maxHeight + paddingY);
  textarea.style.height = `${newHeight}px`;
}

watch(inputText, () => {
  nextTick(autoResizeTextarea);
});

// ============================================================
// Browser automation & tool execution
// ============================================================

async function getActiveTab(): Promise<{ id?: number; url?: string; title?: string; windowId?: number } | null> {
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
    // Browser control tools (require CDP)
    if (isBrowserControlTool(name) && name !== 'browser_take_screenshot') {
      // Auto-start automation if not active
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

      // Check if the result contains a screenshot data URL
      if (typeof resultText === 'string' && resultText.startsWith('[SCREENSHOT:')) {
        const dataUrl = resultText.substring('[SCREENSHOT:'.length, resultText.length - 1);
        return { tool_call_id: toolCall.id, name, result: 'Screenshot captured successfully. The screenshot has been provided as an image.', success: true };
      }

      return { tool_call_id: toolCall.id, name, result: resultText, success: !resultText.startsWith('Error') };
    }

    // Screenshot tool
    if (name === 'browser_take_screenshot') {
      toolExecutionStatus.value = 'Taking screenshot...';
      const response = await browser.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
      toolExecutionStatus.value = null;

      if (response?.dataUrl) {
        return { tool_call_id: toolCall.id, name, result: 'Screenshot captured. [SCREENSHOT_DATA_AVAILABLE]', success: true };
      }
      return { tool_call_id: toolCall.id, name, result: response?.error || 'Failed to take screenshot', success: false };
    }

    // Page content extraction
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

    // YouTube transcript extraction
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

    // MCP tool calls
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

    // Skill tool calls
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
  } else {
    const tab = await getActiveTab();
    if (tab) {
      sharePageContentTitle.value = tab.title || '';
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

  // Build the content string: include file text as context
  let messageContent = text;
  if (messageFiles.length > 0) {
    const fileContexts = messageFiles.map((f) => `[File: ${f.name}]\n${f.text}`).join('\n\n');
    if (messageContent) {
      messageContent = `${messageContent}\n\n---\n\n${fileContexts}`;
    } else {
      messageContent = fileContexts;
    }
  }

  // Inject page content if share is enabled
  if (sharePageContentEnabled.value) {
    const pageContent = await extractCurrentPageContent();
    if (pageContent) {
      messageContent = `[Shared Page Content]\n${pageContent}\n\n---\n\n${messageContent}`;
    }
  }

  const userMessage: ChatMessage = {
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
  isImageDragActive.value = false;
  scrollToBottom();

  if (messages.value.length === 1) {
    currentSession.value.title = await generateSessionTitle(text || (hasImages ? 'Image' : (hasFiles ? 'File' : 'Chat')));
  }

  // Prepare tools for the AI (browser control + extraction + MCP + skills)
  const openaiTools = getToolsAsOpenAIFunctions() as any;

  // Add MCP tools
  for (const mcpTool of mcpTools.value) {
    openaiTools.push(mcpToolToOpenAITool(mcpTool));
  }

  // Add skill tools
  const skillTools = getSkillsAsTools(loadedSkills.value);
  openaiTools.push(...skillTools);

  let assistantMessage: ChatMessage | null = null;
  try {
    assistantMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    messages.value.push(assistantMessage);
    triggerRef(messages);
    scrollToBottom();

    for await (const event of streamChat(provider, messages.value.slice(0, -1), {
      abortSignal: chatAbortController.value.signal,
      tools: openaiTools,
      toolExecutor: executeToolCall,
      maxToolIterations: 10,
    })) {
      switch (event.type) {
        case 'reasoning':
          if (!assistantMessage.reasoning) assistantMessage.reasoning = '';
          assistantMessage.reasoning += event.content;
          triggerRef(messages);
          break;
        case 'content':
          assistantMessage.content += event.content;
          triggerRef(messages);
          scrollToBottom();
          break;
        case 'thinking':
          // Could show thinking indicator
          break;
        case 'tool_call':
          // Show tool execution in chat
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
            scrollToBottom();
          }
          break;
        case 'tool_result':
          // Tool results handled internally by ReAct loop
          break;
        case 'done':
          assistantMessage.content = assistantMessage.content.trim();
          if (assistantMessage.reasoning) {
            assistantMessage.reasoning = assistantMessage.reasoning.trim();
          }
          break;
      }
    }

    assistantMessage.timestamp = Date.now();
  } catch (error: any) {
    const isUserAborted = error instanceof ApiError && error.code === 'USER_ABORTED';
    if (isUserAborted) {
      if (assistantMessage && !assistantMessage.content.trim() && !(assistantMessage.reasoning || '').trim()) {
        const lastMessage = messages.value[messages.value.length - 1];
        if (lastMessage === assistantMessage) {
          messages.value.pop();
          triggerRef(messages);
        }
      }
    } else {
      messages.value.push({
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      });
      triggerRef(messages);
    }
  } finally {
    chatAbortController.value = null;
    isLoading.value = false;
    toolExecutionStatus.value = null;
    await saveCurrentSession();
    scrollToBottom();
  }
}

function terminateCurrentGeneration(): void {
  if (!chatAbortController.value) return;
  chatAbortController.value.abort();
  isLoading.value = false;
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

const sessionListRef = ref<HTMLElement | null>(null);

function handleSessionListScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
    loadMoreSessions();
  }
}

async function newChat() {
  currentSession.value = null;
  messages.value = [];
  setLastApiMessages([]);
  pendingImages.value = [];
  pendingFiles.value = [];
  isImageDragActive.value = false;
  showHistory.value = false;
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
  scrollToBottom();
}

async function removeSession(id: string, e: Event) {
  e.stopPropagation();
  if (confirm(i18n(currentLanguage.value, 'history.deleteConfirm'))) {
    await deleteSession(id);
    sessions.value = await getAllSessions();
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

async function handleImportSession(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const { readImportFile, validateImportData, importSessions } = await import('../../utils/chatImportExport');
    const data = await readImportFile(file);
    const validation = validateImportData(data);
    if (!validation.valid) {
      alert(`${i18n(currentLanguage.value, 'data.invalidFile')}: ${validation.errors.join(', ')}`);
      return;
    }
    const count = await importSessions(data, 'merge');
    alert(i18n(currentLanguage.value, 'data.importSuccess', { count }));
    await loadInitialSessions();
  } catch (error) {
    alert(i18n(currentLanguage.value, 'data.importFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
  } finally {
    input.value = '';
  }
}

// ============================================================
// Model selector
// ============================================================

async function selectProviderModel(providerId: string, model: string) {
  const freshProvider = await getActiveProvider();
  if (!freshProvider) return;

  // Update via storage
  const allProviders = await getAllProviders();
  const target = allProviders.find((p) => p.id === providerId);
  if (!target) return;

  if (target.selectedModel !== model) {
    target.selectedModel = model;
    await saveProvider(target);
  }

  await setActiveProviderId(providerId);
  activeProviderId.value = providerId;
  showModelSelector.value = false;
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
// Selection quote in sidepanel
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
  hideSelectionQuotePopup();
  window.getSelection()?.removeAllRanges();
  nextTick(() => {
    textareaRef.value?.focus();
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
// Key handlers
// ============================================================

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !isInputComposing.value && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
}

// ============================================================
// Content script message handler
// ============================================================

let contentMessageHandler: ((message: any) => void) | null = null;

function handleContentMessage(message: any): void {
  if (!message?.type) return;

  switch (message.type) {
    case 'CONTENT_IMAGE_TO_CHAT': {
      // Image sent from content script (screenshot capture)
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
  }
}

async function handleContentImageMessage(imageUrl: string, prompt: string): Promise<void> {
  isLoading.value = true;
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

  const userMessage: ChatMessage = {
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

  let assistantMessage: ChatMessage | null = null;
  try {
    assistantMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    messages.value.push(assistantMessage);
    triggerRef(messages);
    scrollToBottom();

    for await (const event of streamChat(provider, messages.value.slice(0, -1), {
      abortSignal: chatAbortController.value.signal,
      tools: openaiTools,
      toolExecutor: executeToolCall,
      maxToolIterations: 10,
    })) {
      switch (event.type) {
        case 'reasoning':
          if (!assistantMessage.reasoning) assistantMessage.reasoning = '';
          assistantMessage.reasoning += event.content;
          triggerRef(messages);
          break;
        case 'content':
          assistantMessage.content += event.content;
          triggerRef(messages);
          scrollToBottom();
          break;
        case 'tool_call':
          if (event.toolCall) {
            const toolName = event.toolCall.name.replace('browser_', '').replace(/_/g, ' ');
            assistantMessage.content += `\n> **Tool: ${toolName}**\n\n`;
            triggerRef(messages);
            scrollToBottom();
          }
          break;
        case 'done':
          assistantMessage.content = assistantMessage.content.trim();
          if (assistantMessage.reasoning) {
            assistantMessage.reasoning = assistantMessage.reasoning.trim();
          }
          break;
      }
    }

    assistantMessage.timestamp = Date.now();
  } catch (error: any) {
    const isUserAborted = error instanceof ApiError && error.code === 'USER_ABORTED';
    if (isUserAborted) {
      if (assistantMessage && !assistantMessage.content.trim() && !(assistantMessage.reasoning || '').trim()) {
        const lastMessage = messages.value[messages.value.length - 1];
        if (lastMessage === assistantMessage) {
          messages.value.pop();
          triggerRef(messages);
        }
      }
    } else {
      messages.value.push({
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      });
      triggerRef(messages);
    }
  } finally {
    chatAbortController.value = null;
    isLoading.value = false;
    toolExecutionStatus.value = null;
    await saveCurrentSession();
    scrollToBottom();
  }
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(async () => {
  // Load providers
  providers.value = await getAllProviders();
  const active = await getActiveProvider();
  activeProviderId.value = active?.id || null;

  // Load theme
  currentThemeMode.value = await getThemeMode();
  applyTheme(currentThemeMode.value);

  // Load language
  currentLanguage.value = await getLanguage();

  // Load selection quote setting
  selectionQuoteEnabled.value = await getSelectionQuoteEnabled();

  // Watch system theme
  systemThemeMediaQuery.value = window.matchMedia('(prefers-color-scheme: dark)');
  systemThemeMediaQuery.value.addEventListener('change', handleSystemThemeChange);

  // Watch storage changes
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

  // Event listeners
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

  // Listen for messages from content script (forwarded via background)
  contentMessageHandler = (message: any) => {
    handleContentMessage(message);
  };
  browser.runtime.onMessage.addListener(contentMessageHandler);

  // Initialize MCP connections
  await connectEnabledMcpServers();

  // Watch MCP server config changes and reconnect
  unwatchMcpServers.value = watchMcpServers(async () => {
    await connectEnabledMcpServers();
  });

  // Initialize skills
  loadedSkills.value = await getAllSkills();

  // Set script confirmation callback
  setScriptConfirmCallback(handleScriptConfirmation);
});

onUnmounted(() => {
  chatAbortController.value?.abort();
  unwatchProviders.value?.();
  unwatchActiveProviderId.value?.();
  unwatchLanguage.value?.();
  unwatchThemeMode.value?.();
  unwatchSelectionQuoteEnabled.value?.();
  unwatchMcpServers.value?.();
  systemThemeMediaQuery.value?.removeEventListener('change', handleSystemThemeChange);
  mcpManager.disconnectAll().catch(() => {});
  if (markdownActionClickHandler) document.removeEventListener('click', markdownActionClickHandler);
  if (globalKeydownHandler) document.removeEventListener('keydown', globalKeydownHandler);
  document.removeEventListener('mouseup', handleSidepanelSelectionMouseup);
  document.removeEventListener('mousedown', handleSidepanelSelectionMousedown);
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
        <button class="header-btn" @click="openHistory" :title="i18n(currentLanguage, 'header.history')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
      </div>

      <div class="header-center">
        <button class="model-selector-btn" @click="showModelSelector = !showModelSelector">
          <span class="model-name">{{ activeModelName }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      <div class="header-right">
        <button class="header-btn" @click="toggleTheme" :title="i18n(currentLanguage, 'header.toggleTheme')">
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
        <button class="header-btn" @click="newChat" :title="i18n(currentLanguage, 'header.newChat')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="header-btn" @click="openSettings" :title="i18n(currentLanguage, 'header.settings')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
      </div>

      <!-- Model selector dropdown -->
      <div v-if="showModelSelector" class="model-selector-dropdown" @click.stop>
        <div
          v-for="option in allModelOptions"
          :key="`${option.providerId}-${option.model}`"
          class="model-option"
          :class="{ active: activeProviderId === option.providerId && activeModelName === option.model }"
          @click="selectProviderModel(option.providerId, option.model)"
        >
          <span class="model-option-provider">{{ option.providerName }}</span>
          <span class="model-option-name">{{ option.model }}</span>
        </div>
        <div v-if="allModelOptions.length === 0" class="model-option-empty">
          {{ i18n(currentLanguage, 'model.noModels') }}
        </div>
      </div>
    </header>

    <!-- Chat area -->
    <div class="chat-area" ref="chatAreaRef">
      <!-- Empty state -->
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-state-logo">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h2 class="empty-state-title">Nexus</h2>
        <p class="empty-state-subtitle">{{ i18n(currentLanguage, 'empty.subtitle') }}</p>
      </div>

      <!-- Messages -->
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="message-wrapper"
        :class="[`message-${message.role}`]"
      >
        <!-- Thinking/reasoning block (collapsible) -->
        <div v-if="message.reasoning" class="reasoning-block">
          <button class="reasoning-toggle" @click="toggleReasoning(index)">
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              :style="{ transform: reasoningExpanded[index] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }"
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span>{{ i18n(currentLanguage, 'chat.thinking') }}</span>
          </button>
          <div v-if="reasoningExpanded[index]" class="reasoning-content">
            {{ message.reasoning }}
          </div>
        </div>

        <!-- Message bubble -->
        <div class="message-bubble" :class="[`bubble-${message.role}`]">
          <!-- Images -->
          <div v-if="message.images && message.images.length" class="message-images">
            <img
              v-for="image in message.images"
              :key="image.id"
              :src="image.dataUrl"
              :alt="image.name"
              class="message-image"
            />
          </div>

          <!-- File attachments -->
          <div v-if="message.fileAttachments && message.fileAttachments.length" class="message-files">
            <div v-for="file in message.fileAttachments" :key="file.id" class="message-file-chip">
              <span class="message-file-icon">{{ getFileIcon(file.format) }}</span>
              <span class="message-file-name">{{ file.name }}</span>
            </div>
          </div>

          <!-- Quote -->
          <div v-if="message.quote" class="message-quote">
            {{ message.quote }}
          </div>

          <!-- Content -->
          <div
            v-if="message.role === 'assistant'"
            class="message-content markdown-content"
            v-html="renderMarkdown(message.content || (isLoading && index === messages.length - 1 ? '' : ''))"
          ></div>
          <div v-else class="message-content">
            {{ getUserMessageDisplayContent(message) }}
          </div>

          <!-- Typing indicator -->
          <div v-if="isLoading && index === messages.length - 1 && message.role === 'assistant' && !message.content" class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>

        <!-- Copy button for assistant messages -->
        <button
          v-if="message.role === 'assistant' && message.content"
          class="copy-btn"
          :class="{ copied: copiedMessageIndex === index }"
          @click="copyMessage(index)"
          :title="i18n(currentLanguage, 'chat.copy')"
        >
          <svg v-if="copiedMessageIndex !== index" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>

        <!-- Timestamp -->
        <span class="message-time">{{ formatTime(message.timestamp) }}</span>
      </div>
    </div>

    <!-- Browser automation status -->
    <div v-if="browserAutomationActive || toolExecutionStatus" class="automation-status-bar">
      <div class="automation-status-indicator"></div>
      <span v-if="toolExecutionStatus" class="automation-status-text">{{ toolExecutionStatus }}</span>
      <span v-else class="automation-status-text">{{ i18n(currentLanguage, 'browser.activeTab', { title: browserAutomationTabTitle }) }}</span>
      <button v-if="browserAutomationActive" class="automation-status-stop" @click="endBrowserAutomation">{{ i18n(currentLanguage, 'browser.end') }}</button>
    </div>

    <!-- Input area -->
    <div class="input-area" :class="{ 'drag-active': isImageDragActive }">
      <!-- Pending attachments -->
      <div v-if="hasPendingImages || hasPendingFiles" class="pending-attachments">
        <!-- Pending images -->
        <div v-for="image in pendingImages" :key="image.id" class="pending-image-chip">
          <img :src="image.dataUrl" :alt="image.name" class="pending-image-thumb" />
          <button class="pending-image-remove" @click="removePendingImage(image.id)">&times;</button>
        </div>
        <!-- Pending file attachments -->
        <div v-for="file in pendingFiles" :key="file.id" class="pending-file-chip">
          <span class="pending-file-icon">{{ getFileIcon(file.format) }}</span>
          <span class="pending-file-name">{{ file.name }}</span>
          <button class="pending-file-remove" @click="removePendingFile(file.id)">&times;</button>
        </div>
      </div>

      <!-- Share page content toggle -->
      <div class="share-page-row">
        <button
          class="share-page-btn"
          :class="{ active: sharePageContentEnabled }"
          @click="toggleSharePageContent"
          :disabled="sharePageContentLoading"
          :title="i18n(currentLanguage, 'sharePage.clickToShare')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          <span>{{ sharePageContentEnabled ? i18n(currentLanguage, 'sharePage.shared', { title: sharePageContentTitle }) : i18n(currentLanguage, 'sharePage.share') }}</span>
        </button>
      </div>

      <!-- Input row -->
      <div class="input-row">
        <input
          type="file"
          ref="imageInputRef"
          accept="image/*,.pdf,.docx,.csv,.txt,.md"
          multiple
          style="display: none"
          @change="handleFileInputChange"
        />

        <button
          class="input-action-btn"
          @click="openFilePicker"
          :title="i18n(currentLanguage, 'input.attachFile')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>

        <textarea
          ref="textareaRef"
          v-model="inputText"
          class="input-textarea"
          :placeholder="activeProvider ? i18n(currentLanguage, 'input.placeholder') : i18n(currentLanguage, 'input.placeholderNoProvider')"
          rows="1"
          @keydown="handleKeydown"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
          @paste="handleInputPaste"
          @dragenter="handleInputBoxDragEnter"
          @dragover="handleInputBoxDragOver"
          @dragleave="handleInputBoxDragLeave"
          @drop="handleInputBoxDrop"
        ></textarea>

        <button
          v-if="isLoading"
          class="send-btn stop-btn"
          @click="terminateCurrentGeneration"
          :title="i18n(currentLanguage, 'chat.stopGenerating')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>
        <button
          v-else
          class="send-btn"
          :class="{ active: canSendMessage }"
          :disabled="!canSendMessage"
          @click="sendMessage"
          :title="i18n(currentLanguage, 'chat.send')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- History panel -->
    <div v-if="showHistory" class="history-overlay" @click="showHistory = false">
      <div class="history-panel" @click.stop>
        <div class="history-header">
          <h3>{{ i18n(currentLanguage, 'history.title') }}</h3>
          <button class="header-btn" @click="showHistory = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="history-list" ref="sessionListRef" @scroll="handleSessionListScroll">
          <button
            v-for="session in sessions"
            :key="session.id"
            class="history-item"
            :class="{ active: currentSession?.id === session.id }"
            @click="loadSession(session)"
          >
            <div class="history-item-info">
              <span class="history-item-title">{{ session.title }}</span>
              <span class="history-item-date">{{ formatSessionDate(session.updatedAt) }}</span>
            </div>
            <button class="history-item-delete" @click="(e) => removeSession(session.id, e)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </button>
          <div v-if="sessions.length === 0" class="history-empty">
            {{ i18n(currentLanguage, 'history.noChats') }}
          </div>
          <div v-if="sessionsLoading" class="history-loading">{{ i18n(currentLanguage, 'history.loading') }}</div>
        </div>
        <button class="history-new-btn" @click="newChat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ i18n(currentLanguage, 'history.newChat') }}
        </button>
        <div class="history-actions-row">
          <button class="history-action-btn" @click="handleExportCurrentSession" :disabled="!currentSession">{{ i18n(currentLanguage, 'history.export') }}</button>
          <label class="history-action-btn">
            {{ i18n(currentLanguage, 'history.import') }}
            <input type="file" accept=".json" style="display: none" @change="handleImportSession" />
          </label>
        </div>
      </div>
    </div>

    <!-- Selection quote popup -->
    <div
      v-if="selectionQuotePopup.visible"
      class="selection-quote-popup"
      :style="{ left: selectionQuotePopup.x + 'px', top: selectionQuotePopup.y + 'px' }"
    >
      <button @click="useSidepanelSelectionQuote">{{ i18n(currentLanguage, 'selectionQuote.quote') }}</button>
    </div>

    <!-- Fullscreen code modal -->
    <div v-if="fullscreenCodeBlock" class="code-fullscreen-overlay" @click="closeFullscreenCodeBlock">
      <div class="code-fullscreen-container" @click.stop>
        <div class="code-fullscreen-header">
          <span>{{ fullscreenCodeBlock.language || i18n(currentLanguage, 'chat.code') }}</span>
          <div class="code-fullscreen-actions">
            <button class="header-btn" @click="copyFullscreenCodeBlock" :title="i18n(currentLanguage, 'chat.copy')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
            <button class="header-btn" @click="closeFullscreenCodeBlock" :title="i18n(currentLanguage, 'code.close')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="code-fullscreen-body">
          <pre>{{ fullscreenCodeBlock.code }}</pre>
        </div>
      </div>
    </div>

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
  justify-content: center;
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
}

.model-selector-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  max-width: 200px;
}

.model-selector-btn:hover {
  background: var(--color-bg-secondary);
}

.model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-selector-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  min-width: 280px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  padding: var(--spacing-xs) 0;
}

.model-option {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.model-option:hover {
  background: var(--color-bg-secondary);
}

.model-option.active {
  background: var(--color-bg-secondary);
}

.model-option-provider {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.model-option-name {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: 500;
}

.model-option-empty {
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* Chat area */
.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
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

/* Messages */
.message-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  position: relative;
}

.message-wrapper:hover .message-time {
  opacity: 1;
}

.message-wrapper:hover .copy-btn {
  opacity: 1;
}

.message-user {
  align-items: flex-end;
}

.message-assistant {
  align-items: flex-start;
}

.message-bubble {
  max-width: 85%;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-md);
  line-height: var(--line-height-normal);
  word-wrap: break-word;
}

.bubble-user {
  background: var(--color-bg-user-bubble);
  color: var(--color-text-user-bubble);
  border-bottom-right-radius: var(--radius-xs);
}

.bubble-assistant {
  background: var(--color-bg-assistant-bubble);
  color: var(--color-text-primary);
  border-bottom-left-radius: var(--radius-xs);
}

/* Reasoning block */
.reasoning-block {
  max-width: 85%;
  margin-bottom: var(--spacing-xs);
}

.reasoning-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.reasoning-toggle:hover {
  background: var(--color-bg-secondary);
}

.reasoning-content {
  margin-top: var(--spacing-xs);
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: var(--line-height-normal);
  white-space: pre-wrap;
}

/* Message images */
.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.message-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

/* Message file attachments */
.message-files {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.message-file-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.bubble-assistant .message-file-chip {
  background: var(--color-bg-secondary);
}

.message-file-icon {
  font-size: 14px;
  line-height: 1;
}

.message-file-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Quote */
.message-quote {
  padding: var(--spacing-xs) var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  border-left: 3px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-style: italic;
}

.bubble-user .message-quote {
  border-left-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
}

/* Message time */
.message-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  opacity: 0;
  transition: opacity var(--transition-fast);
  padding: 0 var(--spacing-xs);
}

/* Copy button */
.copy-btn {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}

.copy-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.copy-btn.copied {
  color: var(--color-success);
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: var(--spacing-xs) 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-secondary);
  animation: typing-bounce 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: 0s; }
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Input area */
.input-area {
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-primary);
}

.input-area.drag-active {
  background: var(--color-bg-secondary);
  border-color: var(--color-accent);
}

.pending-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.pending-image-chip {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.pending-image-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pending-image-remove {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  border: none;
  background: var(--color-error);
  color: white;
  border-radius: 50%;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.pending-file-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  max-width: 180px;
}

.pending-file-icon {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.pending-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-primary);
}

.pending-file-remove {
  width: 16px;
  height: 16px;
  border: none;
  background: var(--color-error);
  color: white;
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  flex-shrink: 0;
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-sm);
}

.input-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.input-action-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.input-textarea {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-md);
  resize: none;
  outline: none;
  min-height: 36px;
  max-height: 156px;
  line-height: 22px;
  transition: border-color var(--transition-fast);
}

.input-textarea:focus {
  border-color: var(--color-accent);
}

.input-textarea::placeholder {
  color: var(--color-text-secondary);
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: default;
  border-radius: 50%;
  transition: all var(--transition-normal);
  flex-shrink: 0;
}

.send-btn.active {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  cursor: pointer;
}

.send-btn.active:hover {
  background: var(--color-accent-hover);
}

.stop-btn {
  background: var(--color-error);
  color: white;
  cursor: pointer;
}

.stop-btn:hover {
  opacity: 0.9;
}

/* History overlay */
.history-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: var(--blur-frost);
  z-index: 50;
  display: flex;
  justify-content: flex-start;
}

.history-panel {
  width: 300px;
  max-width: 85%;
  height: 100%;
  background: var(--color-bg-primary);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.history-header h3 {
  font-size: var(--font-size-md);
  font-weight: 600;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xs);
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
  text-align: left;
}

.history-item:hover {
  background: var(--color-bg-secondary);
}

.history-item.active {
  background: var(--color-bg-secondary);
}

.history-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.history-item-title {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-date {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.history-item-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.history-item:hover .history-item-delete {
  opacity: 1;
}

.history-item-delete:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-error);
}

.history-empty {
  padding: var(--spacing-lg);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.history-loading {
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.history-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  margin: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.history-new-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-color: var(--color-accent);
}

.history-actions-row {
  display: flex;
  gap: var(--spacing-xs);
  padding: 0 var(--spacing-sm) var(--spacing-sm);
}

.history-action-btn {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  text-align: center;
}

.history-action-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.history-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
  color: white;
}

/* Share page content toggle */
.share-page-row {
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.share-page-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  border-radius: var(--radius-full);
  transition: all var(--transition-fast);
  max-width: 100%;
}

.share-page-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.share-page-btn.active {
  background: rgba(0, 122, 255, 0.1);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.share-page-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Confirmation dialog */
.confirmation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: var(--blur-frost);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirmation-dialog {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-lg);
  max-width: 360px;
  width: 90%;
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
</style>
