<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ChatImage, ChatFileAttachment } from '../utils/providers/types';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';
import { parseFile, detectFormat } from '../utils/fileParser';

const props = defineProps<{
  language: Language;
  supportsVision: boolean;
  isLoading: boolean;
  hasActiveProvider: boolean;
  pendingImages: ChatImage[];
  pendingFiles: ChatFileAttachment[];
  sharePageEnabled: boolean;
  sharePageTitle: string;
  sharePageLoading: boolean;
}>();

const emit = defineEmits<{
  (e: 'send'): void;
  (e: 'stop'): void;
  (e: 'update:text', value: string): void;
  (e: 'remove-image', id: string): void;
  (e: 'remove-file', id: string): void;
  (e: 'add-images', files: File[]): void;
  (e: 'add-files', files: File[]): void;
  (e: 'toggle-share-page'): void;
  (e: 'open-file-picker'): void;
  (e: 'paste', event: ClipboardEvent): void;
  (e: 'keydown', event: KeyboardEvent): void;
  (e: 'composition-start'): void;
  (e: 'composition-end'): void;
  (e: 'drag-enter', event: DragEvent): void;
  (e: 'drag-over', event: DragEvent): void;
  (e: 'drag-leave', event: DragEvent): void;
  (e: 'drop', event: DragEvent): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isInputComposing = ref(false);
const isImageDragActive = ref(false);
const text = ref('');

watch(text, () => {
  nextTick(autoResizeTextarea);
});

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

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !isInputComposing.value && !e.isComposing) {
    e.preventDefault();
    emit('send');
  }
  emit('keydown', e);
}

function handleCompositionStart() {
  isInputComposing.value = true;
  emit('composition-start');
}

function handleCompositionEnd() {
  isInputComposing.value = false;
  emit('composition-end');
}

function handleDragEnter(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) {
    isImageDragActive.value = true;
  }
  emit('drag-enter', event);
}

function handleDragOver(event: DragEvent) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  isImageDragActive.value = true;
  emit('drag-over', event);
}

function handleDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) return;
  isImageDragActive.value = false;
  emit('drag-leave', event);
}

function handleDrop(event: DragEvent) {
  isImageDragActive.value = false;
  emit('drop', event);
}

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

const totalPendingAttachments = ref(0);
watch([() => props.pendingImages, () => props.pendingFiles], ([images, files]) => {
  totalPendingAttachments.value = images.length + files.length;
}, { immediate: true });

const canSendMessage = ref(false);
watch([text, () => props.pendingImages, () => props.pendingFiles, () => props.isLoading], ([t, imgs, files, loading]) => {
  canSendMessage.value = !loading && (t.trim().length > 0 || imgs.length > 0 || files.length > 0);
}, { immediate: true });

watch(text, (val) => {
  emit('update:text', val);
});

defineExpose({ textareaRef, text, focus: () => textareaRef.value?.focus() });
</script>

<template>
  <div class="input-area" :class="{ 'drag-active': isImageDragActive }">
    <!-- Pending attachments -->
    <div v-if="pendingImages.length > 0 || pendingFiles.length > 0" class="pending-attachments">
      <!-- Pending images -->
      <div v-for="image in pendingImages" :key="image.id" class="pending-image-chip">
        <img :src="image.dataUrl" :alt="image.name" class="pending-image-thumb" />
        <button class="pending-image-remove" @click="emit('remove-image', image.id)">&times;</button>
      </div>
      <!-- Pending file attachments -->
      <div v-for="file in pendingFiles" :key="file.id" class="pending-file-chip">
        <span class="pending-file-icon">{{ getFileIcon(file.format) }}</span>
        <span class="pending-file-name">{{ file.name }}</span>
        <button class="pending-file-remove" @click="emit('remove-file', file.id)">&times;</button>
      </div>
    </div>

    <!-- Share page content toggle -->
    <div class="share-page-row">
      <button
        class="share-page-btn"
        :class="{ active: sharePageEnabled }"
        @click="emit('toggle-share-page')"
        :disabled="sharePageLoading"
        :title="i18n(language, 'sharePage.clickToShare')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
        </svg>
        <span>{{ sharePageEnabled ? i18n(language, 'sharePage.shared', { title: sharePageTitle }) : i18n(language, 'sharePage.share') }}</span>
      </button>
    </div>

    <!-- Input row -->
    <div class="input-row">
      <button
        class="input-action-btn"
        @click="emit('open-file-picker')"
        :title="i18n(language, 'input.attachFile')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>

      <textarea
        ref="textareaRef"
        v-model="text"
        class="input-textarea"
        :placeholder="hasActiveProvider ? i18n(language, 'input.placeholder') : i18n(language, 'input.placeholderNoProvider')"
        rows="1"
        @keydown="handleKeydown"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        @paste="emit('paste', $event)"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      ></textarea>

      <button
        v-if="isLoading"
        class="send-btn stop-btn"
        @click="emit('stop')"
        :title="i18n(language, 'chat.stopGenerating')"
        :aria-label="i18n(language, 'chat.stopGenerating')"
      >
        <div class="stop-btn-pulse"></div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
      </button>
      <button
        v-else
        class="send-btn"
        :class="{ active: canSendMessage }"
        :disabled="!canSendMessage"
        @click="emit('send')"
        :title="i18n(language, 'chat.send')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.input-area {
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  transition: background var(--transition-fast), border-color var(--transition-fast);
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

.input-action-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
  position: relative;
}

.send-btn.active {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  cursor: pointer;
}

.send-btn.active:hover {
  background: var(--color-accent-hover);
  transform: scale(1.05);
}

.send-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.stop-btn {
  background: var(--color-error);
  color: white;
  cursor: pointer;
}

.stop-btn:hover {
  opacity: 0.9;
}

/* Stop button pulse */
.stop-btn-pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--color-error);
  animation: stop-pulse 1.5s ease-in-out infinite;
  z-index: -1;
}

@keyframes stop-pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.3); opacity: 0; }
}
</style>
