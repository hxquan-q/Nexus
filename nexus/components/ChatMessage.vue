<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '../utils/providers/types';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';
import { renderMarkdown } from '../utils/markdown';
import type { ApiErrorCode } from '../utils/api';

const props = defineProps<{
  message: ChatMessage;
  index: number;
  isLast: boolean;
  language: Language;
  isLoading: boolean;
  isEditing: boolean;
  editingText: string;
  copied: boolean;
  reasoningExpanded: boolean;
  showReactions: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit', index: number): void;
  (e: 'cancel-edit'): void;
  (e: 'save-edit'): void;
  (e: 'update:editingText', value: string): void;
  (e: 'copy', index: number): void;
  (e: 'delete', index: number): void;
  (e: 'regenerate'): void;
  (e: 'toggle-reasoning', index: number): void;
  (e: 'open-lightbox', dataUrl: string): void;
  (e: 'copy-error', rawError: string): void;
  (e: 'react', index: number, reaction: 'good' | 'bad'): void;
}>();

function getUserMessageDisplayContent(message: ChatMessage): string {
  if (!message.content) return '';
  if (message.fileAttachments && message.fileAttachments.length > 0) {
    const separatorIndex = message.content.indexOf('\n\n---\n\n');
    if (separatorIndex !== -1) {
      return message.content.substring(0, separatorIndex).trim();
    }
  }
  return message.content;
}

function getFileIcon(format: string): string {
  switch (format) {
    case 'pdf': return 'PDF';
    case 'docx': return 'DOC';
    case 'csv': return 'CSV';
    case 'md': return 'MD';
    case 'txt': return 'TXT';
    default: return 'FILE';
  }
}

function getFileBadgeColor(format: string): string {
  switch (format) {
    case 'pdf': return '#ff3b30';
    case 'docx': return '#007aff';
    case 'csv': return '#34c759';
    case 'md': return '#af52de';
    case 'txt': return '#8e8e93';
    default: return '#8e8e93';
  }
}

function parseErrorContent(content: string): { message: string; code: ApiErrorCode; rawError: string } | null {
  try {
    const jsonStr = content.replace('__ERROR__:', '');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function getErrorTitle(code: ApiErrorCode): string {
  switch (code) {
    case 'AUTH': return i18n(props.language, 'error.auth');
    case 'RATE_LIMIT': return i18n(props.language, 'error.rateLimit');
    case 'NETWORK': return i18n(props.language, 'error.network');
    case 'MODEL_NOT_FOUND': return i18n(props.language, 'error.modelNotFound');
    case 'CONTEXT_LENGTH': return i18n(props.language, 'error.contextLength');
    case 'PROVIDER_ERROR': return i18n(props.language, 'error.providerError');
    default: return i18n(props.language, 'error.general', { message: '' });
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const locale = props.language === 'zh-CN' ? 'zh-CN' : 'en-US';

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

const isError = computed(() => props.message.content?.startsWith('__ERROR__:'));
const parsedError = computed(() => isError.value ? parseErrorContent(props.message.content) : null);
const isAssistant = computed(() => props.message.role === 'assistant');
const isUser = computed(() => props.message.role === 'user');
</script>

<template>
  <div class="message-wrapper" :class="[`message-${message.role}`]">
    <!-- Thinking/reasoning block (collapsible) -->
    <div v-if="message.reasoning" class="reasoning-block">
      <button class="reasoning-toggle" @click="emit('toggle-reasoning', index)">
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          :style="{ transform: reasoningExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span>{{ i18n(language, 'chat.thinking') }}</span>
      </button>
      <div v-if="reasoningExpanded" class="reasoning-content">
        {{ message.reasoning }}
      </div>
    </div>

    <!-- Message row with avatar -->
    <div class="message-row">
      <!-- Avatar -->
      <div class="message-avatar" :class="message.role === 'user' ? 'avatar-user' : 'avatar-assistant'">
        <template v-if="message.role === 'user'">U</template>
        <template v-else>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </template>
      </div>

      <div class="message-body">
        <!-- Message bubble -->
        <div class="message-bubble" :class="[`bubble-${message.role}`, { 'bubble-error': isError }]">
          <!-- Images -->
          <div v-if="message.images && message.images.length" class="message-images">
            <img
              v-for="image in message.images"
              :key="image.id"
              :src="image.dataUrl"
              :alt="image.name"
              class="message-image"
              @click="emit('open-lightbox', image.dataUrl)"
            />
          </div>

          <!-- File attachments -->
          <div v-if="message.fileAttachments && message.fileAttachments.length" class="message-files">
            <div v-for="file in message.fileAttachments" :key="file.id" class="message-file-chip">
              <span class="message-file-badge" :style="{ background: getFileBadgeColor(file.format) + '18', color: getFileBadgeColor(file.format) }">{{ getFileIcon(file.format) }}</span>
              <span class="message-file-name">{{ file.name }}</span>
            </div>
          </div>

          <!-- Quote -->
          <div v-if="message.quote" class="message-quote">
            {{ message.quote }}
          </div>

          <!-- Edit mode for user messages -->
          <template v-if="isEditing">
            <textarea
              class="edit-textarea"
              :value="editingText"
              @input="emit('update:editingText', ($event.target as HTMLTextAreaElement).value)"
              rows="3"
              @keydown.escape="emit('cancel-edit')"
            ></textarea>
            <div class="edit-actions">
              <button class="edit-action-btn cancel" @click="emit('cancel-edit')">{{ i18n(language, 'chat.cancel') }}</button>
              <button class="edit-action-btn save" @click="emit('save-edit')">{{ i18n(language, 'chat.saveResend') }}</button>
            </div>
          </template>

          <!-- Normal content -->
          <template v-else>
            <!-- Error message with structured display -->
            <template v-if="isError">
              <div class="error-content">
                <template v-if="parsedError">
                  <div class="error-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span class="error-type">{{ getErrorTitle(parsedError.code) }}</span>
                  </div>
                  <p class="error-message">{{ parsedError.message }}</p>
                  <div class="error-actions">
                    <button class="error-action-btn retry" @click="emit('regenerate')">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                      </svg>
                      {{ i18n(language, 'error.retry') }}
                    </button>
                    <button class="error-action-btn copy-error" @click="emit('copy-error', parsedError.rawError)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      {{ i18n(language, 'error.copyError') }}
                    </button>
                  </div>
                </template>
                <template v-else>
                  {{ message.content.replace('__ERROR__: ', '') }}
                  <button class="retry-btn" @click="emit('regenerate')">{{ i18n(language, 'error.retry') }}</button>
                </template>
              </div>
            </template>

            <!-- Assistant markdown content -->
            <template v-else-if="isAssistant">
              <div
                class="message-content markdown-content"
                v-html="renderMarkdown(message.content || '')"
              ></div>
              <!-- Streaming cursor -->
              <span v-if="isLoading && isLast && message.content" class="streaming-cursor"></span>
            </template>

            <!-- User message content -->
            <template v-else>
              <div class="message-content">
                {{ getUserMessageDisplayContent(message) }}
              </div>
            </template>

            <!-- Typing indicator -->
            <div v-if="isLoading && isLast && isAssistant && !message.content" class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </template>
        </div>

        <!-- Message actions row -->
        <div class="message-actions-row" v-if="!isEditing">
          <!-- Timestamp -->
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>

          <!-- Assistant actions -->
          <template v-if="isAssistant && message.content && !isError">
            <button
              class="msg-action-btn"
              :class="{ copied: copied }"
              @click="emit('copy', index)"
              :title="i18n(language, 'chat.copy')"
            >
              <svg v-if="!copied" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
            <button
              v-if="isLast"
              class="msg-action-btn"
              @click="emit('regenerate')"
              :title="i18n(language, 'action.regenerate')"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
            </button>
          </template>

          <!-- User message actions -->
          <template v-if="isUser">
            <button class="msg-action-btn" @click="emit('edit', index)" :title="i18n(language, 'chat.editMessage')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="msg-action-btn msg-action-danger" @click="emit('delete', index)" :title="i18n(language, 'action.delete')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </template>

          <!-- Reaction buttons for assistant messages -->
          <template v-if="isAssistant && showReactions && message.content && !isError">
            <span class="msg-action-separator"></span>
            <button
              class="msg-action-btn reaction-btn"
              :class="{ 'reaction-active': message.reaction === 'good' }"
              @click="emit('react', index, message.reaction === 'good' ? 'good' : 'good')"
              :title="i18n(language, 'action.goodResponse')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/>
                <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
              </svg>
            </button>
            <button
              class="msg-action-btn reaction-btn"
              :class="{ 'reaction-active': message.reaction === 'bad' }"
              @click="emit('react', index, message.reaction === 'bad' ? 'bad' : 'bad')"
              :title="i18n(language, 'action.poorResponse')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/>
                <path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
              </svg>
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  position: relative;
  animation: message-fade-in 200ms ease both;
}

@keyframes message-fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-user {
  align-items: flex-end;
}

.message-assistant {
  align-items: flex-start;
}

/* Message row with avatar */
.message-row {
  display: flex;
  gap: var(--spacing-sm);
  max-width: 100%;
}

.message-user .message-row {
  flex-direction: row-reverse;
  max-width: 85%;
  margin-left: auto;
}

.message-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

/* Avatar */
.message-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}

.avatar-user {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
}

.avatar-assistant {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.message-user .message-avatar {
  margin-left: auto;
}

.message-assistant .message-avatar {
  margin-right: auto;
}

.message-bubble {
  max-width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-md);
  line-height: var(--line-height-normal);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.bubble-user {
  background: var(--color-bg-user-bubble);
  color: var(--color-text-user-bubble);
  border-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-xs);
}

.bubble-assistant {
  background: transparent;
  color: var(--color-text-primary);
  padding-left: 0;
  padding-right: 0;
}

.bubble-error {
  background: rgba(255, 59, 48, 0.08);
  border: 1px solid rgba(255, 59, 48, 0.2);
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
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.message-image:hover {
  transform: scale(1.02);
  box-shadow: var(--shadow-md);
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

.message-file-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
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

/* Message actions row */
.message-actions-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 0 var(--spacing-xs);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.message-wrapper:hover .message-actions-row {
  opacity: 1;
}

.message-time {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  padding: 0;
}

.msg-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  padding: 0;
}

.msg-action-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.msg-action-btn.copied {
  color: var(--color-success);
}

.msg-action-danger:hover {
  color: var(--color-error);
}

/* Reaction buttons */
.msg-action-separator {
  width: 1px;
  height: 14px;
  background: var(--color-border);
  margin: 0 2px;
}

.reaction-btn.reaction-active {
  color: var(--color-accent);
}

.reaction-btn.reaction-active svg {
  fill: var(--color-accent);
  fill-opacity: 0.15;
}

.reaction-btn:hover {
  color: var(--color-accent);
}

/* Edit message */
.edit-textarea {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  resize: vertical;
  outline: none;
  min-height: 60px;
  line-height: var(--line-height-normal);
}

.edit-actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
  justify-content: flex-end;
}

.edit-action-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.edit-action-btn.cancel {
  background: transparent;
  color: var(--color-text-secondary);
}

.edit-action-btn.cancel:hover {
  background: var(--color-bg-secondary);
}

.edit-action-btn.save {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
}

.edit-action-btn.save:hover {
  background: var(--color-accent-hover);
}

/* Error content with retry */
.error-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

.error-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-weight: 600;
}

.error-type {
  text-transform: uppercase;
  font-size: var(--font-size-xs);
  letter-spacing: 0.5px;
}

.error-message {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.error-actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
}

.error-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  font-family: var(--font-body);
}

.error-action-btn:hover {
  background: var(--color-error);
  color: white;
}

.error-action-btn.copy-error {
  border-color: var(--color-border);
  color: var(--color-text-secondary);
}

.error-action-btn.copy-error:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.retry-btn {
  align-self: flex-start;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.retry-btn:hover {
  background: var(--color-error);
  color: white;
}

/* Streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 1s step-end infinite;
}

@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
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
</style>
