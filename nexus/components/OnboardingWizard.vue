<script setup lang="ts">
import { ref } from 'vue';
import type { Language } from '../utils/i18n';
import { t as i18n } from '../utils/i18n';
import type { ProviderType } from '../utils/providers/types';

const props = defineProps<{
  language: Language;
}>();

const emit = defineEmits<{
  (e: 'complete'): void;
  (e: 'open-settings'): void;
}>();

const providerType = ref<ProviderType>('openai');
const apiKey = ref('');
const baseUrl = ref('https://api.openai.com/v1');
const isLoading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

const providerTypes: { value: ProviderType; label: string; url: string }[] = [
  { value: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com/v1' },
  { value: 'gemini', label: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta' },
  { value: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { value: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { value: 'qwen', label: 'Qwen', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'zhipu', label: 'Zhipu', url: 'https://open.bigmodel.cn/api/paas/v1' },
  { value: 'custom', label: 'Custom', url: '' },
];

function onProviderTypeChange() {
  const found = providerTypes.find(p => p.value === providerType.value);
  if (found) {
    baseUrl.value = found.url;
  }
}

async function handleGetStarted() {
  if (!apiKey.value.trim() || !baseUrl.value.trim()) {
    error.value = 'API Key and Base URL are required.';
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    // Save the provider via storage
    const { saveProvider, setActiveProviderId, setOnboardingCompleted } = await import('../utils/storage');
    const { fetchModels } = await import('../utils/api');

    const providerId = crypto.randomUUID();
    let models: string[] = [];
    let selectedModel = '';

    try {
      const fetchedModels = await fetchModels(baseUrl.value, apiKey.value);
      models = fetchedModels.map(m => m.id);
      if (models.length > 0) {
        selectedModel = models[0];
      }
    } catch {
      // Models fetch failed - user can set manually later
    }

    const provider = {
      id: providerId,
      name: providerTypes.find(p => p.value === providerType.value)?.label || 'Custom',
      type: providerType.value,
      baseUrl: baseUrl.value.trim(),
      apiKey: apiKey.value.trim(),
      models,
      selectedModel,
      visionModels: [],
    };

    await saveProvider(provider);
    await setActiveProviderId(providerId);

    success.value = true;

    setTimeout(async () => {
      await setOnboardingCompleted(true);
      emit('complete');
    }, 800);
  } catch (err) {
    error.value = err instanceof Error ? err.message : i18n(props.language, 'onboarding.error');
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="onboarding">
    <div class="onboarding-bg"></div>
    <div class="onboarding-content">
      <div class="onboarding-logo">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h2 class="onboarding-title">{{ i18n(language, 'onboarding.welcome') }}</h2>
      <p class="onboarding-subtitle">{{ i18n(language, 'onboarding.subtitle') }}</p>

      <div class="onboarding-form">
        <h3 class="onboarding-step">{{ i18n(language, 'onboarding.step1') }}</h3>

        <div class="onboarding-field">
          <label class="onboarding-label">{{ i18n(language, 'onboarding.providerType') }}</label>
          <select v-model="providerType" class="onboarding-select" @change="onProviderTypeChange">
            <option v-for="pt in providerTypes" :key="pt.value" :value="pt.value">
              {{ pt.label }}
            </option>
          </select>
        </div>

        <div class="onboarding-field">
          <label class="onboarding-label">{{ i18n(language, 'onboarding.baseUrl') }}</label>
          <input
            v-model="baseUrl"
            type="text"
            class="onboarding-input"
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div class="onboarding-field">
          <label class="onboarding-label">{{ i18n(language, 'onboarding.apiKey') }}</label>
          <input
            v-model="apiKey"
            type="password"
            class="onboarding-input"
            placeholder="sk-..."
          />
        </div>

        <button
          class="onboarding-submit"
          :class="{ success }"
          :disabled="isLoading || success"
          @click="handleGetStarted"
        >
          <template v-if="success">{{ i18n(language, 'onboarding.success') }}</template>
          <template v-else-if="isLoading">{{ i18n(language, 'onboarding.fetchingModels') }}</template>
          <template v-else>
            {{ i18n(language, 'onboarding.getStarted') }}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </template>
        </button>

        <div v-if="error" class="onboarding-error">
          {{ error }}
        </div>
      </div>

      <p class="onboarding-alt">{{ i18n(language, 'onboarding.orSettings') }}</p>
      <button class="onboarding-settings-link" @click="emit('open-settings')">
        {{ i18n(language, 'onboarding.openSettings') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: var(--spacing-lg);
}

.onboarding-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 35%, rgba(0, 122, 255, 0.08), transparent 65%);
  pointer-events: none;
}

[data-theme="dark"] .onboarding-bg {
  background: radial-gradient(circle at 50% 35%, rgba(10, 132, 255, 0.1), transparent 65%);
}

.onboarding-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  max-width: 320px;
  width: 100%;
  animation: onboarding-fade-in 500ms ease;
}

@keyframes onboarding-fade-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.onboarding-logo {
  margin-bottom: var(--spacing-xs);
}

.onboarding-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--color-text-primary);
}

.onboarding-subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}

.onboarding-form {
  width: 100%;
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.onboarding-step {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

.onboarding-field {
  margin-bottom: var(--spacing-sm);
}

.onboarding-label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.onboarding-select,
.onboarding-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.onboarding-select:focus,
.onboarding-input:focus {
  border-color: var(--color-accent);
}

.onboarding-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  width: 100%;
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  font-size: var(--font-size-md);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-normal);
  font-family: var(--font-body);
}

.onboarding-submit:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.onboarding-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.onboarding-submit.success {
  background: var(--color-success);
}

.onboarding-error {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.onboarding-alt {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.onboarding-settings-link {
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.onboarding-settings-link:hover {
  opacity: 0.8;
}
</style>
