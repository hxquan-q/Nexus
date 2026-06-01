/**
 * Provider type definitions
 */

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'gemini-web'
  | 'deepseek'
  | 'openrouter'
  | 'qwen'
  | 'zhipu'
  | 'custom';

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  models: string[];
  selectedModel: string;
  visionModels: string[];
}

export interface ChatImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface ChatFileAttachment {
  id: string;
  name: string;
  format: string;
  text: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ChatImage[];
  fileAttachments?: ChatFileAttachment[];
  quote?: string;
  reasoning?: string;
  timestamp: number;
  reaction?: 'good' | 'bad';
}

export interface StreamEvent {
  type: 'content' | 'reasoning' | 'tool_call' | 'tool_result' | 'thinking' | 'done';
  content?: string;
  toolCall?: ToolCall;
  message?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  name: string;
  result: string;
  success: boolean;
}
