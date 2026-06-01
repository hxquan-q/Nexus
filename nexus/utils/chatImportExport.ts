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

/**
 * Export a session as a shareable image-like HTML page.
 * Opens a clean, branded page in a new tab that the user can
 * screenshot, print-to-PDF, or share.
 */
export function exportAsImage(session: ChatSession): void {
  const html = sessionToShareableHtml(session);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  // Open in a new tab for screenshot / print
  const newTab = window.open(url, '_blank');
  if (!newTab) {
    // Fallback: trigger download if popup blocked
    triggerDownload(blob, `${sanitizeFilename(session.title)}-share.html`);
  } else {
    // Revoke after a delay so the page has time to load
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

function sessionToShareableHtml(session: ChatSession): string {
  const messagesHtml = session.messages
    .filter((msg) => !msg.content?.startsWith('__ERROR__:'))
    .map((msg) => {
      const role = msg.role === 'user' ? 'You' : 'Nexus';
      const roleClass = msg.role === 'user' ? 'user' : 'assistant';

      let content = escapeHtml(msg.content || '');

      // For user messages with file content, show only the display part
      if (msg.role === 'user' && msg.fileAttachments && msg.fileAttachments.length > 0) {
        const separatorIndex = content.indexOf('\n\n---\n\n');
        if (separatorIndex !== -1) {
          content = content.substring(0, separatorIndex).trim();
        }
      }

      // Convert markdown-style formatting to HTML
      content = content
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\n/g, '<br>');

      // Images
      let imagesHtml = '';
      if (msg.images && msg.images.length > 0) {
        imagesHtml = '<div class="msg-images">' +
          msg.images.map((img) => `<img src="${escapeHtml(img.dataUrl)}" alt="${escapeHtml(img.name)}" class="chat-img" />`).join('') +
          '</div>';
      }

      // File attachments
      let filesHtml = '';
      if (msg.fileAttachments && msg.fileAttachments.length > 0) {
        filesHtml = '<div class="msg-files">' +
          msg.fileAttachments.map((f) => `<span class="file-badge">${escapeHtml(f.name)}</span>`).join('') +
          '</div>';
      }

      // Quote
      let quoteHtml = '';
      if (msg.quote) {
        quoteHtml = `<blockquote class="msg-quote">${escapeHtml(msg.quote)}</blockquote>`;
      }

      return `<div class="msg ${roleClass}">
  <div class="msg-avatar">${role === 'You' ? '&#128100;' : '&#10024;'}</div>
  <div class="msg-body">
    <div class="msg-role">${role}</div>
    ${imagesHtml}${filesHtml}${quoteHtml}
    <div class="msg-content">${content}</div>
  </div>
</div>`;
    }).join('\n');

  const dateStr = new Date(session.createdAt).toLocaleString();
  const exportDate = new Date().toLocaleString();
  const msgCount = session.messages.filter((m) => !m.content?.startsWith('__ERROR__:')).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(session.title)} - Nexus Share</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #ffffff;
      color: #1d1d1f;
      max-width: 680px;
      margin: 0 auto;
      padding: 40px 24px 80px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    @media print {
      body { padding: 20px; }
      .print-bar { display: none; }
      .msg { break-inside: avoid; }
    }

    /* Print / action bar */
    .print-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #f5f5f7;
      border-top: 1px solid #d2d2d7;
      padding: 12px 24px;
      display: flex;
      justify-content: center;
      gap: 12px;
      z-index: 10;
    }
    .print-bar button {
      padding: 8px 20px;
      border: none;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
    }
    .btn-print {
      background: #007aff;
      color: #fff;
    }
    .btn-print:hover {
      background: #0056b3;
    }
    .btn-close {
      background: #e5e5ea;
      color: #1d1d1f;
    }
    .btn-close:hover {
      background: #d1d1d6;
    }

    /* Header */
    .share-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 28px;
      border-bottom: 1px solid #e5e5ea;
    }
    .share-brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .share-brand-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #007aff, #5856d6);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .share-brand-icon svg {
      display: block;
    }
    .share-brand-name {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #007aff, #5856d6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .share-title {
      font-size: 24px;
      font-weight: 700;
      color: #1d1d1f;
      letter-spacing: -0.3px;
      margin-bottom: 8px;
    }
    .share-meta {
      font-size: 13px;
      color: #86868b;
    }

    /* Messages */
    .msg {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      animation: msg-in 0.3s ease both;
    }
    @keyframes msg-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .msg-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
      background: #f5f5f7;
    }
    .assistant .msg-avatar {
      background: linear-gradient(135deg, #007aff20, #5856d620);
    }
    .msg-body {
      flex: 1;
      min-width: 0;
    }
    .msg-role {
      font-size: 13px;
      font-weight: 600;
      color: #86868b;
      margin-bottom: 4px;
    }
    .user .msg-role { color: #007aff; }
    .msg-content {
      font-size: 15px;
      line-height: 1.65;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .msg-content h2 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
    .msg-content h3 { font-size: 16px; font-weight: 600; margin: 14px 0 6px; }
    .msg-content h4 { font-size: 15px; font-weight: 600; margin: 12px 0 4px; }
    .msg-content code {
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace;
      font-size: 13px;
      background: #f5f5f7;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .msg-content pre {
      background: #1d1d1f;
      color: #f5f5f7;
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
    }
    .msg-content pre code {
      background: none;
      padding: 0;
      color: inherit;
    }
    .msg-images {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .chat-img {
      max-width: 220px;
      max-height: 180px;
      border-radius: 10px;
      object-fit: cover;
    }
    .msg-files {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .file-badge {
      display: inline-block;
      padding: 3px 10px;
      background: #f5f5f7;
      border-radius: 20px;
      font-size: 12px;
      color: #86868b;
    }
    .msg-quote {
      border-left: 3px solid #d2d2d7;
      padding: 4px 12px;
      margin: 8px 0 12px;
      font-style: italic;
      color: #86868b;
    }

    /* Footer */
    .share-footer {
      text-align: center;
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid #e5e5ea;
      font-size: 12px;
      color: #86868b;
    }

    @media (max-width: 640px) {
      body { padding: 24px 16px 80px; }
      .share-title { font-size: 20px; }
      .msg { gap: 8px; }
      .msg-avatar { width: 28px; height: 28px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="share-header">
    <div class="share-brand">
      <div class="share-brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <span class="share-brand-name">Nexus</span>
    </div>
    <h1 class="share-title">${escapeHtml(session.title)}</h1>
    <div class="share-meta">${dateStr} &middot; ${msgCount} messages</div>
  </div>
  ${messagesHtml}
  <div class="share-footer">
    Shared from Nexus &middot; ${exportDate}
  </div>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>
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
