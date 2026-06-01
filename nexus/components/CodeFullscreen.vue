<script setup lang="ts">
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';

const props = defineProps<{
  code: string;
  language: string;
  lang: Language;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'copy'): void;
}>();
</script>

<template>
  <div class="code-fullscreen-overlay" @click="emit('close')">
    <div class="code-fullscreen-container" @click.stop>
      <div class="code-fullscreen-header">
        <span>{{ language || i18n(lang, 'chat.code') }}</span>
        <div class="code-fullscreen-actions">
          <button class="header-btn" @click="emit('copy')" :title="i18n(lang, 'chat.copy')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <button class="header-btn" @click="emit('close')" :title="i18n(lang, 'code.close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="code-fullscreen-body">
        <pre>{{ code }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-overlay-heavy);
  backdrop-filter: var(--blur-frost);
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
  animation: overlay-fade-in 200ms ease;
}

@keyframes overlay-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.code-fullscreen-container {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-width: 90vw;
  max-height: 85vh;
  width: 700px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: container-scale-in 200ms ease;
}

@keyframes container-scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.code-fullscreen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.code-fullscreen-actions {
  display: flex;
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

.code-fullscreen-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
}

.code-fullscreen-body pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-primary);
}
</style>
