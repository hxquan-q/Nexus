/**
 * MCP Server configuration storage
 * Uses @wxt-dev/storage for cross-page synchronization
 */

import { storage } from '@wxt-dev/storage';
import type { McpServer, McpAuthType } from './mcp';

// ============================================================
// Storage
// ============================================================

const mcpServersStorage = storage.defineItem<McpServer[]>('local:mcpServers', {
  fallback: [],
});

// ============================================================
// CRUD
// ============================================================

/**
 * Get all MCP server configurations.
 */
export async function getMcpServers(): Promise<McpServer[]> {
  return await mcpServersStorage.getValue();
}

/**
 * Get only enabled MCP server configurations.
 */
export async function getEnabledMcpServers(): Promise<McpServer[]> {
  const servers = await mcpServersStorage.getValue();
  return servers.filter((s) => s.enabled);
}

/**
 * Get a single MCP server by ID.
 */
export async function getMcpServer(id: string): Promise<McpServer | undefined> {
  const servers = await mcpServersStorage.getValue();
  return servers.find((s) => s.id === id);
}

/**
 * Save an MCP server configuration (create or update).
 */
export async function saveMcpServer(server: McpServer): Promise<void> {
  const servers = await mcpServersStorage.getValue();
  const index = servers.findIndex((s) => s.id === server.id);

  if (index >= 0) {
    servers[index] = server;
  } else {
    servers.push(server);
  }

  await mcpServersStorage.setValue(servers);
}

/**
 * Delete an MCP server configuration.
 */
export async function deleteMcpServer(id: string): Promise<void> {
  const servers = await mcpServersStorage.getValue();
  await mcpServersStorage.setValue(servers.filter((s) => s.id !== id));
}

/**
 * Toggle an MCP server's enabled state.
 */
export async function toggleMcpServer(id: string, enabled: boolean): Promise<void> {
  const servers = await mcpServersStorage.getValue();
  const server = servers.find((s) => s.id === id);

  if (server) {
    server.enabled = enabled;
    await mcpServersStorage.setValue(servers);
  }
}

/**
 * Generate a new MCP server ID.
 */
export function generateMcpServerId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// Watch
// ============================================================

/**
 * Watch for MCP server configuration changes.
 */
export function watchMcpServers(callback: (servers: McpServer[]) => void): () => void {
  return mcpServersStorage.watch((newValue) => {
    callback(newValue || []);
  });
}
