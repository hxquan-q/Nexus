<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { StoredProvider } from '../utils/storage';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';

const props = defineProps<{
  providers: StoredProvider[];
  activeProviderId: string | null;
  activeModelName: string;
  language: Language;
}>();

const emit = defineEmits<{
  (e: 'select', providerId: string, model: string): void;
  (e: 'close'): void;
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const wrapperRef = ref<HTMLElement | null>(null);

function toggle() {
  isOpen.value = !isOpen.value;
  searchQuery.value = '';
}

function close() {
  isOpen.value = false;
  searchQuery.value = '';
}

function handleClickOutside(event: MouseEvent) {
  if (!isOpen.value) return;
  const target = event.target as Node;
  if (wrapperRef.value && !wrapperRef.value.contains(target)) {
    close();
  }
}

function handleSelect(providerId: string, model: string) {
  emit('select', providerId, model);
  close();
}

const allModelOptions = computed(() => {
  const options: { providerId: string; providerName: string; model: string }[] = [];
  for (const p of props.providers) {
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

const filteredModelOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return allModelOptions.value;
  return allModelOptions.value.filter(
    (opt) =>
      opt.model.toLowerCase().includes(query) ||
      opt.providerName.toLowerCase().includes(query)
  );
});

const groupedModelOptions = computed(() => {
  const groups: { providerId: string; providerName: string; models: { model: string; isVision: boolean }[] }[] = [];
  for (const opt of filteredModelOptions.value) {
    let group = groups.find((g) => g.providerId === opt.providerId);
    if (!group) {
      group = { providerId: opt.providerId, providerName: opt.providerName, models: [] };
      groups.push(group);
    }
    const provider = props.providers.find((p) => p.id === opt.providerId);
    const isVision = provider?.visionModels?.includes(opt.model) ?? false;
    group.models.push({ model: opt.model, isVision });
  }
  return groups;
});

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true);
});

defineExpose({ toggle, close, isOpen });
</script>

<template>
  <div class="model-selector-wrapper" ref="wrapperRef">
    <button class="model-selector-btn" @click="toggle" :aria-label="'Select model: ' + activeModelName" aria-haspopup="listbox">
      <span class="model-name">{{ activeModelName }}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <div v-if="isOpen" class="model-selector-dropdown" @click.stop>
      <div class="model-search-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          class="model-search-input"
          :placeholder="i18n(language, 'model.searchPlaceholder')"
          @click.stop
        />
      </div>
      <div class="model-list-scroll">
        <template v-for="group in groupedModelOptions" :key="group.providerId">
          <div class="model-group-header">
            <span class="model-group-name">{{ group.providerName }}</span>
          </div>
          <div
            v-for="item in group.models"
            :key="`${group.providerId}-${item.model}`"
            class="model-option"
            :class="{ active: activeProviderId === group.providerId && activeModelName === item.model }"
            @click="handleSelect(group.providerId, item.model)"
          >
            <span class="model-option-name">{{ item.model }}</span>
            <span class="model-option-badges">
              <span v-if="item.isVision" class="model-vision-badge" title="Vision model">eye</span>
              <span v-if="activeProviderId === group.providerId && activeModelName === item.model" class="model-check">&#10003;</span>
            </span>
          </div>
        </template>
      </div>
      <div v-if="filteredModelOptions.length === 0" class="model-option-empty">
        {{ allModelOptions.length === 0 ? i18n(language, 'model.noModels') : i18n(language, 'model.noMatchingModels') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-selector-wrapper {
  position: relative;
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
  max-width: 120px;
}

.model-selector-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 240px;
  max-width: 320px;
  max-height: 380px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  padding: 0;
  display: flex;
  flex-direction: column;
  animation: dropdown-fade-in 150ms ease;
}

@keyframes dropdown-fade-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.model-search-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.model-search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-body);
  outline: none;
  padding: var(--spacing-xs) 0;
}

.model-search-input::placeholder {
  color: var(--color-text-secondary);
}

.model-list-scroll {
  overflow-y: auto;
  max-height: 340px;
}

.model-group-header {
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-secondary);
  position: sticky;
  top: 0;
  z-index: 1;
}

.model-group-name {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.model-option:hover {
  background: var(--color-bg-secondary);
}

.model-option.active {
  background: var(--color-success-bg);
}

.model-option-name {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: 400;
}

.model-option-badges {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.model-vision-badge {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-weight: 600;
}

.model-check {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
}

.model-option-empty {
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>
