/**
 * Chat import/export utilities
 * Supports JSON, Markdown, HTML, and ZIP (multi-session) export formats
 */

import JSZip from 'jszip';
import { getAllSessions, deleteSession, updateSession, type ChatSession } from './db';
import type { ChatMessage } from './providers/types';

// ============================================================
// Types
// ============================================================

export interface ExportData {
  version: string;
  exportedAt: number;
  sessions: ExportedSession[];
}

export interface ExportedSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  providerId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImportPreview {
  sessionCount: number;
  dateRange: { earliest: number; latest: number };
  totalMessages: number;
}

// ============================================================
// Export helpers
// ============================================================

const EXPORT_VERSION = '1.0.0';

/**
 * Export specific sessions by ID, or all if no IDs provided.
 */
export async function exportSessions(sessionIds?: string[]): Promise<ExportData> {
  const allSessions = await getAllSessions();
  const sessions = sessionIds
    ? allSessions.filter((s) => sessionIds.includes(s.id))
    : allSessions;

  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      messages: s.messages,
      providerId: s.providerId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
}

/**
 * Export all sessions.
 */
export async function exportAllSessions(): Promise<ExportData> {
  return exportSessions();
}

/**
 * Trigger download of JSON data as a file.
 */
export function downloadAsJson(data: ExportData, filename?: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, filename || `nexus-export-${formatDateForFilename(data.exportedAt)}.json`);
}

/**
 * Export a single session as readable Markdown.
 */
export function downloadAsMarkdown(session: ChatSession): void {
  const md = sessionToMarkdown(session);
  const blob = new Blob([md], { type: 'text/markdown' });
  triggerDownload(blob, `${sanitizeFilename(session.title)}.md`);
}

/**
 * Export a single session as styled HTML.
 */
export function downloadAsHtml(session: ChatSession): void {
  const html = sessionToHtml(session);
  const blob = new Blob([html], { type: 'text/html' });
  triggerDownload(blob, `${sanitizeFilename(session.title)}.html`);
}

/**
 * Export multiple sessions as a ZIP file containing JSON + individual Markdown files.
 */
export async function downloadMultipleAsZip(sessions: ChatSession[]): Promise<void> {
  const zip = new JSZip();

  // Add full JSON export
  const exportData: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      messages: s.messages,
      providerId: s.providerId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  };
  zip.file('nexus-export.json', JSON.stringify(exportData, null, 2));

  // Add individual Markdown files
  const mdFolder = zip.folder('sessions');
  if (mdFolder) {
    for (const session of sessions) {
      const md = sessionToMarkdown(session);
      mdFolder.file(`${sanitizeFilename(session.title)}.md`, md);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `nexus-export-${formatDateForFilename(Date.now())}.zip`);
}

// ============================================================
// Import helpers
// ============================================================

/**
 * Validate imported JSON data structure.
 */
export function validateImportData(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Import data is not a valid object'] };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== 'string') {
    errors.push('Missing or invalid "version" field');
  }

  if (typeof obj.exportedAt !== 'number') {
    errors.push('Missing or invalid "exportedAt" field');
  }

  if (!Array.isArray(obj.sessions)) {
    errors.push('Missing or invalid "sessions" field (must be an array)');
    return { valid: false, errors };
  }

  const sessions = obj.sessions as unknown[];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i] as Record<string, unknown>;
    if (!s.id || typeof s.id !== 'string') {
      errors.push(`Session ${i}: missing or invalid "id"`);
    }
    if (!s.title || typeof s.title !== 'string') {
      errors.push(`Session ${i}: missing or invalid "title"`);
    }
    if (!Array.isArray(s.messages)) {
      errors.push(`Session ${i}: missing or invalid "messages"`);
    }
    if (typeof s.createdAt !== 'number') {
      errors.push(`Session ${i}: missing or invalid "createdAt"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a preview of the import data.
 */
export function previewImport(data: ExportData): ImportPreview {
  const timestamps = data.sessions.map((s) => s.createdAt);
  const totalMessages = data.sessions.reduce(
    (sum, s) => sum + (s.messages?.length || 0),
    0,
  );

  return {
    sessionCount: data.sessions.length,
    dateRange: {
      earliest: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      latest: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    },
    totalMessages,
  };
}

/**
 * Import sessions from export data.
 * Merge mode: adds imported sessions alongside existing ones.
 * Replace mode: deletes all existing sessions, then imports.
 */
export async function importSessions(
  data: ExportData,
  mode: 'merge' | 'replace',
): Promise<number> {
  if (mode === 'replace') {
    // Delete all existing sessions
    const existing = await getAllSessions();
    for (const s of existing) {
      await deleteSession(s.id);
    }
  }

  // Import sessions with new IDs to avoid conflicts
  let imported = 0;
  for (const session of data.sessions) {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: session.title,
      messages: session.messages || [],
      providerId: session.providerId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt || session.createdAt,
    };
    await updateSession(newSession);
    imported++;
  }

  return imported;
}

/**
 * Read and parse an import file (JSON).
 */
export function readImportFile(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        resolve(data as ExportData);
      } catch (error) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ============================================================
// Internal helpers
// ============================================================

function sessionToMarkdown(session: ChatSession): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push('');
  lines.push(`> Exported from Nexus on ${new Date().toLocaleString()}`);
  lines.push('');

  for (const msg of session.messages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    const timestamp = new Date(msg.timestamp).toLocaleString();
    lines.push(`## ${role} (${timestamp})`);
    lines.push('');

    // Replace image references with placeholder
    let content = msg.content || '';
    if (msg.images && msg.images.length > 0) {
      for (const img of msg.images) {
        lines.push(`[image: ${img.name}]`);
      }
      lines.push('');
    }

    lines.push(content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function sessionToHtml(session: ChatSession): string {
  const messagesHtml = session.messages.map((msg) => {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    const roleClass = msg.role === 'user' ? 'user' : 'assistant';
    const timestamp = new Date(msg.timestamp).toLocaleString();
    const content = escapeHtml(msg.content || '');

    return `<div class="message ${roleClass}">
  <div class="message-header">
    <span class="message-role">${role}</span>
    <span class="message-time">${timestamp}</span>
  </div>
  <div class="message-content">${content.replace(/\n/g, '<br>')}</div>
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(session.title)} - Nexus Export</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 24px; }
    .message { margin-bottom: 16px; border-radius: 12px; padding: 16px; }
    .user { background: #007aff; color: white; }
    .assistant { background: #f0f0f5; }
    .message-header { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; opacity: 0.8; }
    .message-content { font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(session.title)}</h1>
  ${messagesHtml}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
}

function formatDateForFilename(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
