<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';

const props = defineProps<{
  language: Language;
  chatAreaRef: HTMLElement | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const searchQuery = ref('');
const currentMatchIndex = ref(0);
const totalMatches = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);

// Highlight management
let highlightedElements: HTMLElement[] = [];
const HIGHLIGHT_CLASS = 'chat-search-highlight';
const HIGHLIGHT_ACTIVE_CLASS = 'chat-search-highlight-active';

function clearHighlights(): void {
  for (const el of highlightedElements) {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      parent.normalize();
    }
  }
  highlightedElements = [];
  currentMatchIndex.value = 0;
  totalMatches.value = 0;
}

function performSearch(): void {
  clearHighlights();
  const query = searchQuery.value.trim();
  if (!query || !props.chatAreaRef) return;

  const walker = document.createTreeWalker(
    props.chatAreaRef,
    NodeFilter.SHOW_TEXT,
    null,
  );

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.textContent && node.parentElement && !node.parentElement.closest('textarea, input, [contenteditable]')) {
      textNodes.push(node);
    }
  }

  const queryLower = query.toLowerCase();
  const matches: { node: Text; start: number; end: number }[] = [];

  for (const node of textNodes) {
    const content = node.textContent!.toLowerCase();
    let searchStart = 0;
    while (true) {
      const idx = content.indexOf(queryLower, searchStart);
      if (idx === -1) break;
      matches.push({
        node,
        start: idx,
        end: idx + query.length,
      });
      searchStart = idx + 1;
    }
  }

  totalMatches.value = matches.length;
  if (matches.length === 0) return;

  // Apply highlights (process from end to start to avoid offset issues)
  // Group by node
  const nodeMatches = new Map<Text, { start: number; end: number }[]>();
  for (const match of matches) {
    if (!nodeMatches.has(match.node)) {
      nodeMatches.set(match.node, []);
    }
    nodeMatches.get(match.node)!.push({ start: match.start, end: match.end });
  }

  for (const [node, ranges] of nodeMatches) {
    // Sort ranges in reverse order
    ranges.sort((a, b) => b.start - a.start);

    for (const range of ranges) {
      const highlight = document.createElement('mark');
      highlight.className = HIGHLIGHT_CLASS;
      const textNode = node.splitText(range.start);
      textNode.splitText(range.end - range.start);
      highlight.textContent = textNode.textContent;
      textNode.parentNode?.replaceChild(highlight, textNode);
      highlightedElements.push(highlight);
    }
  }

  currentMatchIndex.value = 1;
  scrollToMatch(0);
}

function scrollToMatch(index: number): void {
  if (highlightedElements.length === 0) return;

  // Remove active class from previous
  for (const el of highlightedElements) {
    el.classList.remove(HIGHLIGHT_ACTIVE_CLASS);
  }

  const target = highlightedElements[index];
  if (target) {
    target.classList.add(HIGHLIGHT_ACTIVE_CLASS);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function nextMatch(): void {
  if (highlightedElements.length === 0) return;
  const next = currentMatchIndex.value >= highlightedElements.length ? 1 : currentMatchIndex.value + 1;
  currentMatchIndex.value = next;
  scrollToMatch(next - 1);
}

function prevMatch(): void {
  if (highlightedElements.length === 0) return;
  const prev = currentMatchIndex.value <= 1 ? highlightedElements.length : currentMatchIndex.value - 1;
  currentMatchIndex.value = prev;
  scrollToMatch(prev - 1);
}

watch(searchQuery, () => {
  nextTick(() => performSearch());
});

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    clearHighlights();
    emit('close');
  } else if (event.key === 'Enter') {
    if (event.shiftKey) {
      prevMatch();
    } else {
      nextMatch();
    }
  }
}

onMounted(() => {
  nextTick(() => {
    searchInputRef.value?.focus();
  });
});

onUnmounted(() => {
  clearHighlights();
});
</script>

<template>
  <div class="chat-search-bar">
    <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input
      ref="searchInputRef"
      v-model="searchQuery"
      type="text"
      class="search-input"
      :placeholder="i18n(language, 'search.placeholder')"
      @keydown="handleKeydown"
    />
    <span v-if="searchQuery && totalMatches > 0" class="search-count">
      {{ currentMatchIndex }} / {{ totalMatches }}
    </span>
    <span v-else-if="searchQuery && totalMatches === 0" class="search-count no-results">
      {{ i18n(language, 'search.noResults') }}
    </span>
    <button class="search-nav-btn" @click="prevMatch" :disabled="totalMatches === 0" title="Previous">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    </button>
    <button class="search-nav-btn" @click="nextMatch" :disabled="totalMatches === 0" title="Next">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <button class="search-close-btn" @click="clearHighlights(); emit('close')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.chat-search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  animation: search-slide-down 150ms ease;
}

@keyframes search-slide-down {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.search-icon {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-body);
  outline: none;
  padding: var(--spacing-xs) 0;
  min-width: 80px;
}

.search-input::placeholder {
  color: var(--color-text-secondary);
}

.search-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  padding: 0 var(--spacing-xs);
  font-variant-numeric: tabular-nums;
}

.search-count.no-results {
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.search-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-xs);
  transition: all var(--transition-fast);
}

.search-nav-btn:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.search-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.search-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-xs);
  transition: all var(--transition-fast);
}

.search-close-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}
</style>

<style>
/* Global styles for search highlights (not scoped) */
.chat-search-highlight {
  background: rgba(255, 213, 0, 0.4);
  border-radius: 2px;
  padding: 1px 0;
}

[data-theme="dark"] .chat-search-highlight {
  background: rgba(255, 213, 0, 0.25);
}

.chat-search-highlight-active {
  background: rgba(255, 213, 0, 0.7);
}

[data-theme="dark"] .chat-search-highlight-active {
  background: rgba(255, 213, 0, 0.5);
}
</style>
