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
  type Language,
  type PresetAction,
  type ShortcutBinding,
} from '../../utils/storage';
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

const navItems: { id: TabId; label: string; icon: string }[] = [
  { id: 'providers', label: 'Providers', icon: 'cpu' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'ai-settings', label: 'AI Settings', icon: 'sliders' },
  { id: 'mcp', label: 'MCP Servers', icon: 'network' },
  { id: 'skills', label: 'Skills', icon: 'zap' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
  { id: 'presets', label: 'Quick Actions', icon: 'bolt' },
  { id: 'data', label: 'Data', icon: 'database' },
  { id: 'language', label: 'Language', icon: 'globe' },
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

function startAddProvider() {
  formProvider.value = emptyProvider();
  editingProvider.value = null;
  showAddProvider.value = true;
}

function startEditProvider(provider: StoredProvider) {
  formProvider.value = { ...provider };
  editingProvider.value = provider;
  showAddProvider.value = true;
}

function cancelEdit() {
  showAddProvider.value = false;
  editingProvider.value = null;
}

async function saveProviderForm() {
  const p = formProvider.value;
  if (!p.name || !p.baseUrl || !p.apiKey) return;

  if (p.models.length > 0 && !p.selectedModel) {
    p.selectedModel = p.models[0];
  }

  await saveProvider(p);
  providers.value = await getAllProviders();
  showAddProvider.value = false;
  editingProvider.value = null;
}

async function removeProvider(id: string) {
  if (!confirm('Delete this provider?')) return;
  await deleteProviderFromStorage(id);
  providers.value = await getAllProviders();
  if (activeProviderId.value === id) {
    activeProviderId.value = null;
  }
}

async function fetchModelsForProvider() {
  loadingModels.value = true;
  try {
    const models = await fetchModels(formProvider.value.baseUrl, formProvider.value.apiKey);
    formProvider.value.models = models.map((m) => m.id);
    if (models.length > 0 && !formProvider.value.selectedModel) {
      formProvider.value.selectedModel = models[0].id;
    }
  } catch (error) {
    console.error('Failed to fetch models:', error);
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
  if (!s.name || !s.url) return;
  await saveMcpServer(s);
  mcpServers.value = await getMcpServers();
  showMcpForm.value = false;
  editingMcpServer.value = null;
  mcpTestResult.value = null;
}

async function removeMcpServer(id: string) {
  if (!confirm('Delete this MCP server?')) return;
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
      message: error instanceof Error ? error.message : 'Connection failed',
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
  if (!confirm('Delete this skill?')) return;
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
  if (!confirm('Reset all shortcuts to defaults?')) return;
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
    alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      alert('No sessions to export');
      return;
    }
    await downloadMultipleAsZip(sessions);
  } catch (error) {
    alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      alert(`Invalid import file:\n${validation.errors.join('\n')}`);
      return;
    }
    importFileData.value = data;
    importPreviewData.value = previewImport(data);
  } catch (error) {
    alert(`Failed to read import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    dataImporting.value = false;
    input.value = '';
  }
}

async function confirmImport(mode: 'merge' | 'replace') {
  if (!importFileData.value) return;

  const confirmMsg =
    mode === 'replace'
      ? 'This will DELETE all existing chats and replace with imported data. Are you sure?'
      : 'This will add imported chats alongside your existing ones. Continue?';

  if (!confirm(confirmMsg)) return;

  dataImporting.value = true;
  try {
    const count = await importSessions(importFileData.value, mode);
    alert(`Successfully imported ${count} session(s)`);
    importFileData.value = null;
    importPreviewData.value = null;
  } catch (error) {
    alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    dataImporting.value = false;
  }
}

function cancelImport() {
  importFileData.value = null;
  importPreviewData.value = null;
}

async function clearAllData() {
  if (!confirm('This will permanently delete ALL your chat history. Are you sure?')) return;
  if (!confirm('This action cannot be undone. Really delete everything?')) return;

  const sessions = await getAllSessions();
  for (const s of sessions) {
    await deleteSession(s.id);
  }
  alert('All chat data has been cleared.');
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
    <!-- Sidebar -->
    <nav class="sidebar">
      <div class="sidebar-logo">
        <h2>Nexus</h2>
        <span class="sidebar-version">Settings</span>
      </div>
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: activeTab === item.id }"
        @click="activeTab = item.id"
      >
        {{ item.label }}
      </button>
    </nav>

    <!-- Content -->
    <main class="content">
      <!-- ==================== Providers ==================== -->
      <div v-if="activeTab === 'providers'">
        <div class="content-header">
          <h1>AI Providers</h1>
          <button class="btn-primary" @click="startAddProvider">Add Provider</button>
        </div>

        <div class="provider-list">
          <div v-if="providers.length === 0" class="empty-state">
            <p>No providers configured. Add one to get started.</p>
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
                <span v-if="activeProviderId === provider.id" class="provider-active-badge">Active</span>
              </div>
              <div class="provider-details">
                <span>Model: {{ provider.selectedModel || 'None' }}</span>
                <span>Base URL: {{ provider.baseUrl }}</span>
              </div>
            </div>
            <div class="provider-actions">
              <button
                v-if="activeProviderId !== provider.id"
                class="btn-secondary"
                @click="activateProvider(provider.id)"
              >
                Activate
              </button>
              <button class="btn-ghost" @click="startEditProvider(provider)">Edit</button>
              <button class="btn-danger" @click="removeProvider(provider.id)">Delete</button>
            </div>
          </div>
        </div>

        <!-- Add/Edit Provider Modal -->
        <div v-if="showAddProvider" class="modal-overlay" @click="cancelEdit">
          <div class="modal" @click.stop>
            <h2>{{ editingProvider ? 'Edit Provider' : 'Add Provider' }}</h2>

            <div class="form-group">
              <label>Name</label>
              <input v-model="formProvider.name" type="text" placeholder="e.g., My OpenAI" />
            </div>

            <div class="form-group">
              <label>Type</label>
              <select v-model="formProvider.type" @change="updateBaseUrlFromType">
                <option v-for="pt in providerTypes" :key="pt.value" :value="pt.value">
                  {{ pt.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>Base URL</label>
              <input v-model="formProvider.baseUrl" type="text" placeholder="https://api.openai.com/v1" />
            </div>

            <div class="form-group">
              <label>API Key</label>
              <input v-model="formProvider.apiKey" type="password" placeholder="sk-..." />
            </div>

            <div class="form-group">
              <label>Models</label>
              <div class="model-input-row">
                <input
                  v-model="formProvider.selectedModel"
                  type="text"
                  placeholder="Model ID (e.g., gpt-4o)"
                  class="model-input"
                />
                <button
                  class="btn-secondary"
                  :disabled="loadingModels || !formProvider.baseUrl || !formProvider.apiKey"
                  @click="fetchModelsForProvider"
                >
                  {{ loadingModels ? 'Loading...' : 'Fetch' }}
                </button>
              </div>
              <div v-if="formProvider.models.length > 0" class="model-tags">
                <button
                  v-for="model in formProvider.models"
                  :key="model"
                  class="model-tag"
                  :class="{ selected: formProvider.selectedModel === model }"
                  @click="formProvider.selectedModel = model"
                >
                  <span>{{ model }}</span>
                  <span
                    class="vision-toggle"
                    :class="{ active: formProvider.visionModels.includes(model) }"
                    @click.stop="toggleModelVision(model)"
                    title="Toggle vision support"
                  >V</span>
                </button>
              </div>
            </div>

            <div class="form-actions">
              <button class="btn-ghost" @click="cancelEdit">Cancel</button>
              <button class="btn-primary" @click="saveProviderForm">Save</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Appearance ==================== -->
      <div v-if="activeTab === 'appearance'">
        <div class="content-header">
          <h1>Appearance</h1>
        </div>

        <div class="settings-section">
          <h3>Theme</h3>
          <div class="theme-options">
            <button
              v-for="mode in (['light', 'dark', 'system'] as ThemeMode[])"
              :key="mode"
              class="theme-btn"
              :class="{ active: currentTheme === mode }"
              @click="changeTheme(mode)"
            >
              {{ mode.charAt(0).toUpperCase() + mode.slice(1) }}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <h3>UI Font Scale</h3>
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
          <h3>Floating Ball</h3>
          <label class="toggle-label">
            <input type="checkbox" v-model="floatingBallEnabled" @change="changeFloatingBall" />
            <span>Show floating trigger ball on pages</span>
          </label>
        </div>

        <div class="settings-section">
          <h3>Selection Quote</h3>
          <label class="toggle-label">
            <input type="checkbox" v-model="selectionQuoteEnabled" @change="changeSelectionQuote" />
            <span>Enable text selection quote in sidepanel</span>
          </label>
        </div>
      </div>

      <!-- ==================== AI Settings ==================== -->
      <div v-if="activeTab === 'ai-settings'">
        <div class="content-header">
          <h1>AI Settings</h1>
        </div>

        <div class="settings-section">
          <h3>Page Content Max Length</h3>
          <p class="setting-desc">Maximum characters to extract from web pages.</p>
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
          <h3>Max Tool Calls Per Turn</h3>
          <p class="setting-desc">Maximum number of tool calls the AI can make in a single response.</p>
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
          <h3>Raw Extraction Sites</h3>
          <p class="setting-desc">Sites where Readability is bypassed for content extraction.</p>
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
              <button class="btn-secondary" @click="addRawExtractionSite">Add</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== MCP Servers ==================== -->
      <div v-if="activeTab === 'mcp'">
        <div class="content-header">
          <h1>MCP Servers</h1>
          <button class="btn-primary" @click="startAddMcpServer">Add Server</button>
        </div>

        <div class="provider-list">
          <div v-if="mcpServers.length === 0" class="empty-state">
            <p>No MCP servers configured.</p>
          </div>

          <div v-for="server in mcpServers" :key="server.id" class="provider-card">
            <div class="provider-info">
              <div class="provider-header">
                <span class="provider-name">{{ server.name }}</span>
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
                <span>URL: {{ server.url }}</span>
              </div>
            </div>
            <div class="provider-actions">
              <button class="btn-ghost" @click="startEditMcpServer(server)">Edit</button>
              <button class="btn-danger" @click="removeMcpServer(server.id)">Delete</button>
            </div>
          </div>
        </div>

        <!-- Add/Edit MCP Modal -->
        <div v-if="showMcpForm" class="modal-overlay" @click="cancelMcpForm">
          <div class="modal" @click.stop>
            <h2>{{ editingMcpServer ? 'Edit MCP Server' : 'Add MCP Server' }}</h2>

            <div class="form-group">
              <label>Name</label>
              <input v-model="formMcpServer.name" type="text" placeholder="e.g., My MCP Server" />
            </div>

            <div class="form-group">
              <label>URL</label>
              <input v-model="formMcpServer.url" type="text" placeholder="http://localhost:3000/mcp" />
            </div>

            <div class="form-group">
              <label>Authentication</label>
              <select v-model="formMcpServer.authType">
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="oauth">OAuth 2.1</option>
              </select>
            </div>

            <div v-if="formMcpServer.authType === 'bearer'" class="form-group">
              <label>Bearer Token</label>
              <input v-model="formMcpServer.authToken" type="password" placeholder="Token..." />
            </div>

            <div class="form-actions">
              <button
                class="btn-secondary"
                :disabled="mcpConnecting || !formMcpServer.url"
                @click="testMcpConnection"
              >
                {{ mcpConnecting ? 'Testing...' : 'Test Connection' }}
              </button>
              <button class="btn-ghost" @click="cancelMcpForm">Cancel</button>
              <button class="btn-primary" @click="saveMcpServerForm">Save</button>
            </div>

            <div v-if="mcpTestResult" class="test-result" :class="{ success: mcpTestResult.success, error: !mcpTestResult.success }">
              {{ mcpTestResult.message }}
              <span v-if="mcpTestResult.success"> ({{ mcpTestResult.toolCount }} tools discovered)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Skills ==================== -->
      <div v-if="activeTab === 'skills'">
        <div class="content-header">
          <h1>Agent Skills</h1>
          <label class="btn-primary import-btn">
            Import Skill (.zip)
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
            <p>No skills installed. Import a skill to get started.</p>
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
              <button class="btn-ghost" @click="viewSkillDetail(skill)">Details</button>
              <button class="btn-danger" @click="removeSkill(skill.id)">Delete</button>
            </div>
          </div>
        </div>

        <!-- Skill detail modal -->
        <div v-if="skillViewDetail" class="modal-overlay" @click="skillViewDetail = null">
          <div class="modal" @click.stop>
            <h2>{{ skillViewDetail.metadata.name }}</h2>
            <p class="skill-detail-desc">{{ skillViewDetail.metadata.description }}</p>

            <div class="skill-section">
              <h4>Instructions</h4>
              <pre class="skill-pre">{{ skillViewDetail.instructions }}</pre>
            </div>

            <div v-if="skillViewDetail.scripts.length > 0" class="skill-section">
              <h4>Scripts</h4>
              <div v-for="script in skillViewDetail.scripts" :key="script.path" class="skill-file-item">
                {{ script.name }}
              </div>
            </div>

            <div v-if="skillViewDetail.references.length > 0" class="skill-section">
              <h4>References</h4>
              <div v-for="ref in skillViewDetail.references" :key="ref.path" class="skill-file-item">
                {{ ref.path }}
              </div>
            </div>

            <div class="form-actions">
              <button class="btn-ghost" @click="skillViewDetail = null">Close</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Shortcuts ==================== -->
      <div v-if="activeTab === 'shortcuts'">
        <div class="content-header">
          <h1>Keyboard Shortcuts</h1>
          <button class="btn-secondary" @click="resetShortcuts">Reset to Defaults</button>
        </div>

        <div class="settings-section">
          <div v-for="shortcut in shortcuts" :key="shortcut.action" class="shortcut-item">
            <span class="shortcut-label">{{ shortcut.label }}</span>
            <button
              class="shortcut-key"
              :class="{ rebinding: rebindingAction === shortcut.action }"
              @click="startRebind(shortcut.action)"
            >
              <template v-if="rebindingAction === shortcut.action">Press keys...</template>
              <template v-else>{{ shortcut.key }}</template>
            </button>
          </div>
        </div>
      </div>

      <!-- ==================== Quick Actions ==================== -->
      <div v-if="activeTab === 'presets'">
        <div class="content-header">
          <h1>Quick Action Presets</h1>
          <button class="btn-primary" @click="startAddPreset">Add Preset</button>
        </div>

        <div class="provider-list">
          <div v-if="presets.length === 0" class="empty-state">
            <p>No quick action presets configured.</p>
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
              <button class="btn-ghost" @click="movePresetUp(index)" :disabled="index === 0">Up</button>
              <button class="btn-ghost" @click="movePresetDown(index)" :disabled="index === presets.length - 1">Down</button>
              <button class="btn-ghost" @click="startEditPreset(preset)">Edit</button>
              <button class="btn-danger" @click="removePreset(preset.id)">Delete</button>
            </div>
          </div>
        </div>

        <!-- Add/Edit Preset Modal -->
        <div v-if="showPresetForm" class="modal-overlay" @click="cancelPresetForm">
          <div class="modal" @click.stop>
            <h2>{{ editingPreset ? 'Edit Preset' : 'Add Preset' }}</h2>

            <div class="form-group">
              <label>Name</label>
              <input v-model="formPreset.name" type="text" placeholder="e.g., Summarize" />
            </div>

            <div class="form-group">
              <label>Prompt Content</label>
              <textarea
                v-model="formPreset.content"
                class="preset-textarea"
                placeholder="Enter the prompt text..."
                rows="4"
              ></textarea>
            </div>

            <div class="form-actions">
              <button class="btn-ghost" @click="cancelPresetForm">Cancel</button>
              <button class="btn-primary" @click="savePresetForm">Save</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== Data Management ==================== -->
      <div v-if="activeTab === 'data'">
        <div class="content-header">
          <h1>Data Management</h1>
        </div>

        <div class="settings-section">
          <h3>Export</h3>
          <div class="btn-group">
            <button class="btn-secondary" :disabled="dataExporting" @click="exportAllAsJson">
              Export as JSON
            </button>
            <button class="btn-secondary" :disabled="dataExporting" @click="exportAllAsZip">
              Export as ZIP
            </button>
          </div>
        </div>

        <div class="settings-section">
          <h3>Import</h3>
          <div v-if="!importFileData">
            <label class="btn-secondary import-btn">
              Select JSON File
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
              <span><strong>{{ importPreviewData?.sessionCount }}</strong> sessions</span>
              <span><strong>{{ importPreviewData?.totalMessages }}</strong> messages</span>
            </div>
            <div class="btn-group">
              <button class="btn-primary" @click="confirmImport('merge')">Merge</button>
              <button class="btn-danger" @click="confirmImport('replace')">Replace All</button>
              <button class="btn-ghost" @click="cancelImport">Cancel</button>
            </div>
          </div>
        </div>

        <div class="settings-section danger-zone">
          <h3>Clear All Data</h3>
          <p class="setting-desc">Permanently delete all chat history. This cannot be undone.</p>
          <button class="btn-danger" @click="clearAllData">Clear All Data</button>
        </div>
      </div>

      <!-- ==================== Language ==================== -->
      <div v-if="activeTab === 'language'">
        <div class="content-header">
          <h1>Language</h1>
        </div>

        <div class="settings-section">
          <select v-model="currentLanguage" @change="changeLanguage(currentLanguage)" class="language-select">
            <option value="en">English</option>
            <option value="zh-CN">Chinese (Simplified)</option>
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
</style>
