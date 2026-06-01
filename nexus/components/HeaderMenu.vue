<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';

const props = defineProps<{
  language: Language;
  hasSession: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'share-chat'): void;
  (e: 'export-chat'): void;
  (e: 'clear-chat'): void;
  (e: 'pop-out'): void;
  (e: 'search'): void;
}>();

const isOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

function toggleMenu(): void {
  isOpen.value = !isOpen.value;
}

function handleItemClick(action: string): void {
  isOpen.value = false;
  switch (action) {
    case 'share': emit('share-chat'); break;
    case 'export': emit('export-chat'); break;
    case 'clear': emit('clear-chat'); break;
    case 'popout': emit('pop-out'); break;
    case 'search': emit('search'); break;
  }
}

function handleClickOutside(event: MouseEvent): void {
  if (isOpen.value && menuRef.value && !menuRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="header-menu" ref="menuRef">
    <button class="header-btn" @click="toggleMenu" :aria-label="'Menu'" :aria-expanded="isOpen">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="5" r="1"/>
        <circle cx="12" cy="12" r="1"/>
        <circle cx="12" cy="19" r="1"/>
      </svg>
    </button>

    <Transition name="menu">
      <div v-if="isOpen" class="menu-dropdown">
        <button class="menu-item" @click="handleItemClick('share')" :disabled="!hasSession">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          <span>{{ i18n(language, 'menu.shareChat') }}</span>
        </button>
        <button class="menu-item" @click="handleItemClick('export')" :disabled="!hasSession">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>{{ i18n(language, 'menu.exportChat') }}</span>
        </button>
        <button class="menu-item" @click="handleItemClick('search')" :disabled="!hasSession">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>{{ i18n(language, 'menu.searchChat') }}</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="handleItemClick('popout')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          <span>{{ i18n(language, 'menu.popOut') }}</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item menu-item-danger" @click="handleItemClick('clear')" :disabled="!hasSession">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          <span>{{ i18n(language, 'menu.clearChat') }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.header-menu {
  position: relative;
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

.menu-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--spacing-xs);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  min-width: 180px;
  padding: var(--spacing-xs);
  z-index: 50;
  animation: menu-appear 150ms ease;
}

@keyframes menu-appear {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.menu-enter-active {
  animation: menu-appear 150ms ease;
}

.menu-leave-active {
  animation: menu-disappear 100ms ease;
}

@keyframes menu-disappear {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(-4px) scale(0.98); }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-body);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
  text-align: left;
}

.menu-item:hover:not(:disabled) {
  background: var(--color-bg-secondary);
}

.menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-item-danger {
  color: var(--color-error);
}

.menu-item-danger:hover:not(:disabled) {
  background: var(--color-error-bg);
}

.menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--spacing-xs) 0;
}
</style>
