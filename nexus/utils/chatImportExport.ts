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
  const dateStr = new Date(session.createdAt).toLocaleString();
  lines.push(`**Date:** ${dateStr}`);
  if (session.providerId) {
    lines.push(`**Provider:** ${session.providerId}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of session.messages) {
    if (msg.content?.startsWith('__ERROR__:')) continue;

    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    const timestamp = new Date(msg.timestamp).toLocaleString();
    lines.push(`## ${role}`);
    lines.push(`*${timestamp}*`);
    lines.push('');

    // Images
    if (msg.images && msg.images.length > 0) {
      for (const img of msg.images) {
        lines.push(`![${img.name}](${img.name})`);
      }
      lines.push('');
    }

    // File attachments
    if (msg.fileAttachments && msg.fileAttachments.length > 0) {
      for (const file of msg.fileAttachments) {
        lines.push(`*Attached: ${file.name}*`);
      }
      lines.push('');
    }

    // Quote
    if (msg.quote) {
      lines.push(`> ${msg.quote}`);
      lines.push('');
    }

    // For user messages with file content, show only the display part
    let content = msg.content || '';
    if (msg.role === 'user' && msg.fileAttachments && msg.fileAttachments.length > 0) {
      const separatorIndex = content.indexOf('\n\n---\n\n');
      if (separatorIndex !== -1) {
        content = content.substring(0, separatorIndex).trim();
      }
    }

    if (content.trim()) {
      lines.push(content);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('');
  lines.push(`> Exported from Nexus on ${new Date().toLocaleString()}`);

  return lines.join('\n');
}

function sessionToHtml(session: ChatSession): string {
  const messagesHtml = session.messages
    .filter((msg) => !msg.content?.startsWith('__ERROR__:'))
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      const roleClass = msg.role === 'user' ? 'user' : 'assistant';
      const timestamp = new Date(msg.timestamp).toLocaleString();

      let content = escapeHtml(msg.content || '');

      // For user messages with file content, show only the display part
      if (msg.role === 'user' && msg.fileAttachments && msg.fileAttachments.length > 0) {
        const separatorIndex = content.indexOf('\n\n---\n\n');
        if (separatorIndex !== -1) {
          content = content.substring(0, separatorIndex).trim();
        }
      }

      // Convert markdown-style formatting to HTML for better rendering
      content = content
        // Code blocks
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // Headers
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        // Line breaks (after other replacements)
        .replace(/\n/g, '<br>');

      // Images
      let imagesHtml = '';
      if (msg.images && msg.images.length > 0) {
        imagesHtml = '<div class="message-images">' +
          msg.images.map((img) => `<img src="${escapeHtml(img.dataUrl)}" alt="${escapeHtml(img.name)}" class="chat-image" />`).join('') +
          '</div>';
      }

      // File attachments
      let filesHtml = '';
      if (msg.fileAttachments && msg.fileAttachments.length > 0) {
        filesHtml = '<div class="message-files">' +
          msg.fileAttachments.map((f) => `<span class="file-chip">${escapeHtml(f.name)}</span>`).join('') +
          '</div>';
      }

      // Quote
      let quoteHtml = '';
      if (msg.quote) {
        quoteHtml = `<blockquote class="message-quote">${escapeHtml(msg.quote)}</blockquote>`;
      }

      return `<div class="message ${roleClass}">
  <div class="message-header">
    <span class="message-role">${role}</span>
    <span class="message-time">${timestamp}</span>
  </div>
  ${imagesHtml}${filesHtml}${quoteHtml}
  <div class="message-content">${content}</div>
</div>`;
    }).join('\n');

  const dateStr = new Date(session.createdAt).toLocaleString();

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
      padding: 32px 24px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    @media print {
      body { padding: 0; max-width: 100%; }
      .message { break-inside: avoid; }
    }
    @media (max-width: 640px) {
      body { padding: 16px; }
      .message { padding: 12px; border-radius: 14px; }
    }
    .session-header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid #d2d2d7;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1d1d1f;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .session-meta {
      font-size: 14px;
      color: #86868b;
    }
    .message {
      margin-bottom: 20px;
      border-radius: 18px;
      padding: 16px 20px;
      max-width: 85%;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .user {
      background: #007aff;
      color: white;
      margin-left: auto;
      border-bottom-right-radius: 4px;
    }
    .assistant {
      background: #ffffff;
      color: #1d1d1f;
      border: 1px solid #e5e5ea;
      margin-right: auto;
      border-bottom-left-radius: 4px;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-size: 12px;
      opacity: 0.7;
    }
    .user .message-role {
      font-weight: 600;
      color: rgba(255,255,255,0.9);
    }
    .assistant .message-role {
      font-weight: 600;
      color: #86868b;
    }
    .message-time { font-variant-numeric: tabular-nums; }
    .message-content {
      font-size: 15px;
      line-height: 1.65;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .message-content h2 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
    .message-content h3 { font-size: 16px; font-weight: 600; margin: 14px 0 6px; }
    .message-content h4 { font-size: 15px; font-weight: 600; margin: 12px 0 4px; }
    .message-content code {
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace;
      font-size: 13px;
      background: rgba(0,0,0,0.06);
      padding: 2px 6px;
      border-radius: 6px;
    }
    .user .message-content code {
      background: rgba(255,255,255,0.2);
    }
    .message-content pre {
      background: #1d1d1f;
      color: #f5f5f7;
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
    }
    .message-content pre code {
      background: none;
      padding: 0;
      color: inherit;
      font-size: 13px;
    }
    .message-images {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .chat-image {
      max-width: 240px;
      max-height: 200px;
      border-radius: 10px;
      object-fit: cover;
    }
    .message-files {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .file-chip {
      display: inline-block;
      padding: 3px 10px;
      background: rgba(0,0,0,0.06);
      border-radius: 20px;
      font-size: 12px;
    }
    .user .file-chip { background: rgba(255,255,255,0.2); }
    .message-quote {
      border-left: 3px solid #d2d2d7;
      padding: 4px 12px;
      margin: 8px 0 12px;
      font-style: italic;
      color: #86868b;
    }
    .user .message-quote {
      border-left-color: rgba(255,255,255,0.4);
      color: rgba(255,255,255,0.8);
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #d2d2d7;
      font-size: 12px;
      color: #86868b;
    }
  </style>
</head>
<body>
  <div class="session-header">
    <h1>${escapeHtml(session.title)}</h1>
    <div class="session-meta">${dateStr}</div>
  </div>
  ${messagesHtml}
  <div class="footer">Exported from Nexus on ${new Date().toLocaleString()}</div>
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
