/**
 * Markdown rendering configuration using marked.
 *
 * Phase 2 enhancements:
 * - KaTeX math rendering (inline + block)
 * - highlight.js syntax highlighting
 * - Mermaid diagram rendering (sandboxed iframe)
 * - Graphviz/DOT rendering (sandboxed iframe)
 */

import { Marked } from 'marked';
import katex from 'katex';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';

// Register only the languages we need
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodeData(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Render LaTeX math to HTML using KaTeX.
 */
function renderKatex(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, {
      displayMode,
      strict: 'ignore',
      throwOnError: false,
    });
  } catch {
    // Fallback: show raw math in a code block
    if (displayMode) {
      return `<div class="markdown-math-block"><code>${escapeHtml(math)}</code></div>`;
    }
    return `<code class="markdown-math-inline">${escapeHtml(math)}</code>`;
  }
}

/**
 * Apply highlight.js syntax highlighting to code.
 * Returns highlighted HTML or escaped plain text if language is unsupported.
 */
function highlightCode(code: string, language: string): string {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      // fall through to auto
    }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

// Track unique IDs for sandboxed chart iframes
let chartIdCounter = 0;
function nextChartId(): string {
  return `chart-${++chartIdCounter}-${Date.now()}`;
}

// Custom renderer with full Phase 2 features
const renderer = {
  link(this: any, { href = '', title, tokens }: any) {
    const text = this.parser.parseInline(tokens);
    const safeHref = escapeHtml(href);
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${safeTitle}>${text}</a>`;
  },
  code({ text = '', lang = '' }: any) {
    const normalizedCode = String(text).replace(/\n$/, '');
    const language = String(lang || '').trim().toLowerCase();
    const languageLabel = language || 'Code';
    const encodedCode = encodeData(normalizedCode);
    const encodedLanguage = encodeData(language);

    // Mermaid diagram
    if (language === 'mermaid') {
      const chartId = nextChartId();
      return `<div class="markdown-chart-container" data-chart-type="mermaid" data-chart-id="${chartId}"><div class="markdown-chart-loading">Loading diagram...</div><pre style="display:none" data-chart-code>${escapeHtml(normalizedCode)}</pre></div>`;
    }

    // Graphviz / DOT diagram
    if (language === 'dot' || language === 'graphviz') {
      const chartId = nextChartId();
      return `<div class="markdown-chart-container" data-chart-type="graphviz" data-chart-id="${chartId}"><div class="markdown-chart-loading">Loading diagram...</div><pre style="display:none" data-chart-code>${escapeHtml(normalizedCode)}</pre></div>`;
    }

    // Regular code block with syntax highlighting
    const highlighted = highlightCode(normalizedCode, language);

    return `
      <div class="markdown-code-block">
        <div class="markdown-code-toolbar">
          <span class="markdown-code-language">${escapeHtml(languageLabel)}</span>
          <div class="markdown-code-actions">
            <button
              type="button"
              class="markdown-code-btn"
              data-markdown-action="copy-code"
              data-code="${encodedCode}"
              data-language="${encodedLanguage}"
              data-default-label="Copy"
              data-copied-label="Copied!"
              title="Copy"
              aria-label="Copy code"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <span class="markdown-code-btn-label">Copy</span>
            </button>
            <button
              type="button"
              class="markdown-code-btn"
              data-markdown-action="expand-code"
              data-code="${encodedCode}"
              data-language="${encodedLanguage}"
              title="Expand"
              aria-label="Expand code"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 00-2 2v3"/>
                <path d="M16 3h3a2 2 0 012 2v3"/>
                <path d="M8 21H5a2 2 0 01-2-2v-3"/>
                <path d="M16 21h3a2 2 0 002-2v-3"/>
              </svg>
              <span class="markdown-code-btn-label">Expand</span>
            </button>
          </div>
        </div>
        <pre><code class="hljs">${highlighted}</code></pre>
      </div>
    `;
  },
};

// Block math extension: $$...$$
const blockMathExtension = {
  name: 'blockMath',
  level: 'block' as const,
  start(src: string) {
    return src.match(/\$\$/)?.index;
  },
  tokenizer(src: string) {
    const match = /^\$\$[ \t]*\n([\s\S]+?)\n\$\$(?:\n|$)/.exec(src)
      ?? /^\$\$([^\n]+?)\$\$(?:\n|$)/.exec(src);
    if (!match) return undefined;
    return {
      type: 'blockMath',
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: any) {
    return `<div class="markdown-math-block">${renderKatex(token.text, true)}</div>`;
  },
};

// Inline math extension: $...$
const inlineMathExtension = {
  name: 'inlineMath',
  level: 'inline' as const,
  start(src: string) {
    return src.indexOf('$');
  },
  tokenizer(src: string) {
    if (src.startsWith('$$')) return undefined;
    const match = /^\$((?:\\.|[^$\\\n])+?)\$(?!\$)/.exec(src);
    if (!match) return undefined;
    return {
      type: 'inlineMath',
      raw: match[0],
      text: match[1],
    };
  },
  renderer(token: any) {
    return renderKatex(token.text, false);
  },
};

// Create the markdown parser instance
const markdownParser = new Marked({
  breaks: true,
  gfm: true,
  renderer,
  extensions: [blockMathExtension, inlineMathExtension],
});

/**
 * Sanitize rendered HTML to prevent XSS attacks.
 * Removes dangerous elements while preserving safe content.
 */
function sanitizeHtml(html: string): string {
  return html
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove dangerous attributes (event handlers)
    .replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // Remove javascript: URLs
    .replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, 'href="#"')
    // Remove data: URLs in src that could be vectors (but keep data:image which is legitimate)
    .replace(/src\s*=\s*(?:"data:(?!image\/)[^"]*"|'data:(?!image\/)[^']*')/gi, '')
    // Remove iframe, object, embed, form tags
    .replace(/<(iframe|object|embed|form|input|textarea|select|button|meta|link|base)\b[^>]*>/gi, '')
    .replace(/<\/(iframe|object|embed|form|input|textarea|select|button|meta|link|base)>/gi, '');
}

/**
 * Render markdown content to HTML.
 */
export function renderMarkdown(content: string): string {
  if (!content) return '';
  const raw = markdownParser.parse(content) as string;
  return sanitizeHtml(raw);
}

/**
 * Decode data-attribute encoded code string.
 */
export function decodeData(value?: string): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Initialize sandboxed chart rendering for mermaid/graphviz containers.
 * Call this after the markdown HTML has been inserted into the DOM.
 */
export function initChartRendering(container: HTMLElement): void {
  const chartContainers = container.querySelectorAll<HTMLElement>(
    '.markdown-chart-container:not([data-chart-initialized])'
  );

  if (chartContainers.length === 0) return;

  // Resolve sandbox page URL relative to the extension
  const sandboxUrl = browser.runtime.getURL('/sandbox.html' as any);

  for (const chartEl of chartContainers) {
    chartEl.setAttribute('data-chart-initialized', 'true');

    const chartType = chartEl.dataset.chartType as 'mermaid' | 'graphviz';
    const chartId = chartEl.dataset.chartId ?? '';
    const codeEl = chartEl.querySelector<HTMLPreElement>('pre[data-chart-code]');
    const code = codeEl?.textContent ?? '';
    const loadingEl = chartEl.querySelector('.markdown-chart-loading');

    if (!code) {
      if (loadingEl) loadingEl.textContent = 'No diagram source found.';
      continue;
    }

    // Create sandbox iframe
    const iframe = document.createElement('iframe');
    iframe.src = sandboxUrl;
    iframe.style.cssText = 'width:100%;border:none;min-height:100px;background:transparent;';
    iframe.setAttribute('sandbox', 'allow-scripts');

    let ready = false;
    let pendingData: any = null;

    // Send render command (either immediately or once iframe signals ready)
    function sendRender() {
      const messageType = chartType === 'mermaid' ? 'render-mermaid' : 'render-graphviz';
      const payload = { type: messageType, id: chartId, code };
      iframe.contentWindow?.postMessage(payload, '*');
    }

    // Wait for sandbox to signal readiness
    const readyHandler = (event: MessageEvent) => {
      if (event.data?.type === 'sandbox-ready' && event.source === iframe.contentWindow) {
        window.removeEventListener('message', readyHandler);
        ready = true;
        if (pendingData) {
          sendRender();
          pendingData = null;
        }
      }
    };
    window.addEventListener('message', readyHandler);

    // Fallback: if load fires before sandbox-ready, queue the data
    iframe.addEventListener('load', () => {
      if (ready) {
        sendRender();
      } else {
        pendingData = true;
      }
    });

    // Listen for result from sandbox
    const messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.id !== chartId) return;

      if (
        (chartType === 'mermaid' && data.type === 'mermaid-result') ||
        (chartType === 'graphviz' && data.type === 'graphviz-result')
      ) {
        window.removeEventListener('message', messageHandler);

        // Replace loading indicator with rendered SVG
        if (loadingEl) loadingEl.remove();
        const svgWrapper = document.createElement('div');
        svgWrapper.className = 'markdown-chart-svg';
        svgWrapper.innerHTML = data.svg;

        // Scale SVG to fit container
        const svg = svgWrapper.querySelector('svg');
        if (svg) {
          svg.style.maxWidth = '100%';
          svg.style.height = 'auto';
        }

        chartEl.appendChild(svgWrapper);

        // Resize iframe to fit content
        const resizeObserver = new ResizeObserver(() => {
          const height = chartEl.scrollHeight;
          iframe.style.height = `${height}px`;
        });
        resizeObserver.observe(chartEl);
      }

      if (data.type === 'chart-error' && data.id === chartId) {
        window.removeEventListener('message', messageHandler);
        if (loadingEl) {
          loadingEl.className = 'chart-error';
          loadingEl.textContent = `Diagram error: ${data.error}`;
        }
      }
    };

    window.addEventListener('message', messageHandler);

    // Insert iframe (hidden helper for communication)
    iframe.style.display = 'none';
    chartEl.appendChild(iframe);
  }
}
