/**
 * MCP (Model Context Protocol) Client Manager
 * Supports HTTP/SSE transport with Bearer Token authentication
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================
// Types
// ============================================================

export type McpAuthType = 'none' | 'bearer' | 'oauth';

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  authType: McpAuthType;
  authToken?: string;
  headers?: Record<string, string>;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  success: boolean;
  content: string;
  isError?: boolean;
}

interface McpClientInstance {
  client: Client;
  transport: StreamableHTTPClientTransport;
  config: McpServer;
  tools: McpTool[];
  connected: boolean;
}

// ============================================================
// MCP Client Manager
// ============================================================

class McpClientManager {
  private clients: Map<string, McpClientInstance> = new Map();

  /**
   * Connect to an MCP server and discover its tools.
   */
  async connect(server: McpServer): Promise<McpTool[]> {
    // Disconnect existing connection if any
    if (this.clients.has(server.id)) {
      await this.disconnect(server.id);
    }

    const client = new Client({
      name: 'nexus-mcp-client',
      version: '1.0.0',
    });

    // Build transport options based on auth type
    const transportOptions: Record<string, unknown> = {};

    if (server.authType === 'bearer' && server.authToken) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${server.authToken}`,
      };
      if (server.headers) {
        Object.assign(headers, server.headers);
      }
      transportOptions.requestInit = { headers };
    } else if (server.headers && Object.keys(server.headers).length > 0) {
      transportOptions.requestInit = { headers: server.headers };
    }

    const transport = new StreamableHTTPClientTransport(
      new URL(server.url),
      transportOptions as ConstructorParameters<typeof StreamableHTTPClientTransport>[1],
    );

    try {
      await client.connect(transport);

      // Discover tools
      const toolsResult = await client.listTools();
      const tools: McpTool[] = (toolsResult.tools || []).map((tool: Tool) => ({
        serverId: server.id,
        serverName: server.name,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as McpTool['inputSchema'],
      }));

      this.clients.set(server.id, {
        client,
        transport,
        config: server,
        tools,
        connected: true,
      });

      return tools;
    } catch (error) {
      try {
        await client.close();
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server.
   */
  async disconnect(serverId: string): Promise<void> {
    const instance = this.clients.get(serverId);
    if (!instance) return;

    try {
      await instance.client.close();
    } catch (error) {
      console.error(`[MCP] Disconnect error (${serverId}):`, error);
    } finally {
      this.clients.delete(serverId);
    }
  }

  /**
   * Disconnect from all servers.
   */
  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.clients.keys());
    await Promise.all(serverIds.map((id) => this.disconnect(id)));
  }

  /**
   * Check if a server is connected.
   */
  isConnected(serverId: string): boolean {
    return this.clients.get(serverId)?.connected ?? false;
  }

  /**
   * Get all tools from all connected servers.
   */
  getAllTools(): McpTool[] {
    const tools: McpTool[] = [];
    for (const instance of this.clients.values()) {
      if (instance.connected) {
        tools.push(...instance.tools);
      }
    }
    return tools;
  }

  /**
   * Get tools from a specific server.
   */
  getServerTools(serverId: string): McpTool[] {
    return this.clients.get(serverId)?.tools ?? [];
  }

  /**
   * Call a tool on an MCP server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const instance = this.clients.get(serverId);
    if (!instance || !instance.connected) {
      return {
        success: false,
        content: `MCP Server "${serverId}" is not connected`,
        isError: true,
      };
    }

    try {
      const result = await instance.client.callTool({
        name: toolName,
        arguments: args,
      });

      const contents: string[] = [];
      const contentArray = Array.isArray(result.content) ? result.content : [];
      for (const item of contentArray) {
        if (item.type === 'text') {
          contents.push(item.text);
        } else if (item.type === 'image') {
          contents.push(`[Image: ${(item as { mimeType?: string }).mimeType || 'unknown'}]`);
        } else if (item.type === 'resource') {
          contents.push(`[Resource: ${(item as { uri?: string }).uri || 'unknown'}]`);
        }
      }

      return {
        success: !result.isError,
        content: contents.join('\n') || '(No content returned)',
        isError: result.isError as boolean | undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Tool call failed: ${message}`,
        isError: true,
      };
    }
  }

  /**
   * Refresh tools from a connected server.
   */
  async refreshTools(serverId: string): Promise<McpTool[]> {
    const instance = this.clients.get(serverId);
    if (!instance || !instance.connected) {
      throw new Error(`MCP Server "${serverId}" is not connected`);
    }

    const toolsResult = await instance.client.listTools();
    const tools: McpTool[] = (toolsResult.tools || []).map((tool: Tool) => ({
      serverId: instance.config.id,
      serverName: instance.config.name,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as McpTool['inputSchema'],
    }));

    instance.tools = tools;
    return tools;
  }

  /**
   * Get list of connected servers.
   */
  getConnectedServers(): McpServer[] {
    return Array.from(this.clients.values())
      .filter((instance) => instance.connected)
      .map((instance) => instance.config);
  }
}

// Singleton export
export const mcpManager = new McpClientManager();

// ============================================================
// Tool format conversion
// ============================================================

/**
 * Convert an MCP tool to OpenAI function calling format.
 * Tool names are prefixed with mcp__{serverId}__{toolName}.
 */
export function mcpToolToOpenAITool(tool: McpTool): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
} {
  const uniqueName = `mcp__${tool.serverId}__${tool.name}`;

  return {
    type: 'function',
    function: {
      name: uniqueName,
      description: `[MCP: ${tool.serverName}] ${tool.description || tool.name}`,
      parameters: {
        type: 'object',
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
    },
  };
}

/**
 * Parse a prefixed MCP tool name back to serverId + toolName.
 */
export function parseMcpToolName(
  uniqueName: string,
): { serverId: string; toolName: string } | null {
  if (!uniqueName.startsWith('mcp__')) {
    return null;
  }

  const parts = uniqueName.slice(5).split('__');
  if (parts.length < 2) {
    return null;
  }

  return {
    serverId: parts[0],
    toolName: parts.slice(1).join('__'),
  };
}

/**
 * Check if a tool name is an MCP tool.
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__');
}
