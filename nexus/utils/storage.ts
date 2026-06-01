/**
 * Storage helpers using @wxt-dev/storage
 * For settings that need cross-page sync
 */

import { storage } from '@wxt-dev/storage';
import type { AIProvider, ProviderType } from './providers/types';
import type { Language } from './i18n';

// ============================================================
// Types
// ============================================================

export type ThemeMode = 'light' | 'dark' | 'system';

// ============================================================
// Provider storage
// ============================================================

export interface StoredProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  models: string[];
  selectedModel: string;
  visionModels: string[];
}

const providersStorage = storage.defineItem<StoredProvider[]>('local:providers', {
  fallback: [],
});

const activeProviderIdStorage = storage.defineItem<string | null>('local:activeProviderId', {
  fallback: null,
});

export async function getAllProviders(): Promise<StoredProvider[]> {
  return await providersStorage.getValue();
}

export async function getProvider(id: string): Promise<StoredProvider | undefined> {
  const providers = await providersStorage.getValue();
  return providers.find((p) => p.id === id);
}

export async function saveProvider(provider: StoredProvider): Promise<void> {
  const providers = await providersStorage.getValue();
  const index = providers.findIndex((p) => p.id === provider.id);
  if (index >= 0) {
    providers[index] = provider;
  } else {
    providers.push(provider);
  }
  await providersStorage.setValue(providers);
}

export async function deleteProvider(id: string): Promise<void> {
  const providers = await providersStorage.getValue();
  await providersStorage.setValue(providers.filter((p) => p.id !== id));
}

export async function getActiveProviderId(): Promise<string | null> {
  return await activeProviderIdStorage.getValue();
}

export async function setActiveProviderId(id: string | null): Promise<void> {
  await activeProviderIdStorage.setValue(id);
}

export async function getActiveProvider(): Promise<StoredProvider | null> {
  const activeId = await activeProviderIdStorage.getValue();
  if (!activeId) return null;
  const provider = await getProvider(activeId);
  return provider ?? null;
}

export function watchProviders(callback: (providers: StoredProvider[]) => void): () => void {
  return providersStorage.watch((newValue) => {
    callback(newValue || []);
  });
}

export function watchActiveProviderId(callback: (id: string | null) => void): () => void {
  return activeProviderIdStorage.watch((newValue) => {
    callback(newValue);
  });
}

// ============================================================
// Theme
// ============================================================

const themeModeStorage = storage.defineItem<ThemeMode>('local:themeMode', {
  fallback: 'system',
});

export async function getThemeMode(): Promise<ThemeMode> {
  return await themeModeStorage.getValue();
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  await themeModeStorage.setValue(mode);
}

export function watchThemeMode(callback: (mode: ThemeMode) => void): () => void {
  return themeModeStorage.watch((newValue) => {
    callback(newValue);
  });
}

export function getResolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyTheme(mode: ThemeMode): void {
  const theme = getResolvedTheme(mode);
  document.documentElement.setAttribute('data-theme', theme);
}

// ============================================================
// Language
// ============================================================

const languageStorage = storage.defineItem<Language>('local:language', {
  fallback: 'en',
});

export async function getLanguage(): Promise<Language> {
  return await languageStorage.getValue();
}

export async function setLanguage(lang: Language): Promise<void> {
  await languageStorage.setValue(lang);
}

export function watchLanguage(callback: (lang: Language) => void): () => void {
  return languageStorage.watch((newValue) => {
    callback(newValue);
  });
}

// ============================================================
// Selection quote enabled
// ============================================================

const selectionQuoteEnabledStorage = storage.defineItem<boolean>('local:selectionQuoteEnabled', {
  fallback: true,
});

export async function getSelectionQuoteEnabled(): Promise<boolean> {
  return await selectionQuoteEnabledStorage.getValue();
}

export async function setSelectionQuoteEnabled(enabled: boolean): Promise<void> {
  await selectionQuoteEnabledStorage.setValue(enabled);
}

export function watchSelectionQuoteEnabled(callback: (enabled: boolean) => void): () => void {
  return selectionQuoteEnabledStorage.watch((newValue) => {
    callback(newValue);
  });
}

// ============================================================
// Floating ball enabled
// ============================================================

const floatingBallEnabledStorage = storage.defineItem<boolean>('local:floatingBallEnabled', {
  fallback: true,
});

export async function getFloatingBallEnabled(): Promise<boolean> {
  return await floatingBallEnabledStorage.getValue();
}

export async function setFloatingBallEnabled(enabled: boolean): Promise<void> {
  await floatingBallEnabledStorage.setValue(enabled);
}

export function watchFloatingBallEnabled(callback: (enabled: boolean) => void): () => void {
  return floatingBallEnabledStorage.watch((newValue) => {
    callback(newValue);
  });
}

// ============================================================
// UI font scale
// ============================================================

const fontScaleStorage = storage.defineItem<number>('local:fontScale', {
  fallback: 1.0,
});

export async function getFontScale(): Promise<number> {
  return await fontScaleStorage.getValue();
}

export async function setFontScale(scale: number): Promise<void> {
  await fontScaleStorage.setValue(scale);
}

export function watchFontScale(callback: (scale: number) => void): () => void {
  return fontScaleStorage.watch((newValue) => {
    callback(newValue);
  });
}

// ============================================================
// Page content max length
// ============================================================

const pageContentMaxLengthStorage = storage.defineItem<number>('local:pageContentMaxLength', {
  fallback: 30000,
});

export async function getPageContentMaxLength(): Promise<number> {
  return await pageContentMaxLengthStorage.getValue();
}

export async function setPageContentMaxLength(maxLength: number): Promise<void> {
  await pageContentMaxLengthStorage.setValue(maxLength);
}

// ============================================================
// Max tool calls per turn
// ============================================================

const maxToolCallsPerTurnStorage = storage.defineItem<number>('local:maxToolCallsPerTurn', {
  fallback: 10,
});

export async function getMaxToolCallsPerTurn(): Promise<number> {
  return await maxToolCallsPerTurnStorage.getValue();
}

export async function setMaxToolCallsPerTurn(max: number): Promise<void> {
  await maxToolCallsPerTurnStorage.setValue(max);
}

// ============================================================
// System prompt
// ============================================================

const systemPromptStorage = storage.defineItem<string>('local:systemPrompt', {
  fallback: '',
});

export async function getSystemPrompt(): Promise<string> {
  return await systemPromptStorage.getValue();
}

export async function setSystemPrompt(prompt: string): Promise<void> {
  await systemPromptStorage.setValue(prompt);
}

export function watchSystemPrompt(callback: (prompt: string) => void): () => void {
  return systemPromptStorage.watch((newValue) => {
    callback(newValue || '');
  });
}

// ============================================================
// Raw extraction sites
// ============================================================

const rawExtractionSitesStorage = storage.defineItem<string[]>('local:rawExtractionSites', {
  fallback: [],
});

export async function getRawExtractionSites(): Promise<string[]> {
  return await rawExtractionSitesStorage.getValue();
}

export async function setRawExtractionSites(sites: string[]): Promise<void> {
  await rawExtractionSitesStorage.setValue(sites);
}

// ============================================================
// Preset quick actions
// ============================================================

export interface PresetAction {
  id: string;
  name: string;
  content: string;
}

const presetActionsStorage = storage.defineItem<PresetAction[]>('local:presetActions', {
  fallback: [],
});

export async function getPresetActions(): Promise<PresetAction[]> {
  return await presetActionsStorage.getValue();
}

export async function savePresetActions(actions: PresetAction[]): Promise<void> {
  await presetActionsStorage.setValue(actions);
}

// ============================================================
// Keyboard shortcuts configuration
// ============================================================

export interface ShortcutBinding {
  action: string;
  key: string;
  label: string;
}

const defaultShortcuts: ShortcutBinding[] = [
  { action: 'toggle-sidepanel', key: 'Alt+S', label: 'Open/Close Sidepanel' },
  { action: 'quick-ask', key: 'Ctrl+G', label: 'Quick Ask' },
  { action: 'ocr-capture', key: 'Alt+O', label: 'OCR Capture' },
  { action: 'toggle-browser-control', key: 'Ctrl+B', label: 'Toggle Browser Control' },
  { action: 'area-screenshot', key: 'Ctrl+Shift+S', label: 'Area Screenshot' },
  { action: 'full-screenshot', key: 'Ctrl+Shift+A', label: 'Full Page Screenshot + Ask' },
];

const shortcutsStorage = storage.defineItem<ShortcutBinding[]>('local:shortcuts', {
  fallback: defaultShortcuts,
});

export async function getShortcuts(): Promise<ShortcutBinding[]> {
  return await shortcutsStorage.getValue();
}

export async function saveShortcuts(shortcuts: ShortcutBinding[]): Promise<void> {
  await shortcutsStorage.setValue(shortcuts);
}

export function getDefaultShortcuts(): ShortcutBinding[] {
  return [...defaultShortcuts];
}

// ============================================================
// Helper: convert StoredProvider to AIProvider for API layer
// ============================================================

export function toAIProvider(stored: StoredProvider): AIProvider {
  return {
    id: stored.id,
    name: stored.name,
    type: stored.type,
    baseUrl: stored.baseUrl,
    apiKey: stored.apiKey,
    models: stored.models,
    selectedModel: stored.selectedModel,
    visionModels: stored.visionModels || [],
  };
}

/**
 * Check if a given model supports vision/image input for a provider.
 */
export function isVisionSupportedForModel(provider: StoredProvider, model: string): boolean {
  return provider.visionModels?.includes(model) ?? false;
}
