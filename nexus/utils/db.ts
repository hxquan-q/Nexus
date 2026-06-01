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

async function getDB(): Promise<IDBPDatabase<AppDBSchema>> {
  if (dbInstance) return dbInstance;

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
  const db = await getDB();
  const sessions = await db.getAllFromIndex('sessions', 'by-updatedAt');
  return sessions
    .map((s) => ({ ...s, messages: s.messages || [] }))
    .reverse();
}

export async function getSessionsPaginated(
  limit: number = 20,
  offset: number = 0,
): Promise<{ sessions: ChatSession[]; hasMore: boolean }> {
  const db = await getDB();
  const allSessions = await db.getAllFromIndex('sessions', 'by-updatedAt');
  const reversed = allSessions
    .map((s) => ({ ...s, messages: s.messages || [] }))
    .reverse();

  const sessions = reversed.slice(offset, offset + limit);
  const hasMore = offset + limit < reversed.length;

  return { sessions, hasMore };
}

export async function getSession(id: string): Promise<ChatSession | null> {
  const db = await getDB();
  const session = await db.get('sessions', id);
  return session || null;
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
  const db = await getDB();
  await db.put('sessions', session);
  return session;
}

export async function updateSession(session: ChatSession): Promise<void> {
  const db = await getDB();
  const updated = {
    ...session,
    messages: JSON.parse(JSON.stringify(session.messages || [])),
    updatedAt: Date.now(),
  };
  await db.put('sessions', updated);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sessions', id);
}

export async function generateSessionTitle(firstMessage: string): Promise<string> {
  const maxLen = 30;
  const title = firstMessage.replace(/\n/g, ' ').trim();
  return title.length > maxLen ? title.substring(0, maxLen) + '...' : title;
}
