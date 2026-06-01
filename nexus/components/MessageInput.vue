<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import type { ChatImage, ChatFileAttachment } from '../utils/providers/types';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';
import { detectFormat } from '../utils/fileParser';

const props = defineProps<{
  language: Language;
  supportsVision: boolean;
  isLoading: boolean;
  hasActiveProvider: boolean;
  pendingImages: ChatImage[];
  pendingFiles: ChatFileAttachment[];
  sharePageEnabled: boolean;
  sharePageTitle: string;
  sharePageUrl: string;
  sharePageFavicon: string;
  sharePageLoading: boolean;
  presetActions: { id: string; name: string; content: string }[];
  isChatEmpty: boolean;
  soundEnabled: boolean;
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
  (e: 'open-image-picker'): void;
  (e: 'paste', event: ClipboardEvent): void;
  (e: 'keydown', event: KeyboardEvent): void;
  (e: 'composition-start'): void;
  (e: 'composition-end'): void;
  (e: 'drag-enter', event: DragEvent): void;
  (e: 'drag-over', event: DragEvent): void;
  (e: 'drag-leave', event: DragEvent): void;
  (e: 'drop', event: DragEvent): void;
  (e: 'fill-input', text: string): void;
  (e: 'action-summarize-page'): void;
  (e: 'action-analyze-image'): void;
  (e: 'action-help-write'): void;
  (e: 'action-ask-anything'): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const isInputComposing = ref(false);
const isImageDragActive = ref(false);
const isFocused = ref(false);
const text = ref('');
const expandedPresets = ref(false);

// Markdown formatting toolbar
type FormatAction = 'bold' | 'italic' | 'code' | 'codeblock' | 'link' | 'list';

function insertFormat(action: FormatAction): void {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = text.value.substring(start, end);
  const beforeText = text.value.substring(0, start);
  const afterText = text.value.substring(end);

  let insertBefore = '';
  let insertAfter = '';
  let cursorOffset = 0;

  switch (action) {
    case 'bold':
      insertBefore = '**';
      insertAfter = '**';
      cursorOffset = selectedText ? selectedText.length + 4 : 2;
      break;
    case 'italic':
      insertBefore = '*';
      insertAfter = '*';
      cursorOffset = selectedText ? selectedText.length + 2 : 1;
      break;
    case 'code':
      insertBefore = '`';
      insertAfter = '`';
      cursorOffset = selectedText ? selectedText.length + 2 : 1;
      break;
    case 'codeblock':
      insertBefore = '```\n';
      insertAfter = '\n```';
      cursorOffset = selectedText ? selectedText.length + 8 : 4;
      break;
    case 'link':
      if (selectedText) {
        insertBefore = '[';
        insertAfter = '](url)';
        cursorOffset = selectedText.length + 7;
      } else {
        insertBefore = '[';
        insertAfter = '](url)';
        cursorOffset = 1;
      }
      break;
    case 'list':
      if (selectedText) {
        const lines = selectedText.split('\n').map((line) => `- ${line}`).join('\n');
        text.value = beforeText + lines + afterText;
        nextTick(() => {
          textarea.selectionStart = start;
          textarea.selectionEnd = start + lines.length;
          textarea.focus();
        });
        return;
      } else {
        insertBefore = '- ';
        insertAfter = '';
        cursorOffset = 2;
      }
      break;
  }

  const newText = beforeText + insertBefore + selectedText + insertAfter + afterText;
  text.value = newText;

  nextTick(() => {
    if (selectedText) {
      textarea.selectionStart = start;
      textarea.selectionEnd = start + insertBefore.length + selectedText.length + insertAfter.length;
    } else {
      textarea.selectionStart = textarea.selectionEnd = start + cursorOffset;
    }
    textarea.focus();
  });
}

const showCharCount = computed(() => text.value.length > 500);
const charCount = computed(() => text.value.length);

const shortcutHint = computed(() => {
  if (text.value.length > 0 || isFocused.value) return '';
  return i18n(props.language, 'input.shortcutHint');
});

const visiblePresets = computed(() => {
  if (props.isChatEmpty || expandedPresets.value) {
    return props.presetActions;
  }
  return props.presetActions.slice(0, 3);
});

const showExpandButton = computed(() => {
  return !props.isChatEmpty && props.presetActions.length > 3 && !expandedPresets.value;
});

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

function getFileBadge(format: string): { label: string; color: string } {
  switch (format) {
    case 'pdf': return { label: 'PDF', color: '#ff3b30' };
    case 'docx': return { label: 'DOC', color: '#007aff' };
    case 'csv': return { label: 'CSV', color: '#34c759' };
    case 'md': return { label: 'MD', color: '#af52de' };
    case 'txt': return { label: 'TXT', color: '#8e8e93' };
    default: return { label: 'FILE', color: '#8e8e93' };
  }
}

function handlePresetClick(content: string) {
  emit('fill-input', content);
}

function handleExpandPresets() {
  expandedPresets.value = true;
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
    <!-- Drag overlay -->
    <Transition name="drop-zone">
      <div v-if="isImageDragActive" class="drop-zone-overlay">
        <div class="drop-zone-content">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.5">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
          <span class="drop-zone-text">{{ i18n(language, 'dropzone.title') }}</span>
        </div>
      </div>
    </Transition>

    <!-- Quick actions bar -->
    <div v-if="presetActions.length > 0 && hasActiveProvider" class="quick-actions">
      <button
        v-for="preset in visiblePresets"
        :key="preset.id"
        class="quick-action-pill"
        @click="handlePresetClick(preset.content)"
      >
        {{ preset.name }}
      </button>
      <button v-if="showExpandButton" class="quick-action-pill quick-action-expand" @click="handleExpandPresets">
        ...
      </button>
    </div>

    <!-- Pending attachments -->
    <div v-if="pendingImages.length > 0 || pendingFiles.length > 0" class="pending-attachments">
      <!-- Pending images -->
      <div v-for="image in pendingImages" :key="image.id" class="pending-image-chip">
        <img :src="image.dataUrl" :alt="image.name" class="pending-image-thumb" />
        <button class="pending-image-remove" @click="emit('remove-image', image.id)">&times;</button>
      </div>
      <!-- Pending file attachments -->
      <div v-for="file in pendingFiles" :key="file.id" class="pending-file-chip">
        <span class="pending-file-badge" :style="{ background: getFileBadge(file.format).color + '18', color: getFileBadge(file.format).color }">{{ getFileBadge(file.format).label }}</span>
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
        <img v-if="sharePageFavicon" :src="sharePageFavicon" alt="" class="share-page-favicon" />
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
        </svg>
        <span v-if="sharePageEnabled" class="share-page-info">
          <span class="share-page-domain">{{ sharePageUrl }}</span>
          <span class="share-page-title">{{ sharePageTitle }}</span>
        </span>
        <span v-else>{{ i18n(language, 'sharePage.share') }}</span>
        <span v-if="sharePageEnabled" class="share-page-indicator"></span>
      </button>
    </div>

    <!-- Markdown formatting toolbar -->
    <Transition name="format-toolbar">
      <div v-if="isFocused" class="format-toolbar">
        <button class="format-btn" @click="insertFormat('bold')" title="Bold (Ctrl+B)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"/><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg>
        </button>
        <button class="format-btn" @click="insertFormat('italic')" title="Italic (Ctrl+I)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
        </button>
        <button class="format-btn" @click="insertFormat('code')" title="Inline code">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button class="format-btn" @click="insertFormat('codeblock')" title="Code block">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 8 5 12 9 16"/><polyline points="15 8 19 12 15 16"/></svg>
        </button>
        <button class="format-btn" @click="insertFormat('link')" title="Link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </button>
        <button class="format-btn" @click="insertFormat('list')" title="List">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>
      </div>
    </Transition>

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
        :placeholder="hasActiveProvider ? (shortcutHint || i18n(language, 'input.placeholder')) : i18n(language, 'input.placeholderNoProvider')"
        rows="1"
        @keydown="handleKeydown"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        @paste="emit('paste', $event)"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @focus="isFocused = true"
        @blur="isFocused = false"
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
    <!-- Character count -->
    <div v-if="showCharCount" class="char-count">{{ charCount.toLocaleString() }}</div>
  </div>
</template>

<style scoped>
.input-area {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-primary);
  transition: background var(--transition-fast), border-color var(--transition-fast);
  position: relative;
}

.input-area.drag-active {
  background: var(--color-bg-secondary);
  border-color: var(--color-accent);
}

/* Drop zone overlay */
.drop-zone-overlay {
  position: absolute;
  inset: 0;
  background: var(--color-bg-primary);
  opacity: 0.95;
  border: 2px dashed var(--color-accent);
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  animation: drop-zone-pulse 1.5s ease-in-out infinite;
}

@keyframes drop-zone-pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}

.drop-zone-text {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-accent);
}

.drop-zone-enter-active {
  animation: drop-zone-fade-in 150ms ease;
}

.drop-zone-leave-active {
  animation: drop-zone-fade-in 150ms ease reverse;
}

@keyframes drop-zone-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Quick actions bar */
.quick-actions {
  display: flex;
  gap: var(--spacing-xs);
  padding-bottom: var(--spacing-sm);
  overflow-x: auto;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.quick-actions::-webkit-scrollbar {
  display: none;
}

.quick-action-pill {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-body);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.quick-action-pill:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-accent);
  color: var(--color-accent);
  transform: translateY(-1px);
}

.quick-action-expand {
  font-weight: 600;
  letter-spacing: 1px;
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

.pending-file-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
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
  background: var(--color-success-bg);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.share-page-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-page-favicon {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  flex-shrink: 0;
  object-fit: contain;
}

.share-page-info {
  display: flex;
  flex-direction: column;
  gap: 0;
  align-items: flex-start;
  overflow: hidden;
}

.share-page-domain {
  font-size: 10px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.share-page-title {
  font-size: var(--font-size-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.share-page-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
  animation: share-page-pulse 2s ease-in-out infinite;
}

@keyframes share-page-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.share-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 0;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: 2px 4px 2px 4px;
  transition: border-color var(--transition-fast);
}

.input-row:focus-within {
  border-color: var(--color-accent);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] .input-row:focus-within {
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.15);
}

.input-action-btn {
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
  flex-shrink: 0;
}

.input-action-btn:hover {
  color: var(--color-text-primary);
}

.input-action-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.input-textarea {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-md);
  resize: none;
  outline: none;
  min-height: 32px;
  max-height: 156px;
  line-height: 22px;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.input-textarea::placeholder {
  color: var(--color-text-secondary);
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
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

/* Format toolbar */
.format-toolbar {
  display: flex;
  gap: 2px;
  padding: 2px var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.format-btn {
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
  transition: all var(--transition-fast);
  opacity: 0.7;
}

.format-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  opacity: 1;
}

.format-toolbar-enter-active {
  animation: format-toolbar-in 150ms ease;
}

.format-toolbar-leave-active {
  animation: format-toolbar-in 100ms ease reverse;
}

@keyframes format-toolbar-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Character count */
.char-count {
  text-align: right;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  opacity: 0.6;
  padding: 0 var(--spacing-md) 0 0;
  margin-top: 2px;
  transition: opacity var(--transition-fast);
}
</style>
