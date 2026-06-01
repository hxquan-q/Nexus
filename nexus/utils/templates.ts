/**
 * Conversation templates / presets storage
 */

import { storage } from '@wxt-dev/storage';

export interface ChatTemplate {
  id: string;
  name: string;
  systemPrompt: string;
  icon: string;
}

const builtinTemplates: ChatTemplate[] = [
  {
    id: 'translator',
    name: 'Translation Assistant',
    systemPrompt: 'You are a professional translator. When the user provides text, translate it accurately while preserving the original tone and meaning. If the user specifies a target language, translate to that language. Otherwise, translate between English and Chinese based on the detected source language.',
    icon: 'translate',
  },
  {
    id: 'coder',
    name: 'Code Helper',
    systemPrompt: 'You are an expert programmer with deep knowledge of multiple programming languages and frameworks. Help the user write, debug, refactor, and explain code. Provide clear, well-commented solutions. When suggesting code, always include the full implementation without placeholders.',
    icon: 'code',
  },
  {
    id: 'writer',
    name: 'Writing Assistant',
    systemPrompt: 'You are a skilled writer and editor. Help the user draft, revise, and polish text for any purpose - emails, articles, reports, creative writing, and more. Adapt your tone and style to match the intended audience and purpose. Be concise and clear.',
    icon: 'edit',
  },
  {
    id: 'analyst',
    name: 'Analysis Expert',
    systemPrompt: 'You are an analytical expert. When presented with data, documents, or problems, provide thorough analysis with clear reasoning. Break down complex topics into understandable parts. Support your conclusions with evidence and logical argumentation.',
    icon: 'search',
  },
];

const templatesStorage = storage.defineItem<ChatTemplate[]>('local:chatTemplates', {
  fallback: [],
});

export async function getAllTemplates(): Promise<ChatTemplate[]> {
  const custom = await templatesStorage.getValue();
  return [...builtinTemplates, ...custom];
}

export async function getCustomTemplates(): Promise<ChatTemplate[]> {
  return await templatesStorage.getValue();
}

export async function saveCustomTemplate(template: ChatTemplate): Promise<void> {
  const templates = await templatesStorage.getValue();
  const index = templates.findIndex((t) => t.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.push(template);
  }
  await templatesStorage.setValue(templates);
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  const templates = await templatesStorage.getValue();
  await templatesStorage.setValue(templates.filter((t) => t.id !== id));
}

export function isBuiltinTemplate(id: string): boolean {
  return builtinTemplates.some((t) => t.id === id);
}
