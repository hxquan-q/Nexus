/**
 * Provider adapters - map each provider type to OpenAI-compatible params
 */

import type { AIProvider, ProviderType } from './types';

export interface AdapterConfig {
  baseURL: string;
  headers: Record<string, string>;
  model: string;
}

/**
 * Resolve base URL: if it ends with '/', use as-is; if it doesn't end with /v1, append /v1.
 */
function resolveBaseUrl(baseUrl: string): string {
  const url = baseUrl.trim();
  if (!url) return url;
  if (url.endsWith('/')) return url;
  if (/\/v1$/i.test(url)) return url;
  return `${url}/v1`;
}

/**
 * Get the adapter config for a given provider.
 */
export function getAdapterConfig(provider: AIProvider): AdapterConfig {
  const headers: Record<string, string> = {};
  let baseURL: string;

  switch (provider.type) {
    case 'anthropic':
      baseURL = resolveBaseUrl(provider.baseUrl);
      headers['x-api-key'] = provider.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      break;

    case 'gemini':
      baseURL = provider.baseUrl.trim();
      if (!baseURL.endsWith('/')) {
        baseURL += '/';
      }
      break;

    case 'deepseek':
      baseURL = resolveBaseUrl(provider.baseUrl);
      break;

    case 'openrouter':
      baseURL = resolveBaseUrl(provider.baseUrl);
      headers['HTTP-Referer'] = 'https://nexus.local';
      headers['X-Title'] = 'Nexus';
      break;

    case 'qwen':
      baseURL = resolveBaseUrl(provider.baseUrl);
      break;

    case 'zhipu':
      baseURL = resolveBaseUrl(provider.baseUrl);
      break;

    case 'custom':
    case 'openai':
    default:
      baseURL = resolveBaseUrl(provider.baseUrl);
      break;
  }

  return {
    baseURL,
    headers,
    model: provider.selectedModel,
  };
}

/**
 * Check if a provider type supports the OpenAI streaming format natively.
 */
export function isOpenAICompatible(type: ProviderType): boolean {
  return !['anthropic', 'gemini'].includes(type);
}

/**
 * Get provider display name by type.
 */
export function getProviderTypeName(type: ProviderType): string {
  const names: Record<ProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    'gemini-web': 'Gemini Web',
    deepseek: 'DeepSeek',
    openrouter: 'OpenRouter',
    qwen: 'Qwen',
    zhipu: 'Zhipu',
    custom: 'Custom',
  };
  return names[type] || type;
}
