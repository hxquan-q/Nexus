<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { ChatSession } from '../utils/db';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';

const props = defineProps<{
  sessions: ChatSession[];
  currentSessionId: string | null;
  language: Language;
  hasMore: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'load', session: ChatSession): void;
  (e: 'delete', id: string): void;
  (e: 'load-more'): void;
  (e: 'search', query: string): void;
  (e: 'rename', id: string, title: string): void;
  (e: 'export-markdown'): void;
  (e: 'export-html'): void;
  (e: 'import', event: Event): void;
  (e: 'new-chat'): void;
  (e: 'close'): void;
}>();

const historySearchQuery = ref('');
const renamingSessionId = ref<string | null>(null);
const renameInput = ref('');
const sessionListRef = ref<HTMLElement | null>(null);

function formatSessionDate(timestamp: number): string {
  const date = new Date(timestamp);
  const locale = props.language === 'zh-CN' ? 'zh-CN' : 'en-US';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const filteredSessions = computed(() => {
  const query = historySearchQuery.value.trim().toLowerCase();
  if (!query) return props.sessions;
  return props.sessions.filter((s) => {
    if (s.title.toLowerCase().includes(query)) return true;
    return s.messages.some((m) =>
      m.content?.toLowerCase().includes(query)
    );
  });
});

const groupedSessions = computed(() => {
  const groups: { label: string; sessions: ChatSession[] }[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const thisWeekStart = new Date(today.getTime() - today.getDay() * 86400000);

  const locale = props.language === 'zh-CN' ? 'zh-CN' : 'en-US';

  let todayGroup: ChatSession[] = [];
  let yesterdayGroup: ChatSession[] = [];
  let weekGroup: ChatSession[] = [];
  let olderGroup: ChatSession[] = [];

  for (const s of filteredSessions.value) {
    const date = new Date(s.updatedAt);
    if (date >= today) {
      todayGroup.push(s);
    } else if (date >= yesterday) {
      yesterdayGroup.push(s);
    } else if (date >= thisWeekStart) {
      weekGroup.push(s);
    } else {
      olderGroup.push(s);
    }
  }

  if (todayGroup.length > 0) {
    groups.push({ label: locale === 'zh-CN' ? '今天' : 'Today', sessions: todayGroup });
  }
  if (yesterdayGroup.length > 0) {
    groups.push({ label: locale === 'zh-CN' ? '昨天' : 'Yesterday', sessions: yesterdayGroup });
  }
  if (weekGroup.length > 0) {
    groups.push({ label: locale === 'zh-CN' ? '本周' : 'This Week', sessions: weekGroup });
  }
  if (olderGroup.length > 0) {
    groups.push({ label: locale === 'zh-CN' ? '更早' : 'Older', sessions: olderGroup });
  }

  return groups;
});

function handleListScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
    emit('load-more');
  }
}

function startRename(session: ChatSession, e: Event) {
  e.stopPropagation();
  renamingSessionId.value = session.id;
  renameInput.value = session.title;
  nextTick(() => {
    const input = document.querySelector('.rename-input') as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  });
}

function finishRename() {
  if (!renamingSessionId.value) return;
  const id = renamingSessionId.value;
  const newTitle = renameInput.value.trim();
  renamingSessionId.value = null;

  if (!newTitle) return;
  emit('rename', id, newTitle);
}

function cancelRename() {
  renamingSessionId.value = null;
  renameInput.value = '';
}
</script>

<template>
  <div class="history-panel" @click.stop>
    <div class="history-header">
      <h3>{{ i18n(language, 'history.title') }}</h3>
      <button class="header-btn" @click="emit('close')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="history-search-row">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        v-model="historySearchQuery"
        type="text"
        class="history-search-input"
        :placeholder="i18n(language, 'history.search')"
      />
    </div>
    <div class="history-list" ref="sessionListRef" @scroll="handleListScroll">
      <template v-for="group in groupedSessions" :key="group.label">
        <div class="history-date-group">{{ group.label }}</div>
        <button
          v-for="session in group.sessions"
          :key="session.id"
          class="history-item"
          :class="{ active: currentSessionId === session.id }"
          @click="emit('load', session)"
        >
          <div class="history-item-info">
            <template v-if="renamingSessionId === session.id">
              <input
                class="rename-input"
                v-model="renameInput"
                @keydown.enter="finishRename"
                @keydown.escape="cancelRename"
                @blur="finishRename"
                @click.stop
              />
            </template>
            <template v-else>
              <span class="history-item-title">{{ session.title }}</span>
            </template>
            <span class="history-item-date">{{ formatSessionDate(session.updatedAt) }}</span>
          </div>
          <div class="history-item-actions">
            <button class="history-item-action" @click="(e) => startRename(session, e)" title="Rename">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="history-item-delete" @click="(e) => { e.stopPropagation(); emit('delete', session.id); }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </button>
      </template>
      <div v-if="sessions.length === 0" class="history-empty">
        {{ i18n(language, 'history.noChats') }}
      </div>
      <div v-if="loading" class="history-loading">{{ i18n(language, 'history.loading') }}</div>
    </div>
    <button class="history-new-btn" @click="emit('new-chat')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {{ i18n(language, 'history.newChat') }}
    </button>
    <div class="history-actions-row">
      <button class="history-action-btn" @click="emit('export-markdown')" :disabled="!currentSessionId">{{ i18n(language, 'history.exportMd') }}</button>
      <button class="history-action-btn" @click="emit('export-html')" :disabled="!currentSessionId">{{ i18n(language, 'history.exportHtml') }}</button>
      <label class="history-action-btn">
        {{ i18n(language, 'history.import') }}
        <input type="file" accept=".json" style="display: none" @change="(e) => emit('import', e)" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.history-panel {
  width: 300px;
  max-width: 85%;
  height: 100%;
  background: var(--color-bg-primary);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  animation: panel-slide-in 300ms ease;
}

@keyframes panel-slide-in {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
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

.history-search-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.history-search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-body);
  outline: none;
  padding: var(--spacing-xs) 0;
}

.history-search-input::placeholder {
  color: var(--color-text-secondary);
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xs);
}

.history-date-group {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  background: var(--color-bg-primary);
  z-index: 1;
  margin-top: var(--spacing-xs);
}

.history-date-group:first-child {
  margin-top: 0;
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

.rename-input {
  width: 100%;
  padding: 2px 6px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-body);
  outline: none;
}

.history-item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}

.history-item:hover .history-item-actions {
  opacity: 1;
}

.history-item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  padding: 0;
}

.history-item-action:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
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
  transition: all var(--transition-fast);
  flex-shrink: 0;
  padding: 0;
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
</style>
