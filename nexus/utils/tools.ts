/**
 * Tool definitions for browser control and page extraction.
 * These definitions describe the tools available to the AI for ReAct tool loops.
 */

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolParametersSchema {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  category: 'navigation' | 'interaction' | 'observation' | 'script' | 'vision' | 'extraction';
}

export const BROWSER_CONTROL_TOOLS: ToolDefinition[] = [
  // Navigation
  {
    name: 'browser_navigate',
    description: 'Navigate the current tab to a URL, or go back/forward/reload.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to (required when type is "url")' },
        type: { type: 'string', description: 'Navigation type: "url", "back", "forward", or "reload"', enum: ['url', 'back', 'forward', 'reload'] },
      },
      required: ['type'],
    },
    category: 'navigation',
  },
  {
    name: 'browser_new_page',
    description: 'Open a new browser tab.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to open in the new tab' },
      },
    },
    category: 'navigation',
  },
  {
    name: 'browser_close_page',
    description: 'Close a browser tab by index.',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'The index of the tab to close' },
      },
      required: ['index'],
    },
    category: 'navigation',
  },
  {
    name: 'browser_list_pages',
    description: 'List all open tabs in the browser.',
    parameters: { type: 'object', properties: {} },
    category: 'navigation',
  },
  {
    name: 'browser_select_page',
    description: 'Switch to a specific tab by index.',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'The index of the tab to switch to' },
      },
      required: ['index'],
    },
    category: 'navigation',
  },

  // Interaction
  {
    name: 'browser_click',
    description: 'Click an element on the page by its accessibility tree UID.',
    parameters: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The UID of the element to click (from accessibility snapshot)' },
      },
      required: ['uid'],
    },
    category: 'interaction',
  },
  {
    name: 'browser_hover',
    description: 'Hover over an element on the page.',
    parameters: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The UID of the element to hover over' },
      },
      required: ['uid'],
    },
    category: 'interaction',
  },
  {
    name: 'browser_fill',
    description: 'Fill an input field with a value. Handles text inputs, selects, checkboxes, and radio buttons.',
    parameters: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The UID of the input element' },
        value: { type: 'string', description: 'The value to fill in' },
      },
      required: ['uid', 'value'],
    },
    category: 'interaction',
  },
  {
    name: 'browser_fill_form',
    description: 'Fill multiple form fields at once.',
    parameters: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          description: 'Array of { uid, value } objects for each form field',
          items: {
            type: 'object',
            properties: {
              uid: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      },
      required: ['elements'],
    },
    category: 'interaction',
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key or key combination (e.g. "Enter", "Control+a", "Shift+Tab").',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The key or key combination to press (e.g. "Enter", "Control+c")' },
      },
      required: ['key'],
    },
    category: 'interaction',
  },
  {
    name: 'browser_type_text',
    description: 'Type text character by character into the currently focused element.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type' },
      },
      required: ['text'],
    },
    category: 'interaction',
  },

  // Observation
  {
    name: 'browser_take_snapshot',
    description: 'Take an accessibility tree snapshot of the current page. Returns a structured tree of interactive elements with UIDs that can be used for click/fill/hover actions.',
    parameters: {
      type: 'object',
      properties: {
        verbose: { type: 'boolean', description: 'Include more detail in the snapshot (default: false)' },
      },
    },
    category: 'observation',
  },
  {
    name: 'browser_wait_for',
    description: 'Wait for specific text to appear on the page.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to wait for (or JSON array of strings)' },
        timeout: { type: 'number', description: 'Maximum wait time in milliseconds (default: 5000)' },
      },
      required: ['text'],
    },
    category: 'observation',
  },
  {
    name: 'browser_handle_dialog',
    description: 'Handle a browser dialog (alert, confirm, prompt).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '"accept" or "dismiss"', enum: ['accept', 'dismiss'] },
        promptText: { type: 'string', description: 'Text to enter for prompt dialogs' },
      },
      required: ['action'],
    },
    category: 'observation',
  },

  // Script
  {
    name: 'browser_evaluate',
    description: 'Run JavaScript code in the current page context.',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'The JavaScript code to execute' },
      },
      required: ['script'],
    },
    category: 'script',
  },

  // Vision
  {
    name: 'browser_take_screenshot',
    description: 'Take a screenshot of the current page.',
    parameters: { type: 'object', properties: {} },
    category: 'vision',
  },

  // Extraction
  {
    name: 'extract_page_content',
    description: 'Extract the main content of the current page as clean Markdown text. Useful for summarizing articles or reading web pages.',
    parameters: {
      type: 'object',
      properties: {
        maxLength: { type: 'number', description: 'Maximum content length in characters (default: 30000)' },
        rawExtract: { type: 'boolean', description: 'Use raw extraction (bypass Readability) for sites where it fails' },
      },
    },
    category: 'extraction',
  },
  {
    name: 'extract_youtube_transcript',
    description: 'Extract transcript/captions from a YouTube video page.',
    parameters: { type: 'object', properties: {} },
    category: 'extraction',
  },
];

/**
 * Convert tool definitions to OpenAI function calling format.
 */
export function getToolsAsOpenAIFunctions(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: ToolParametersSchema };
}> {
  return BROWSER_CONTROL_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Check if a tool name is a browser control tool that requires CDP.
 */
export function isBrowserControlTool(name: string): boolean {
  return BROWSER_CONTROL_TOOLS.some((t) => t.name === name);
}

