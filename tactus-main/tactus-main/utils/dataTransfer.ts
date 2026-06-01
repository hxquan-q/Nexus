/**
 * 数据导出与导入
 * 支持导出/导入所有用户数据（配置、历史记录、技能等）
 */

import {
  getAllProviders,
  getActiveProvider,
  setActiveProviderId,
  saveProvider,
  getTrustedScripts,
  trustScript,
  getThemeMode,
  setThemeMode,
  getUiFontScale,
  setUiFontScale,
  getAssistantDisplayMode,
  setAssistantDisplayMode,
  getAssistantWindowBounds,
  setAssistantWindowBounds,
  getLanguage,
  setLanguage,
  getFloatingBallEnabled,
  setFloatingBallEnabled,
  getSelectionQuoteEnabled,
  setSelectionQuoteEnabled,
  getRawExtractSites,
  setRawExtractSites,
  getMaxPageContentLength,
  setMaxPageContentLength,
  getMaxToolCalls,
  setMaxToolCalls,
  getPresetActions,
  setPresetActions,
  type AIProvider,
  type TrustedScript,
  type ThemeMode,
  type UiFontScale,
  type AssistantDisplayMode,
  type AssistantWindowBounds,
  type Language,
  type PresetAction,
} from './storage';

import {
  getAllSessions,
  getAllSkills,
  getSkillFiles,
  saveSkill,
  saveSkillFile,
  getDB,
  type ChatSession,
  type Skill,
  type SkillFile,
} from './db';

import {
  getAllMcpServers,
  saveMcpServer,
  type McpServerConfig,
} from './mcpStorage';

// ==================== 类型定义 ====================

const EXPORT_VERSION = 1;

export interface ExportData {
  version: number;
  exportedAt: number;
  data: {
    // WXT Storage 配置
    providers: AIProvider[];
    activeProviderId: string | null;
    trustedScripts: TrustedScript[];
    themeMode: ThemeMode;
    uiFontSize: UiFontScale;
    assistantDisplayMode: AssistantDisplayMode;
    assistantWindowBounds: AssistantWindowBounds;
    language: Language;
    floatingBallEnabled: boolean;
    selectionQuoteEnabled: boolean;
    rawExtractSites: string[];
    maxPageContentLength: number;
    maxToolCalls: number;
    presetActions: PresetAction[];
    mcpServers: McpServerConfig[];

    // IndexedDB 数据
    chatSessions: ChatSession[];
    skills: Skill[];
    skillFiles: ExportSkillFile[];
  };
}

/** SkillFile 的可序列化版本，content 使用 base64 */
interface ExportSkillFile {
  skillId: string;
  path: string;
  contentBase64: string;
  mimeType: string;
  size: number;
  isText: boolean;
}

export interface ImportResult {
  success: boolean;
  error?: string;
  stats?: {
    providers: number;
    chatSessions: number;
    skills: number;
    skillFiles: number;
    mcpServers: number;
    presetActions: number;
  };
}

// ==================== 导出 ====================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function exportAllData(): Promise<ExportData> {
  // 收集 WXT Storage 数据
  const [
    providers,
    activeProvider,
    trustedScripts,
    themeMode,
    uiFontSize,
    assistantDisplayMode,
    assistantWindowBounds,
    language,
    floatingBallEnabled,
    selectionQuoteEnabled,
    rawExtractSites,
    maxPageContentLength,
    maxToolCalls,
    presetActions,
    mcpServers,
  ] = await Promise.all([
    getAllProviders(),
    getActiveProvider(),
    getTrustedScripts(),
    getThemeMode(),
    getUiFontScale(),
    getAssistantDisplayMode(),
    getAssistantWindowBounds(),
    getLanguage(),
    getFloatingBallEnabled(),
    getSelectionQuoteEnabled(),
    getRawExtractSites(),
    getMaxPageContentLength(),
    getMaxToolCalls(),
    getPresetActions(),
    getAllMcpServers(),
  ]);

  // 收集 IndexedDB 数据
  const [chatSessions, skills] = await Promise.all([
    getAllSessions(),
    getAllSkills(),
  ]);

  // 收集所有 skill 的文件（ArrayBuffer → base64）
  const allSkillFiles: ExportSkillFile[] = [];
  for (const skill of skills) {
    const files = await getSkillFiles(skill.id);
    for (const file of files) {
      allSkillFiles.push({
        skillId: file.skillId,
        path: file.path,
        contentBase64: arrayBufferToBase64(file.content),
        mimeType: file.mimeType,
        size: file.size,
        isText: file.isText,
      });
    }
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    data: {
      providers,
      activeProviderId: activeProvider?.id ?? null,
      trustedScripts,
      themeMode,
      uiFontSize,
      assistantDisplayMode,
      assistantWindowBounds,
      language,
      floatingBallEnabled,
      selectionQuoteEnabled,
      rawExtractSites,
      maxPageContentLength,
      maxToolCalls,
      presetActions,
      mcpServers,
      chatSessions,
      skills,
      skillFiles: allSkillFiles,
    },
  };
}

/** 将导出数据下载为 JSON 文件 */
export function downloadExportData(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tactus-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== 导入 ====================

/** 验证导入数据的基本结构 */
function validateExportData(data: unknown): data is ExportData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'number') return false;
  if (typeof d.exportedAt !== 'number') return false;
  if (!d.data || typeof d.data !== 'object') return false;

  const inner = d.data as Record<string, unknown>;
  // 检查必要字段存在且类型正确
  if (!Array.isArray(inner.providers)) return false;
  if (!Array.isArray(inner.chatSessions)) return false;

  return true;
}

/** 从 JSON 文件读取导入数据 */
export function readImportFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        resolve(data);
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    };
    reader.onerror = () => reject(new Error('FILE_READ_ERROR'));
    reader.readAsText(file);
  });
}

/** 导入所有数据（覆盖式） */
export async function importAllData(raw: unknown): Promise<ImportResult> {
  if (!validateExportData(raw)) {
    return { success: false, error: 'INVALID_FORMAT' };
  }

  const { data } = raw;

  try {
    // 1. 导入 WXT Storage 配置
    // 清空旧 providers 后写入
    for (const provider of data.providers) {
      await saveProvider(provider);
    }
    if (data.activeProviderId) {
      await setActiveProviderId(data.activeProviderId);
    }

    // 信任脚本
    if (Array.isArray(data.trustedScripts)) {
      for (const ts of data.trustedScripts) {
        await trustScript(ts.skillId, ts.scriptName);
      }
    }

    // 通用设置
    if (data.themeMode) await setThemeMode(data.themeMode);
    if (data.uiFontSize !== undefined) await setUiFontScale(data.uiFontSize as any);
    if (data.assistantDisplayMode) await setAssistantDisplayMode(data.assistantDisplayMode);
    if (data.assistantWindowBounds) await setAssistantWindowBounds(data.assistantWindowBounds);
    if (data.language) await setLanguage(data.language);
    if (typeof data.floatingBallEnabled === 'boolean') await setFloatingBallEnabled(data.floatingBallEnabled);
    if (typeof data.selectionQuoteEnabled === 'boolean') await setSelectionQuoteEnabled(data.selectionQuoteEnabled);
    if (Array.isArray(data.rawExtractSites)) await setRawExtractSites(data.rawExtractSites);
    if (typeof data.maxPageContentLength === 'number') await setMaxPageContentLength(data.maxPageContentLength);
    if (typeof data.maxToolCalls === 'number') await setMaxToolCalls(data.maxToolCalls);
    if (Array.isArray(data.presetActions)) await setPresetActions(data.presetActions);

    // MCP 配置
    if (Array.isArray(data.mcpServers)) {
      for (const server of data.mcpServers) {
        await saveMcpServer(server);
      }
    }

    // 2. 导入 IndexedDB 数据
    const db = await getDB();

    // 聊天会话
    if (Array.isArray(data.chatSessions)) {
      for (const session of data.chatSessions) {
        await db.put('chatSessions', session);
      }
    }

    // Skills
    if (Array.isArray(data.skills)) {
      for (const skill of data.skills) {
        await saveSkill(skill);
      }
    }

    // Skill 文件（base64 → ArrayBuffer）
    if (Array.isArray(data.skillFiles)) {
      for (const ef of data.skillFiles) {
        const file: SkillFile = {
          skillId: ef.skillId,
          path: ef.path,
          content: base64ToArrayBuffer(ef.contentBase64),
          mimeType: ef.mimeType,
          size: ef.size,
          isText: ef.isText,
        };
        await saveSkillFile(file);
      }
    }

    return {
      success: true,
      stats: {
        providers: data.providers.length,
        chatSessions: data.chatSessions?.length ?? 0,
        skills: data.skills?.length ?? 0,
        skillFiles: data.skillFiles?.length ?? 0,
        mcpServers: data.mcpServers?.length ?? 0,
        presetActions: data.presetActions?.length ?? 0,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'UNKNOWN_ERROR',
    };
  }
}
