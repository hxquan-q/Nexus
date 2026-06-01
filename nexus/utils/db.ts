/**
 * IndexedDB session persistence using idb library
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChatMessage } from './providers/types';

// ============================================================
// Schema
// ============================================================

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  apiMessages?: ApiMessageRecord[];
  providerId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApiMessageRecord {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> | null;
  reasoning?: string | null;
}

interface AppDBSchema extends DBSchema {
  sessions: {
    key: string;
    value: ChatSession;
    indexes: { 'by-updatedAt': number };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

// ============================================================
// Database
// ============================================================

const DB_NAME = 'nexus-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<AppDBSchema> | null = null;
let dbInitError: string | null = null;

async function getDB(): Promise<IDBPDatabase<AppDBSchema>> {
  if (dbInitError) {
    throw new Error(`Database unavailable: ${dbInitError}`);
  }
  if (dbInstance) return dbInstance;

  try {
    dbInstance = await openDB<AppDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('by-updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    dbInitError = msg;
    throw new Error(`Failed to open database: ${msg}`);
  }

  return dbInstance;
}

// ============================================================
// Settings helpers
// ============================================================

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDB();
  const value = await db.get('settings', key);
  return value !== undefined ? (value as T) : fallback;
}

async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('settings', value, key);
}

// ============================================================
// Session CRUD
// ============================================================

export async function getAllSessions(): Promise<ChatSession[]> {
  try {
    const db = await getDB();
    const sessions = await db.getAllFromIndex('sessions', 'by-updatedAt');
    return sessions
      .map((s) => ({ ...s, messages: s.messages || [] }))
      .reverse();
  } catch (error) {
    console.error('[Nexus] Failed to load sessions:', error);
    return [];
  }
}

export async function getSessionsPaginated(
  limit: number = 20,
  offset: number = 0,
): Promise<{ sessions: ChatSession[]; hasMore: boolean }> {
  try {
    const db = await getDB();
    const allSessions = await db.getAllFromIndex('sessions', 'by-updatedAt');
    const reversed = allSessions
      .map((s) => ({ ...s, messages: s.messages || [] }))
      .reverse();

    const sessions = reversed.slice(offset, offset + limit);
    const hasMore = offset + limit < reversed.length;

    return { sessions, hasMore };
  } catch (error) {
    console.error('[Nexus] Failed to load paginated sessions:', error);
    return { sessions: [], hasMore: false };
  }
}

export async function getSession(id: string): Promise<ChatSession | null> {
  try {
    const db = await getDB();
    const session = await db.get('sessions', id);
    return session || null;
  } catch (error) {
    console.error(`[Nexus] Failed to load session ${id}:`, error);
    return null;
  }
}

export async function createSession(providerId?: string): Promise<ChatSession> {
  const session: ChatSession = {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    providerId,
  };
  try {
    const db = await getDB();
    await db.put('sessions', session);
  } catch (error) {
    console.error('[Nexus] Failed to create session:', error);
    // Check if storage is full
    if (error instanceof Error && (error.message.includes('QuotaExceeded') || error.message.includes('storage'))) {
      throw new Error('Storage is full. Please delete some chat history to continue.');
    }
    throw error;
  }
  return session;
}

export async function updateSession(session: ChatSession): Promise<void> {
  try {
    const db = await getDB();
    const updated = {
      ...session,
      messages: JSON.parse(JSON.stringify(session.messages || [])),
      updatedAt: Date.now(),
    };
    await db.put('sessions', updated);
  } catch (error) {
    console.error('[Nexus] Failed to update session:', error);
    if (error instanceof Error && (error.message.includes('QuotaExceeded') || error.message.includes('storage'))) {
      console.warn('[Nexus] Storage is full. Cannot save session updates.');
      throw new Error('Storage is full. Please delete some chat history.');
    }
    // Don't throw for other errors - partial saves are better than losing all data
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('sessions', id);
  } catch (error) {
    console.error(`[Nexus] Failed to delete session ${id}:`, error);
    throw error;
  }
}

export async function generateSessionTitle(firstMessage: string): Promise<string> {
  let title = firstMessage.replace(/\n/g, ' ').trim();

  // Strip code blocks
  title = title.replace(/```[\s\S]*?```/g, '');
  // Strip inline code
  title = title.replace(/`[^`]+`/g, '');
  // Strip markdown formatting (bold, italic, strikethrough, links)
  title = title.replace(/\*\*([^*]+)\*\*/g, '$1');
  title = title.replace(/\*([^*]+)\*/g, '$1');
  title = title.replace(/~~([^~]+)~~/g, '$1');
  title = title.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Strip URLs (replace with "Link")
  title = title.replace(/https?:\/\/[^\s)\]>]+/g, 'Link');
  // Strip markdown headers
  title = title.replace(/^#{1,6}\s+/gm, '');
  // Strip file attachment separators
  title = title.replace(/\n---\n/g, ' ');
  // Strip [Shared Page Content] and [File: ...] prefixes
  title = title.replace(/\[(?:Shared Page Content|File:[^\]]*)\]\s*/g, '');
  // Collapse whitespace
  title = title.replace(/\s+/g, ' ').trim();

  const maxLen = 50;
  if (title.length === 0) {
    return 'New Chat';
  }
  return title.length > maxLen ? title.substring(0, maxLen).trim() + '...' : title;
}
