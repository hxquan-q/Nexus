<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useChatContext } from '../../composables/useChatContext';
import { renderMarkdown, decodeData, initChartRendering } from '../../utils/markdown';
import { t as i18n } from '../../utils/i18n';
import { parseFile, detectFormat } from '../../utils/fileParser';
import ChatMessage from '../../components/ChatMessage.vue';
import ModelSelector from '../../components/ModelSelector.vue';
import MessageInput from '../../components/MessageInput.vue';
import CodeFullscreen from '../../components/CodeFullscreen.vue';

const {
  messages,
  inputText,
  isLoading,
  chatAreaRef,
  pendingImages,
  pendingFiles,
  currentSession,
  providers,
  activeProviderId,
  currentThemeMode,
  currentLanguage,
  reasoningExpanded,
  showScrollToBottom,
  toastMessage,
  isOffline,
  contextUsagePercent,
  contextTokenEstimate,
  contextTokenMax,
  activeProvider,
  activeModelName,
  activeModelSupportsVision,
  contextBarColor,
  showToast,
  writeTextToClipboard,
  handleScrollToBottom,
  checkUserScroll,
  selectProviderModel,
  sendMessage,
  terminateCurrentGeneration,
  copyMessage,
  deleteMessagePair,
  regenerateLastResponse,
  toggleTheme,
  initialize,
  cleanup,
  scrollToBottom,
} = useChatContext();

const fullscreenCodeBlock = ref<{ code: string; language: string } | null>(null);
const copiedMessageIndex = ref<number | null>(null);
const showReactionsEnabled = ref(true);

let markdownActionClickHandler: ((event: MouseEvent) => void) | null = null;

const modelSelectorRef = ref<InstanceType<typeof ModelSelector> | null>(null);
const messageInputRef = ref<InstanceType<typeof MessageInput> | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS = 5;

function openLightbox() {}

function removePendingImage(imageId: string) {
  pendingImages.value = pendingImages.value.filter((image) => image.id !== imageId);
}

function removePendingFile(fileId: string) {
  pendingFiles.value = pendingFiles.value.filter((f) => f.id !== fileId);
}

function openFilePicker() {
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
    if (copied) {
      const label = actionButton.querySelector<HTMLElement>('.markdown-code-btn-label');
      if (label) label.textContent = i18n(currentLanguage.value, 'chat.copied');
      actionButton.classList.add('copied');
      setTimeout(() => {
        if (label) label.textContent = i18n(currentLanguage.value, 'chat.copy');
        actionButton.classList.remove('copied');
      }, 1600);
    }
  } else if (action === 'expand-code') {
    openFullscreenCodeBlock(code, language);
  }
}

function closeWindow() {
  window.close();
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (fullscreenCodeBlock.value) {
      closeFullscreenCodeBlock();
    } else if (isLoading.value) {
      terminateCurrentGeneration();
    }
    return;
  }
}

onMounted(async () => {
  await initialize();
  markdownActionClickHandler = (event: MouseEvent) => {
    void handleMarkdownActionClick(event);
  };
  document.addEventListener('click', markdownActionClickHandler);
  document.addEventListener('keydown', handleGlobalKeydown);
  if (chatAreaRef.value) {
    chatAreaRef.value.addEventListener('scroll', checkUserScroll, { passive: true });
  }
});

onUnmounted(() => {
  cleanup();
  if (markdownActionClickHandler) {
    document.removeEventListener('click', markdownActionClickHandler);
  }
  document.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div class="window-chat">
    <!-- Header -->
    <header class="header">
      <div class="header-center">
        <ModelSelector
          ref="modelSelectorRef"
          :providers="providers"
          :active-provider-id="activeProviderId"
          :active-model-name="activeModelName"
          :language="currentLanguage"
          @select="selectProviderModel"
        />
      </div>
      <div class="header-right">
        <button class="header-btn" @click="toggleTheme" :title="i18n(currentLanguage, 'header.toggleTheme')">
          <svg v-if="currentThemeMode === 'light'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          </svg>
          <svg v-else-if="currentThemeMode === 'dark'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          </svg>
        </button>
        <button class="header-btn" @click="closeWindow" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Chat area -->
    <div class="chat-area" ref="chatAreaRef" role="log" aria-label="Chat messages" aria-live="polite">
      <!-- Empty state -->
      <div v-if="messages.length === 0" class="empty-state">
        <h2>Nexus</h2>
        <p v-if="!activeProvider">{{ i18n(currentLanguage, 'empty.noProvider') }}</p>
        <p v-else>{{ i18n(currentLanguage, 'empty.subtitle') }}</p>
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
        :is-editing="false"
        :editing-text="''"
        :copied="copiedMessageIndex === index"
        :reasoning-expanded="!!reasoningExpanded[index]"
        :show-reactions="showReactionsEnabled"
        @edit="() => {}"
        @cancel-edit="() => {}"
        @save-edit="() => {}"
        @copy="copyMessage"
        @delete="deleteMessagePair"
        @regenerate="regenerateLastResponse"
        @toggle-reasoning="(i) => reasoningExpanded[i] = !reasoningExpanded[i]"
        @open-lightbox="openLightbox"
        @copy-error="(rawError) => { writeTextToClipboard(rawError).then((ok) => { if (ok) showToast(i18n(currentLanguage, 'chat.copied')); }); }"
        @react="() => {}"
      />

      <!-- Scroll to bottom -->
      <button
        v-if="showScrollToBottom"
        class="scroll-to-bottom-btn"
        @click="handleScrollToBottom"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    </div>

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
      :share-page-enabled="false"
      :share-page-title="''"
      :share-page-loading="false"
      :preset-actions="[]"
      :is-chat-empty="messages.length === 0"
      :sound-enabled="false"
      @send="sendMessage"
      @stop="terminateCurrentGeneration"
      @update:text="inputText = $event"
      @remove-image="removePendingImage"
      @remove-file="removePendingFile"
      @toggle-share-page="() => {}"
      @open-file-picker="openFilePicker"
      @paste="handleInputPaste"
      @drop="handleInputDrop"
      @fill-input="() => {}"
    />

    <!-- Fullscreen code modal -->
    <CodeFullscreen
      v-if="fullscreenCodeBlock"
      :code="fullscreenCodeBlock.code"
      :language="fullscreenCodeBlock.language"
      :lang="currentLanguage"
      @close="closeFullscreenCodeBlock"
      @copy="copyFullscreenCodeBlock"
    />

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toastMessage" class="toast-notification">
        {{ toastMessage }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.window-chat {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: var(--color-bg-primary);
  position: relative;
}

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
  min-height: 44px;
}

.header-center {
  flex: 1;
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
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

.chat-area {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
}

.chat-area > :deep(.message-wrapper.message-assistant) {
  margin-bottom: var(--spacing-lg);
}

.chat-area > :deep(.message-wrapper.message-user) {
  margin-bottom: var(--spacing-xs);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  color: var(--color-text-secondary);
}

.empty-state h2 {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

.empty-state p {
  font-size: var(--font-size-md);
}

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
}

.toast-notification {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-size-sm);
  z-index: 300;
  max-width: 90%;
  text-align: center;
  pointer-events: none;
}

.toast-enter-active { animation: toast-in 200ms ease; }
.toast-leave-active { animation: toast-out 200ms ease; }

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes toast-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
