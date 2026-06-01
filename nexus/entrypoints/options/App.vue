<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  getAllProviders,
  saveProvider,
  deleteProvider as deleteProviderFromStorage,
  getActiveProviderId,
  setActiveProviderId,
  getThemeMode,
  setThemeMode,
  applyTheme,
  getLanguage,
  setLanguage,
  getSelectionQuoteEnabled,
  setSelectionQuoteEnabled,
  getFloatingBallEnabled,
  setFloatingBallEnabled,
  getFontScale,
  setFontScale,
  getPageContentMaxLength,
  setPageContentMaxLength,
  getMaxToolCallsPerTurn,
  setMaxToolCallsPerTurn,
  getRawExtractionSites,
  setRawExtractionSites,
  getPresetActions,
  savePresetActions,
  getShortcuts,
  saveShortcuts,
  getDefaultShortcuts,
  type StoredProvider,
  type ThemeMode,
  type PresetAction,
  type ShortcutBinding,
} from '../../utils/storage';
import { t as i18n, type Language } from '../../utils/i18n';
import { fetchModels } from '../../utils/api';
import type { ProviderType } from '../../utils/providers/types';
import {
  exportAllSessions,
  downloadAsJson,
  downloadMultipleAsZip,
  readImportFile,
  validateImportData,
  previewImport,
  importSessions,
  type ExportData,
  type ImportPreview,
} from '../../utils/chatImportExport';
import { getAllSessions, deleteSession } from '../../utils/db';
import {
  getMcpServers,
  saveMcpServer,
  deleteMcpServer as deleteMcpServerFromStorage,
  toggleMcpServer,
  generateMcpServerId,
  watchMcpServers,
  type McpServer,
} from '../../utils/mcpStorage';
import { mcpManager } from '../../utils/mcp';
import {
  getAllSkills,
  importSkill,
  deleteSkill as deleteSkillFromDb,
  type Skill,
} from '../../utils/skills';

// ============================================================
// Navigation
// ============================================================

type TabId =
  | 'providers'
  | 'appearance'
  | 'ai-settings'
  | 'mcp'
  | 'skills'
  | 'shortcuts'
  | 'presets'
  | 'data'
  | 'language';

const activeTab = ref<TabId>('providers');

const navItems: { id: TabId; labelKey: string; icon: string }[] = [
  { id: 'providers', labelKey: 'nav.providers', icon: 'cpu' },
  { id: 'appearance', labelKey: 'nav.appearance', icon: 'palette' },
  { id: 'ai-settings', labelKey: 'nav.aiSettings', icon: 'sliders' },
  { id: 'mcp', labelKey: 'nav.mcp', icon: 'network' },
  { id: 'skills', labelKey: 'nav.skills', icon: 'zap' },
  { id: 'shortcuts', labelKey: 'nav.shortcuts', icon: 'keyboard' },
  { id: 'presets', labelKey: 'nav.presets', icon: 'bolt' },
  { id: 'data', labelKey: 'nav.data', icon: 'database' },
  { id: 'language', labelKey: 'nav.language', icon: 'globe' },
];

// ============================================================
// Theme & Language
// ============================================================

const currentTheme = ref<ThemeMode>('system');
const currentLanguage = ref<Language>('en');

async function changeTheme(mode: ThemeMode) {
  currentTheme.value = mode;
  await setThemeMode(mode);
  applyTheme(mode);
}

async function changeLanguage(lang: Language) {
  currentLanguage.value = lang;
  await setLanguage(lang);
}

// ============================================================
// Provider Management
// ============================================================

const providers = ref<StoredProvider[]>([]);
const showAddProvider = ref(false);
const editingProvider = ref<StoredProvider | null>(null);
const loadingModels = ref(false);
const activeProviderId = ref<string | null>(null);
const saveToast = ref<string | null>(null);
let saveToastTimer: ReturnType<typeof setTimeout> | null = null;

function showSaveToast(message: string): void {
  if (saveToastTimer) clearTimeout(saveToastTimer);
  saveToast.value = message;
  saveToastTimer = setTimeout(() => {
    saveToast.value = null;
    saveToastTimer = null;
  }, 2000);
}

function validateProviderForm(p: StoredProvider): string | null {
  if (!p.name.trim()) return 'Provider name is required';
  if (!p.baseUrl.trim()) return 'Base URL is required';
  if (!p.apiKey.trim()) return 'API Key is required';
  try {
    new URL(p.baseUrl);
  } catch {
    return 'Base URL must be a valid URL';
  }
  return null;
}

const providerTypes: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'zhipu', label: 'Zhipu' },
  { value: 'custom', label: 'Custom' },
];

const emptyProvider = (): StoredProvider => ({
  id: crypto.randomUUID(),
  name: '',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  models: [],
  selectedModel: '',
  visionModels: [],
});

const formProvider = ref<StoredProvider>(emptyProvider());
const manualModelId = ref('');
const fetchModelError = ref<string | null>(null);

function startAddProvider() {
  formProvider.value = emptyProvider();
  editingProvider.value = null;
  manualModelId.value = '';
  fetchModelError.value = null;
  showAddProvider.value = true;
}

function startEditProvider(provider: StoredProvider) {
  // Deep clone to preserve existing models list and avoid reactive proxy issues
  formProvider.value = JSON.parse(JSON.stringify(provider));
  editingProvider.value = provider;
  manualModelId.value = '';
  fetchModelError.value = null;
  showAddProvider.value = true;
}

function cancelEdit() {
  showAddProvider.value = false;
  editingProvider.value = null;
}

async function saveProviderForm() {
  const p = formProvider.value;
  const validationError = validateProviderForm(p);
  if (validationError) {
    showSaveToast(validationError);
    return;
  }

  // Auto-select first model if none selected but models exist
  if (p.models.length > 0 && !p.selectedModel) {
    p.selectedModel = p.models[0];
  }

  // Deep clone to strip Vue reactive proxy before persisting
  const plainProvider: StoredProvider = JSON.parse(JSON.stringify(p));

  await saveProvider(plainProvider);
  providers.value = await getAllProviders();
  showAddProvider.value = false;
  editingProvider.value = null;
  showSaveToast('Provider saved successfully');
}

async function removeProvider(id: string) {
  if (!confirm(i18n(currentLanguage.value, 'providers.deleteConfirm'))) return;
  await deleteProviderFromStorage(id);
  providers.value = await getAllProviders();
  if (activeProviderId.value === id) {
    activeProviderId.value = null;
  }
}

async function fetchModelsForProvider() {
  loadingModels.value = true;
  fetchModelError.value = null;
  try {
    const models = await fetchModels(formProvider.value.baseUrl, formProvider.value.apiKey);
    if (models.length === 0) {
      fetchModelError.value = 'No models found. The provider may not support the /models endpoint. You can add models manually below.';
      return;
    }
    // Merge fetched models with existing ones (avoid duplicates)
    const existingSet = new Set(formProvider.value.models);
    for (const m of models) {
      if (!existingSet.has(m.id)) {
        formProvider.value.models.push(m.id);
        existingSet.add(m.id);
      }
    }
    if (models.length > 0 && !formProvider.value.selectedModel) {
      formProvider.value.selectedModel = models[0].id;
    }
    fetchModelError.value = null;
  } catch (error) {
    console.error('Failed to fetch models:', error);
    fetchModelError.value = `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`;
  } finally {
    loadingModels.value = false;
  }
}

async function activateProvider(id: string) {
  await setActiveProviderId(id);
  activeProviderId.value = id;
}

function updateBaseUrlFromType() {
  const typeBaseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    deepseek: 'https://api.deepseek.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v1',
    custom: '',
  };
  formProvider.value.baseUrl = typeBaseUrls[formProvider.value.type] || '';
}

function toggleModelVision(model: string) {
  const idx = formProvider.value.visionModels.indexOf(model);
  if (idx >= 0) {
    formProvider.value.visionModels.splice(idx, 1);
  } else {
    formProvider.value.visionModels.push(model);
  }
}

function addManualModel() {
  const id = manualModelId.value.trim();
  if (!id) return;
  if (!formProvider.value.models.includes(id)) {
    formProvider.value.models.push(id);
    if (!formProvider.value.selectedModel) {
      formProvider.value.selectedModel = id;
    }
  }
  manualModelId.value = '';
}

function removeModel(model: string) {
  const idx = formProvider.value.models.indexOf(model);
  if (idx >= 0) {
    formProvider.value.models.splice(idx, 1);
  }
  // Also remove from visionModels if present
  const vIdx = formProvider.value.visionModels.indexOf(model);
  if (vIdx >= 0) {
    formProvider.value.visionModels.splice(vIdx, 1);
  }
  // If the removed model was selected, select the first remaining model
  if (formProvider.value.selectedModel === model) {
    formProvider.value.selectedModel = formProvider.value.models.length > 0 ? formProvider.value.models[0] : '';
  }
}

// ============================================================
// Appearance
// ============================================================

const fontScale = ref(1.0);
const floatingBallEnabled = ref(true);
const selectionQuoteEnabled = ref(true);

async function changeFontScale() {
  await setFontScale(fontScale.value);
}

async function changeFloatingBall() {
  await setFloatingBallEnabled(floatingBallEnabled.value);
}

async function changeSelectionQuote() {
  await setSelectionQuoteEnabled(selectionQuoteEnabled.value);
}

// ============================================================
// AI Settings
// ============================================================

const pageContentMaxLength = ref(30000);
const maxToolCallsPerTurn = ref(10);
const rawExtractionSites = ref<string[]>([]);
const newSiteInput = ref('');

async function changePageContentMaxLength() {
  await setPageContentMaxLength(pageContentMaxLength.value);
}

async function changeMaxToolCalls() {
  await setMaxToolCallsPerTurn(maxToolCallsPerTurn.value);
}

async function addRawExtractionSite() {
  const site = newSiteInput.value.trim();
  if (!site) return;
  if (!rawExtractionSites.value.includes(site)) {
    rawExtractionSites.value.push(site);
    await setRawExtractionSites(rawExtractionSites.value);
  }
  newSiteInput.value = '';
}

async function removeRawExtractionSite(index: number) {
  rawExtractionSites.value.splice(index, 1);
  await setRawExtractionSites(rawExtractionSites.value);
}

// ============================================================
// MCP Servers
// ============================================================

const mcpServers = ref<McpServer[]>([]);
const showMcpForm = ref(false);
const editingMcpServer = ref<McpServer | null>(null);
const mcpConnecting = ref(false);
const mcpTestResult = ref<{ success: boolean; message: string; toolCount: number } | null>(null);

const emptyMcpServer = (): McpServer => ({
  id: generateMcpServerId(),
  name: '',
  url: '',
  enabled: true,
  authType: 'none',
  authToken: '',
});

const formMcpServer = ref<McpServer>(emptyMcpServer());

function startAddMcpServer() {
  formMcpServer.value = emptyMcpServer();
  editingMcpServer.value = null;
  mcpTestResult.value = null;
  showMcpForm.value = true;
}

function startEditMcpServer(server: McpServer) {
  formMcpServer.value = { ...server };
  editingMcpServer.value = server;
  mcpTestResult.value = null;
  showMcpForm.value = true;
}

function cancelMcpForm() {
  showMcpForm.value = false;
  editingMcpServer.value = null;
  mcpTestResult.value = null;
}

async function saveMcpServerForm() {
  const s = formMcpServer.value;
  if (!s.name || !s.url) {
    showSaveToast('Server name and URL are required');
    return;
  }
  try {
    new URL(s.url);
  } catch {
    showSaveToast('Server URL must be a valid URL');
    return;
  }
  await saveMcpServer(s);
  mcpServers.value = await getMcpServers();
  showMcpForm.value = false;
  editingMcpServer.value = null;
  mcpTestResult.value = null;
  showSaveToast('MCP server saved successfully');
}

async function removeMcpServer(id: string) {
  if (!confirm(i18n(currentLanguage.value, 'mcp.deleteConfirm'))) return;
  try {
    await mcpManager.disconnect(id);
  } catch {
    // Ignore
  }
  await deleteMcpServerFromStorage(id);
  mcpServers.value = await getMcpServers();
}

async function toggleMcpServerEnabled(server: McpServer) {
  await toggleMcpServer(server.id, !server.enabled);
  server.enabled = !server.enabled;
  mcpServers.value = await getMcpServers();
}

async function testMcpConnection() {
  mcpConnecting.value = true;
  mcpTestResult.value = null;
  try {
    const tools = await mcpManager.connect(formMcpServer.value);
    mcpTestResult.value = {
      success: true,
      message: `Connected successfully`,
      toolCount: tools.length,
    };
    // Disconnect after test
    await mcpManager.disconnect(formMcpServer.value.id);
  } catch (error) {
    mcpTestResult.value = {
      success: false,
      message: error instanceof Error ? error.message : i18n(currentLanguage.value, 'mcp.connectionFailed'),
      toolCount: 0,
    };
  } finally {
    mcpConnecting.value = false;
  }
}

// ============================================================
// Skills
// ============================================================

const skills = ref<Skill[]>([]);
const skillImporting = ref(false);
const skillViewDetail = ref<Skill | null>(null);

async function refreshSkills() {
  skills.value = await getAllSkills();
}

async function handleSkillImport(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  skillImporting.value = true;
  try {
    await importSkill(input.files);
    await refreshSkills();
  } catch (error) {
    alert(`Failed to import skill: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    skillImporting.value = false;
    input.value = '';
  }
}

async function removeSkill(id: string) {
  if (!confirm(i18n(currentLanguage.value, 'skills.deleteConfirm'))) return;
  await deleteSkillFromDb(id);
  await refreshSkills();
}

function viewSkillDetail(skill: Skill) {
  skillViewDetail.value = skill;
}

// ============================================================
// Shortcuts
// ============================================================

const shortcuts = ref<ShortcutBinding[]>([]);
const rebindingAction = ref<string | null>(null);

async function resetShortcuts() {
  if (!confirm(i18n(currentLanguage.value, 'shortcuts.resetConfirm'))) return;
  shortcuts.value = getDefaultShortcuts();
  await saveShortcuts(shortcuts.value);
}

function startRebind(action: string) {
  rebindingAction.value = action;
}

function handleShortcutKeydown(event: KeyboardEvent) {
  if (!rebindingAction.value) return;
  event.preventDefault();
  event.stopPropagation();

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');

  const key = event.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }

  if (parts.length > 0 && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    const binding = parts.join('+');
    const idx = shortcuts.value.findIndex((s) => s.action === rebindingAction.value);
    if (idx >= 0) {
      shortcuts.value[idx].key = binding;
      saveShortcuts(shortcuts.value);
    }
    rebindingAction.value = null;
  }
}

// ============================================================
// Preset Quick Actions
// ============================================================

const presets = ref<PresetAction[]>([]);
const showPresetForm = ref(false);
const editingPreset = ref<PresetAction | null>(null);

const emptyPreset = (): PresetAction => ({
  id: crypto.randomUUID(),
  name: '',
  content: '',
});

const formPreset = ref<PresetAction>(emptyPreset());

function startAddPreset() {
  formPreset.value = emptyPreset();
  editingPreset.value = null;
  showPresetForm.value = true;
}

function startEditPreset(preset: PresetAction) {
  formPreset.value = { ...preset };
  editingPreset.value = preset;
  showPresetForm.value = true;
}

function cancelPresetForm() {
  showPresetForm.value = false;
  editingPreset.value = null;
}

async function savePresetForm() {
  const p = formPreset.value;
  if (!p.name || !p.content) return;

  const idx = presets.value.findIndex((pr) => pr.id === p.id);
  if (idx >= 0) {
    presets.value[idx] = { ...p };
  } else {
    presets.value.push({ ...p });
  }

  await savePresetActions(presets.value);
  showPresetForm.value = false;
  editingPreset.value = null;
}

async function removePreset(id: string) {
  presets.value = presets.value.filter((p) => p.id !== id);
  await savePresetActions(presets.value);
}

async function movePresetUp(index: number) {
  if (index <= 0) return;
  const temp = presets.value[index];
  presets.value[index] = presets.value[index - 1];
  presets.value[index - 1] = temp;
  await savePresetActions(presets.value);
}

async function movePresetDown(index: number) {
  if (index >= presets.value.length - 1) return;
  const temp = presets.value[index];
  presets.value[index] = presets.value[index + 1];
  presets.value[index + 1] = temp;
  await savePresetActions(presets.value);
}

// ============================================================
// Data Management
// ============================================================

const dataExporting = ref(false);
const dataImporting = ref(false);
const importPreviewData = ref<ImportPreview | null>(null);
const importFileData = ref<ExportData | null>(null);

async function exportAllAsJson() {
  dataExporting.value = true;
  try {
    const data = await exportAllSessions();
    downloadAsJson(data);
  } catch (error) {
    alert(i18n(currentLanguage.value, 'data.exportFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
  } finally {
    dataExporting.value = false;
  }
}

async function exportAllAsZip() {
  dataExporting.value = true;
  try {
    const { getAllSessions } = await import('../../utils/db');
    const sessions = await getAllSessions();
    if (sessions.length === 0) {
      alert(i18n(currentLanguage.value, 'data.noSessionsExport'));
      return;
    }
    await downloadMultipleAsZip(sessions);
  } catch (error) {
    alert(i18n(currentLanguage.value, 'data.exportFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
  } finally {
    dataExporting.value = false;
  }
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  dataImporting.value = true;
  try {
    const data = await readImportFile(file);
    const validation = validateImportData(data);
    if (!validation.valid) {
      alert(`${i18n(currentLanguage.value, 'data.invalidFile')}:\n${validation.errors.join('\n')}`);
      return;
    }
    importFileData.value = data;
    importPreviewData.value = previewImport(data);
  } catch (error) {
    alert(i18n(currentLanguage.value, 'data.failedRead', { error: error instanceof Error ? error.message : 'Unknown error' }));
  } finally {
    dataImporting.value = false;
    input.value = '';
  }
}

async function confirmImport(mode: 'merge' | 'replace') {
  if (!importFileData.value) return;

  const confirmMsg =
    mode === 'replace'
      ? i18n(currentLanguage.value, 'data.replaceConfirm')
      : i18n(currentLanguage.value, 'data.mergeConfirm');

  if (!confirm(confirmMsg)) return;

  dataImporting.value = true;
  try {
    const count = await importSessions(importFileData.value, mode);
    alert(i18n(currentLanguage.value, 'data.importSuccess', { count }));
    importFileData.value = null;
    importPreviewData.value = null;
  } catch (error) {
    alert(i18n(currentLanguage.value, 'data.importFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
  } finally {
    dataImporting.value = false;
  }
}

function cancelImport() {
  importFileData.value = null;
  importPreviewData.value = null;
}

async function clearAllData() {
  if (!confirm(i18n(currentLanguage.value, 'data.clearConfirm1'))) return;
  if (!confirm(i18n(currentLanguage.value, 'data.clearConfirm2'))) return;

  const sessions = await getAllSessions();
  for (const s of sessions) {
    await deleteSession(s.id);
  }
  alert(i18n(currentLanguage.value, 'data.cleared'));
}

// ============================================================
// Lifecycle
// ============================================================

onMounted(async () => {
  // Providers
  providers.value = await getAllProviders();
  activeProviderId.value = await getActiveProviderId();

  // Theme & language
  currentTheme.value = await getThemeMode();
  applyTheme(currentTheme.value);
  currentLanguage.value = await getLanguage();

  // Appearance
  fontScale.value = await getFontScale();
  floatingBallEnabled.value = await getFloatingBallEnabled();
  selectionQuoteEnabled.value = await getSelectionQuoteEnabled();

  // AI settings
  pageContentMaxLength.value = await getPageContentMaxLength();
  maxToolCallsPerTurn.value = await getMaxToolCallsPerTurn();
  rawExtractionSites.value = await getRawExtractionSites();

  // MCP
  mcpServers.value = await getMcpServers();
  watchMcpServers((servers) => {
    mcpServers.value = servers;
  });

  // Skills
  await refreshSkills();

  // Shortcuts
  shortcuts.value = await getShortcuts();

  // Presets
  presets.value = await getPresetActions();
});
</script>

<template>
  <div class="options-page" @keydown="handleShortcutKeydown">
    <!-- Toast notification -->
    <div v-if="saveToast" class="options-toast">
      {{ saveToast }}
    </div>

    <!-- Sidebar -->
    <nav class="sidebar">
      <div class="sidebar-logo">
        <h2>Nexus</h2>
        <span class="sidebar-version">{{ i18n(currentLanguage, 'options.settings') }}</span>
      </div>
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: activeTab === item.id }"
        @click="activeTab = item.id"
      >
        {{ i18n(currentLanguage, item.labelKey) }}
      </button>
    </nav>

    <!-- Content -->
    <main class="content">
      <!-- ==================== Providers ==================== -->
      <div v-if="activeTab === 'providers'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'providers.title') }}</h1>
          <button class="btn-primary" @click="startAddProvider">{{ i18n(currentLanguage, 'providers.add') }}</button>
        </div>

        <div class="provider-list">
          <div v-if="providers.length === 0" class="empty-state">
            <p>{{ i18n(currentLanguage, 'providers.noProviders') }}</p>
          </div>

          <div
            v-for="provider in providers"
            :key="provider.id"
            class="provider-card"
            :class="{ active: activeProviderId === provider.id }"
          >
            <div class="provider-info">
              <div class="provider-header">
                <span class="provider-name">{{ provider.name }}</span>
                <span class="provider-type-badge">{{ provider.type }}</span>
                <span v-if="activeProviderId === provider.id" class="provider-active-badge">{{ i18n(currentLanguage, 'options.active') }}</span>
              </div>
              <div class="provider-details">
                <span>{{ i18n(currentLanguage, 'providers.model') }}: {{ provider.selectedModel || i18n(currentLanguage, 'providers.none') }}</span>
                <span>Base URL: {{ provider.baseUrl }}</span>
              </div>
            </div>
            <div class="provider-actions">
              <button
                v-if="activeProviderId !== provider.id"
                class="btn-secondary"
                @click="activateProvider(provider.id)"
              >
                {{ i18n(currentLanguage, 'options.activate') }}
              </button>
              <button class="btn-ghost" @click="startEditProvider(provider)">{{ i18n(currentLanguage, 'options.edit') }}</button>
              <button class="btn-danger" @click="removeProvider(provider.id)">{{ i18n(currentLanguage, 'options.delete') }}</button>
            </div>
          </div>
        </div>

        <!-- Add/Edit Provider Modal -->
        <div v-if="showAddProvider" class="modal-overlay" @click="cancelEdit">
          <div class="modal" @click.stop>
            <h2>{{ editingProvider ? i18n(currentLanguage, 'providers.edit') : i18n(currentLanguage, 'providers.add') }}</h2>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'providers.name') }}</label>
              <input v-model="formProvider.name" type="text" :placeholder="i18n(currentLanguage, 'providers.namePlaceholder')" />
            </div>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'providers.type') }}</label>
              <select v-model="formProvider.type" @change="updateBaseUrlFromType">
                <option v-for="pt in providerTypes" :key="pt.value" :value="pt.value">
                  {{ pt.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'providers.baseUrl') }}</label>
              <input v-model="formProvider.baseUrl" type="text" placeholder="https://api.openai.com/v1" />
            </div>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'providers.apiKey') }}</label>
              <input v-model="formProvider.apiKey" type="password" placeholder="sk-..." />
            </div>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'providers.models') }}</label>
              <div class="model-input-row">
                <input
                  v-model="formProvider.selectedModel"
                  type="text"
                  :placeholder="i18n(currentLanguage, 'providers.selectedModel')"
                  class="model-input"
                />
                <button
                  class="btn-secondary"
                  :disabled="loadingModels || !formProvider.baseUrl || !formProvider.apiKey"
                  @click="fetchModelsForProvider"
                >
                  {{ loadingModels ? i18n(currentLanguage, 'options.loading') : i18n(currentLanguage, 'providers.fetchModels') }}
                </button>
              </div>
              <div v-if="fetchModelError" class="fetch-model-error">
                {{ fetchModelError }}
              </div>
              <div class="manual-model-row">
                <input
                  v-model="manualModelId"
                  type="text"
                  placeholder="Enter model ID manually..."
                  class="model-input"
                  @keydown.enter.prevent="addManualModel"
                />
                <button class="btn-secondary" @click="addManualModel" :disabled="!manualModelId.trim()">Add</button>
              </div>
              <div v-if="formProvider.models.length > 0" class="model-tags">
                <div
                  v-for="model in formProvider.models"
                  :key="model"
                  class="model-tag"
                  :class="{ selected: formProvider.selectedModel === model }"
                  @click="formProvider.selectedModel = model"
                >
                  <span class="model-tag-name" @click="formProvider.selectedModel = model">{{ model }}</span>
                  <span
                    class="vision-toggle"
                    :class="{ active: formProvider.visionModels.includes(model) }"
                    @click.stop="toggleModelVision(model)"
                    :title="i18n(currentLanguage, 'providers.vision')"
                  >V</span>
                  <button class="model-tag-remove" @click.stop="removeModel(model)" :title="'Remove model'">&times;</button>
                </div>
              </div>
            </div>

            <div class="form-actions">
              <button class="btn-ghost" @click="cancelEdit">{{ i18n(currentLanguage, 'options.cancel') }}</button>
              <button class="btn-primary" @click="saveProviderForm">{{ i18n(currentLanguage, 'options.save') }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Appearance ==================== -->
      <div v-if="activeTab === 'appearance'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'appearance.title') }}</h1>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'appearance.theme') }}</h3>
          <div class="theme-options">
            <button
              v-for="mode in (['light', 'dark', 'system'] as ThemeMode[])"
              :key="mode"
              class="theme-btn"
              :class="{ active: currentTheme === mode }"
              @click="changeTheme(mode)"
            >
              {{ i18n(currentLanguage, `appearance.${mode}`) }}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'appearance.fontScale') }}</h3>
          <div class="slider-row">
            <input
              type="range"
              min="0.8"
              max="1.4"
              step="0.1"
              v-model.number="fontScale"
              @change="changeFontScale"
              class="slider"
            />
            <span class="slider-value">{{ fontScale.toFixed(1) }}x</span>
          </div>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'appearance.floatingBall') }}</h3>
          <label class="toggle-label">
            <input type="checkbox" v-model="floatingBallEnabled" @change="changeFloatingBall" />
            <span>{{ i18n(currentLanguage, 'appearance.floatingBallDesc') }}</span>
          </label>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'appearance.selectionQuote') }}</h3>
          <label class="toggle-label">
            <input type="checkbox" v-model="selectionQuoteEnabled" @change="changeSelectionQuote" />
            <span>{{ i18n(currentLanguage, 'appearance.selectionQuoteDesc') }}</span>
          </label>
        </div>
      </div>

      <!-- ==================== AI Settings ==================== -->
      <div v-if="activeTab === 'ai-settings'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'aiSettings.title') }}</h1>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'aiSettings.pageContentMax') }}</h3>
          <p class="setting-desc">{{ i18n(currentLanguage, 'aiSettings.pageContentDesc') }}</p>
          <div class="slider-row">
            <input
              type="range"
              min="10000"
              max="100000"
              step="5000"
              v-model.number="pageContentMaxLength"
              @change="changePageContentMaxLength"
              class="slider"
            />
            <span class="slider-value">{{ (pageContentMaxLength / 1000).toFixed(0) }}k</span>
          </div>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'aiSettings.maxToolCalls') }}</h3>
          <p class="setting-desc">{{ i18n(currentLanguage, 'aiSettings.maxToolCallsDesc') }}</p>
          <div class="number-input-row">
            <input
              type="number"
              min="1"
              max="100"
              v-model.number="maxToolCallsPerTurn"
              @change="changeMaxToolCalls"
              class="number-input"
            />
          </div>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'aiSettings.rawExtractSites') }}</h3>
          <p class="setting-desc">{{ i18n(currentLanguage, 'aiSettings.rawExtractDesc') }}</p>
          <div class="list-editor">
            <div v-for="(site, index) in rawExtractionSites" :key="index" class="list-item">
              <span class="list-item-text">{{ site }}</span>
              <button class="list-item-remove" @click="removeRawExtractionSite(index)">&times;</button>
            </div>
            <div class="list-add-row">
              <input
                v-model="newSiteInput"
                type="text"
                placeholder="e.g., example.com"
                class="list-add-input"
                @keydown.enter="addRawExtractionSite"
              />
              <button class="btn-secondary" @click="addRawExtractionSite">{{ i18n(currentLanguage, 'aiSettings.addSite') }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== MCP Servers ==================== -->
      <div v-if="activeTab === 'mcp'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'mcp.title') }}</h1>
          <button class="btn-primary" @click="startAddMcpServer">{{ i18n(currentLanguage, 'mcp.add') }}</button>
        </div>

        <div class="provider-list">
          <div v-if="mcpServers.length === 0" class="empty-state">
            <p>{{ i18n(currentLanguage, 'mcp.noServers') }}</p>
          </div>

          <div v-for="server in mcpServers" :key="server.id" class="provider-card">
            <div class="provider-info">
              <div class="provider-header">
                <span class="provider-name">{{ server.name }}</span>
                <span class="mcp-status-dot" :class="{ connected: server.enabled }"></span>
                <span class="provider-type-badge">{{ server.authType }}</span>
                <label class="toggle-mini">
                  <input
                    type="checkbox"
                    :checked="server.enabled"
                    @change="toggleMcpServerEnabled(server)"
                  />
                </label>
              </div>
              <div class="provider-details">
                <span>{{ i18n(currentLanguage, 'mcp.url') }}: {{ server.url }}</span>
              </div>
            </div>
            <div class="provider-actions">
              <button class="btn-ghost" @click="startEditMcpServer(server)">{{ i18n(currentLanguage, 'options.edit') }}</button>
              <button class="btn-danger" @click="removeMcpServer(server.id)">{{ i18n(currentLanguage, 'options.delete') }}</button>
            </div>
          </div>
        </div>

        <!-- Add/Edit MCP Modal -->
        <div v-if="showMcpForm" class="modal-overlay" @click="cancelMcpForm">
          <div class="modal" @click.stop>
            <h2>{{ editingMcpServer ? i18n(currentLanguage, 'mcp.edit') : i18n(currentLanguage, 'mcp.add') }}</h2>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'mcp.serverName') }}</label>
              <input v-model="formMcpServer.name" type="text" placeholder="e.g., My MCP Server" />
            </div>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'mcp.serverUrl') }}</label>
              <input v-model="formMcpServer.url" type="text" placeholder="http://localhost:3000/mcp" />
            </div>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'mcp.auth') }}</label>
              <select v-model="formMcpServer.authType">
                <option value="none">{{ i18n(currentLanguage, 'mcp.authNone') }}</option>
                <option value="bearer">{{ i18n(currentLanguage, 'mcp.authBearer') }}</option>
                <option value="oauth">{{ i18n(currentLanguage, 'mcp.authOAuth') }}</option>
              </select>
            </div>

            <div v-if="formMcpServer.authType === 'bearer'" class="form-group">
              <label>{{ i18n(currentLanguage, 'mcp.authBearerToken') }}</label>
              <input v-model="formMcpServer.authToken" type="password" placeholder="Token..." />
            </div>

            <div class="form-actions">
              <button
                class="btn-secondary"
                :disabled="mcpConnecting || !formMcpServer.url"
                @click="testMcpConnection"
              >
                {{ mcpConnecting ? i18n(currentLanguage, 'mcp.testing') : i18n(currentLanguage, 'mcp.testConnection') }}
              </button>
              <button class="btn-ghost" @click="cancelMcpForm">{{ i18n(currentLanguage, 'options.cancel') }}</button>
              <button class="btn-primary" @click="saveMcpServerForm">{{ i18n(currentLanguage, 'options.save') }}</button>
            </div>

            <div v-if="mcpTestResult" class="test-result" :class="{ success: mcpTestResult.success, error: !mcpTestResult.success }">
              {{ mcpTestResult.message }}
              <span v-if="mcpTestResult.success"> ({{ i18n(currentLanguage, 'mcp.toolsDiscovered', { count: mcpTestResult.toolCount }) }})</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Skills ==================== -->
      <div v-if="activeTab === 'skills'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'skills.title') }}</h1>
          <label class="btn-primary import-btn">
            {{ i18n(currentLanguage, 'skills.import') }}
            <input
              type="file"
              accept=".zip,.json,.md"
              style="display: none"
              :disabled="skillImporting"
              @change="handleSkillImport"
            />
          </label>
        </div>

        <div class="provider-list">
          <div v-if="skills.length === 0" class="empty-state">
            <p>{{ i18n(currentLanguage, 'skills.noSkills') }}</p>
          </div>

          <div v-for="skill in skills" :key="skill.id" class="provider-card">
            <div class="provider-info">
              <div class="provider-header">
                <span class="provider-name">{{ skill.metadata.name }}</span>
                <span v-if="skill.metadata.version" class="provider-type-badge">v{{ skill.metadata.version }}</span>
                <span v-if="skill.metadata.author" class="provider-type-badge">{{ skill.metadata.author }}</span>
              </div>
              <div class="provider-details">
                <span>{{ skill.metadata.description }}</span>
                <span>{{ skill.scripts.length }} script(s), {{ skill.references.length }} reference(s)</span>
              </div>
            </div>
            <div class="provider-actions">
              <button class="btn-ghost" @click="viewSkillDetail(skill)">{{ i18n(currentLanguage, 'skills.details') }}</button>
              <button class="btn-danger" @click="removeSkill(skill.id)">{{ i18n(currentLanguage, 'options.delete') }}</button>
            </div>
          </div>
        </div>

        <!-- Skill detail modal -->
        <div v-if="skillViewDetail" class="modal-overlay" @click="skillViewDetail = null">
          <div class="modal" @click.stop>
            <h2>{{ skillViewDetail.metadata.name }}</h2>
            <p class="skill-detail-desc">{{ skillViewDetail.metadata.description }}</p>

            <div class="skill-section">
              <h4>{{ i18n(currentLanguage, 'skills.instructions') }}</h4>
              <pre class="skill-pre">{{ skillViewDetail.instructions }}</pre>
            </div>

            <div v-if="skillViewDetail.scripts.length > 0" class="skill-section">
              <h4>{{ i18n(currentLanguage, 'skills.scripts') }}</h4>
              <div v-for="script in skillViewDetail.scripts" :key="script.path" class="skill-file-item">
                {{ script.name }}
              </div>
            </div>

            <div v-if="skillViewDetail.references.length > 0" class="skill-section">
              <h4>{{ i18n(currentLanguage, 'skills.references') }}</h4>
              <div v-for="ref in skillViewDetail.references" :key="ref.path" class="skill-file-item">
                {{ ref.path }}
              </div>
            </div>

            <div class="form-actions">
              <button class="btn-ghost" @click="skillViewDetail = null">{{ i18n(currentLanguage, 'options.close') }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Shortcuts ==================== -->
      <div v-if="activeTab === 'shortcuts'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'shortcuts.title') }}</h1>
          <button class="btn-secondary" @click="resetShortcuts">{{ i18n(currentLanguage, 'shortcuts.resetDefaults') }}</button>
        </div>

        <div class="settings-section">
          <div v-for="shortcut in shortcuts" :key="shortcut.action" class="shortcut-item">
            <span class="shortcut-label">{{ shortcut.label }}</span>
            <button
              class="shortcut-key"
              :class="{ rebinding: rebindingAction === shortcut.action }"
              @click="startRebind(shortcut.action)"
            >
              <template v-if="rebindingAction === shortcut.action">{{ i18n(currentLanguage, 'shortcuts.pressKeys') }}</template>
              <template v-else>{{ shortcut.key }}</template>
            </button>
          </div>
        </div>
      </div>

      <!-- ==================== Quick Actions ==================== -->
      <div v-if="activeTab === 'presets'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'presets.title') }}</h1>
          <button class="btn-primary" @click="startAddPreset">{{ i18n(currentLanguage, 'presets.add') }}</button>
        </div>

        <div class="provider-list">
          <div v-if="presets.length === 0" class="empty-state">
            <p>{{ i18n(currentLanguage, 'presets.noPresets') }}</p>
          </div>

          <div v-for="(preset, index) in presets" :key="preset.id" class="provider-card">
            <div class="provider-info">
              <div class="provider-header">
                <span class="provider-name">{{ preset.name }}</span>
              </div>
              <div class="provider-details">
                <span class="preset-content">{{ preset.content }}</span>
              </div>
            </div>
            <div class="provider-actions">
              <button class="btn-ghost" @click="movePresetUp(index)" :disabled="index === 0">{{ i18n(currentLanguage, 'presets.moveUp') }}</button>
              <button class="btn-ghost" @click="movePresetDown(index)" :disabled="index === presets.length - 1">{{ i18n(currentLanguage, 'presets.moveDown') }}</button>
              <button class="btn-ghost" @click="startEditPreset(preset)">{{ i18n(currentLanguage, 'options.edit') }}</button>
              <button class="btn-danger" @click="removePreset(preset.id)">{{ i18n(currentLanguage, 'options.delete') }}</button>
            </div>
          </div>
        </div>

        <!-- Add/Edit Preset Modal -->
        <div v-if="showPresetForm" class="modal-overlay" @click="cancelPresetForm">
          <div class="modal" @click.stop>
            <h2>{{ editingPreset ? i18n(currentLanguage, 'presets.edit') : i18n(currentLanguage, 'presets.add') }}</h2>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'presets.name') }}</label>
              <input v-model="formPreset.name" type="text" :placeholder="i18n(currentLanguage, 'presets.namePlaceholder')" />
            </div>

            <div class="form-group">
              <label>{{ i18n(currentLanguage, 'presets.content') }}</label>
              <textarea
                v-model="formPreset.content"
                class="preset-textarea"
                :placeholder="i18n(currentLanguage, 'presets.contentPlaceholder')"
                rows="4"
              ></textarea>
            </div>

            <div class="form-actions">
              <button class="btn-ghost" @click="cancelPresetForm">{{ i18n(currentLanguage, 'options.cancel') }}</button>
              <button class="btn-primary" @click="savePresetForm">{{ i18n(currentLanguage, 'options.save') }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Data Management ==================== -->
      <div v-if="activeTab === 'data'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'data.title') }}</h1>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'data.export') }}</h3>
          <div class="btn-group">
            <button class="btn-secondary" :disabled="dataExporting" @click="exportAllAsJson">
              {{ i18n(currentLanguage, 'data.exportJson') }}
            </button>
            <button class="btn-secondary" :disabled="dataExporting" @click="exportAllAsZip">
              {{ i18n(currentLanguage, 'data.exportZip') }}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <h3>{{ i18n(currentLanguage, 'data.import') }}</h3>
          <div v-if="!importFileData">
            <label class="btn-secondary import-btn">
              {{ i18n(currentLanguage, 'data.selectFile') }}
              <input
                type="file"
                accept=".json"
                style="display: none"
                :disabled="dataImporting"
                @change="handleImportFile"
              />
            </label>
          </div>
          <div v-else class="import-preview">
            <div class="import-preview-stats">
              <span><strong>{{ importPreviewData?.sessionCount }}</strong> {{ i18n(currentLanguage, 'data.sessions') }}</span>
              <span><strong>{{ importPreviewData?.totalMessages }}</strong> {{ i18n(currentLanguage, 'data.messages') }}</span>
            </div>
            <div class="btn-group">
              <button class="btn-primary" @click="confirmImport('merge')">{{ i18n(currentLanguage, 'data.merge') }}</button>
              <button class="btn-danger" @click="confirmImport('replace')">{{ i18n(currentLanguage, 'data.replaceAll') }}</button>
              <button class="btn-ghost" @click="cancelImport">{{ i18n(currentLanguage, 'options.cancel') }}</button>
            </div>
          </div>
        </div>

        <div class="settings-section danger-zone">
          <h3>{{ i18n(currentLanguage, 'data.clearAll') }}</h3>
          <p class="setting-desc">{{ i18n(currentLanguage, 'data.clearAllDesc') }}</p>
          <button class="btn-danger" @click="clearAllData">{{ i18n(currentLanguage, 'data.clearAll') }}</button>
        </div>
      </div>

      <!-- ==================== Language ==================== -->
      <div v-if="activeTab === 'language'">
        <div class="content-header">
          <h1>{{ i18n(currentLanguage, 'language.title') }}</h1>
        </div>

        <div class="settings-section">
          <select v-model="currentLanguage" @change="changeLanguage(currentLanguage)" class="language-select">
            <option value="en">{{ i18n(currentLanguage, 'language.english') }}</option>
            <option value="zh-CN">{{ i18n(currentLanguage, 'language.chinese') }}</option>
          </select>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.options-page {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 220px;
  background: var(--color-bg-primary);
  border-right: 1px solid var(--color-border);
  padding: var(--spacing-lg) 0;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-logo {
  padding: 0 var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.sidebar-logo h2 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--color-accent);
}

.sidebar-version {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.nav-item {
  display: block;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.nav-item:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.nav-item.active {
  background: var(--color-bg-secondary);
  color: var(--color-accent);
  font-weight: 600;
}

.content {
  flex: 1;
  padding: var(--spacing-lg) var(--spacing-xl);
  max-width: 800px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.content-header h1 {
  font-size: var(--font-size-xl);
  font-weight: 700;
}

/* Buttons */
.btn-primary {
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.btn-primary:hover {
  background: var(--color-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.btn-secondary:hover {
  background: var(--color-bg-secondary);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-ghost {
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.btn-ghost:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.btn-danger {
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  background: transparent;
  color: var(--color-error);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.btn-danger:hover {
  background: rgba(255, 59, 48, 0.1);
}

.btn-group {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

/* Provider list */
.provider-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.provider-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.provider-card.active {
  border-color: var(--color-accent);
}

.provider-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
  flex: 1;
}

.provider-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.provider-name {
  font-weight: 600;
  font-size: var(--font-size-md);
}

.provider-type-badge {
  padding: 1px 6px;
  font-size: var(--font-size-xs);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
}

.provider-active-badge {
  padding: 1px 6px;
  font-size: var(--font-size-xs);
  background: var(--color-accent);
  color: white;
  border-radius: var(--radius-full);
}

.provider-details {
  display: flex;
  flex-direction: column;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.provider-actions {
  display: flex;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: var(--blur-frost);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  width: 520px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-lg);
}

.modal h2 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin-bottom: var(--spacing-md);
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-group label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: var(--color-accent);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.model-input-row {
  display: flex;
  gap: var(--spacing-sm);
}

.model-input {
  flex: 1;
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
}

.model-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.model-tag:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.model-tag.selected {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.vision-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.vision-toggle.active {
  background: var(--color-success);
  color: white;
}

/* MCP status indicator */
.mcp-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-error);
  flex-shrink: 0;
  transition: background 200ms ease;
}

.mcp-status-dot.connected {
  background: var(--color-success);
}

/* Settings sections */
.settings-section {
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.settings-section h3 {
  font-size: var(--font-size-md);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.setting-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}

/* Theme */
.theme-options {
  display: flex;
  gap: var(--spacing-sm);
}

.theme-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.theme-btn:hover {
  border-color: var(--color-accent);
}

.theme-btn.active {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

/* Slider */
.slider-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.slider {
  flex: 1;
  accent-color: var(--color-accent);
}

.slider-value {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-accent);
  min-width: 40px;
}

/* Toggle */
.toggle-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent);
}

.toggle-mini {
  display: inline-flex;
  align-items: center;
}

.toggle-mini input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent);
}

/* Number input */
.number-input-row {
  display: flex;
  align-items: center;
}

.number-input {
  width: 80px;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  outline: none;
  text-align: center;
}

.number-input:focus {
  border-color: var(--color-accent);
}

/* List editor */
.list-editor {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.list-item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-item-remove {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--color-error);
  font-size: 16px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.list-add-row {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xs);
}

.list-add-input {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  outline: none;
}

.list-add-input:focus {
  border-color: var(--color-accent);
}

/* Test result */
.test-result {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.test-result.success {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.test-result.error {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

/* Skills */
.import-btn {
  position: relative;
  cursor: pointer;
}

.skill-detail-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

.skill-section {
  margin-bottom: var(--spacing-md);
}

.skill-section h4 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.skill-pre {
  max-height: 200px;
  overflow-y: auto;
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

.skill-file-item {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* Shortcuts */
.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
}

.shortcut-item:last-child {
  border-bottom: none;
}

.shortcut-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.shortcut-key {
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 120px;
  text-align: center;
}

.shortcut-key:hover {
  border-color: var(--color-accent);
}

.shortcut-key.rebinding {
  border-color: var(--color-accent);
  color: var(--color-accent);
  animation: pulse-border 1s infinite;
}

@keyframes pulse-border {
  0%, 100% { border-color: var(--color-accent); }
  50% { border-color: transparent; }
}

/* Presets */
.preset-content {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-textarea {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  resize: vertical;
  min-height: 80px;
  outline: none;
}

.preset-textarea:focus {
  border-color: var(--color-accent);
}

/* Import preview */
.import-preview {
  padding: var(--spacing-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.import-preview-stats {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-sm);
}

/* Danger zone */
.danger-zone {
  border-color: var(--color-error);
}

.danger-zone h3 {
  color: var(--color-error);
}

/* Language */
.language-select {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  outline: none;
  min-width: 200px;
}

.language-select:focus {
  border-color: var(--color-accent);
}

.empty-state {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--color-text-secondary);
}

/* Toast notification */
.options-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--font-size-sm);
  z-index: 500;
  animation: options-toast-in 200ms ease, options-toast-out 200ms ease 1800ms forwards;
  max-width: 320px;
  pointer-events: none;
}

@keyframes options-toast-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes options-toast-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Manual model input row */
.manual-model-row {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xs);
}

/* Fetch model error */
.fetch-model-error {
  margin-top: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

/* Model tag with remove button */
.model-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.model-tag:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.model-tag.selected {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.model-tag-name {
  cursor: pointer;
}

.model-tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}

.model-tag-remove:hover {
  opacity: 1;
  color: var(--color-error);
}
</style>
