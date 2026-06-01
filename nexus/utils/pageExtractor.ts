/**
 * Page content extraction using @mozilla/readability + turndown.
 * Extracts the main content of a web page and converts it to Markdown.
 * Runs via content script injection into the target tab.
 */

export interface ExtractedPage {
  title: string;
  content: string; // Markdown
  byline?: string;
  siteName?: string;
  url: string;
}

/**
 * Extract page content from a tab by injecting a content script.
 * The script clones the DOM, parses it with Readability, and converts to Markdown.
 */
export async function extractPageContent(
  tabId: number,
  options?: { maxLength?: number; rawExtract?: boolean },
): Promise<ExtractedPage> {
  const maxLength = options?.maxLength ?? 30000;

  // First get the URL
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || '';

  // Inject the extraction script
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractContentInPage,
    args: [options?.rawExtract ?? false],
  });

  const result = results?.[0]?.result as {
    title?: string;
    content?: string;
    byline?: string;
    siteName?: string;
  } | undefined;

  if (!result?.content) {
    return {
      title: tab.title || '',
      content: '[Could not extract page content]',
      url,
    };
  }

  // Truncate if needed
  let content = result.content;
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '\n\n[Content truncated...]';
  }

  return {
    title: result.title || tab.title || '',
    content,
    byline: result.byline,
    siteName: result.siteName,
    url,
  };
}

/**
 * This function runs in the context of the web page.
 * It uses Readability to extract content and Turndown to convert to Markdown.
 * We inline the logic here since we can't import modules in injected scripts.
 */
function extractContentInPage(rawExtract: boolean): {
  title: string;
  content: string;
  byline?: string;
  siteName?: string;
} {
  try {
    // Clone the document to avoid modifying the original DOM
    const clonedDoc = document.cloneNode(true) as Document;

    // Remove script, style, and other non-content elements from the clone
    const removeSelectors = ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header'];
    for (const selector of removeSelectors) {
      clonedDoc.querySelectorAll(selector).forEach((el) => el.remove());
    }

    if (rawExtract) {
      // Raw extraction: just get body text
      const text = document.body?.innerText || document.body?.textContent || '';
      return {
        title: document.title || '',
        content: text.trim(),
      };
    }

    // Try to use Readability (loaded via import in background)
    // Since this runs in page context, we implement a simplified extraction
    const body = clonedDoc.body || clonedDoc.documentElement;

    // Find the main content area
    const mainContent =
      clonedDoc.querySelector('main') ||
      clonedDoc.querySelector('article') ||
      clonedDoc.querySelector('[role="main"]') ||
      clonedDoc.querySelector('.post-content') ||
      clonedDoc.querySelector('.article-content') ||
      clonedDoc.querySelector('.content') ||
      body;

    // Convert HTML to simple text/markdown
    let content = '';

    // Process elements recursively
    function processElement(el: Element, depth: number = 0): string {
      const parts: string[] = [];
      const tag = el.tagName?.toLowerCase();

      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) parts.push(text);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const childEl = node as Element;
          const childTag = childEl.tagName?.toLowerCase();
          const childText = processElement(childEl, depth + 1);

          switch (childTag) {
            case 'h1':
              parts.push(`\n# ${childText}\n`);
              break;
            case 'h2':
              parts.push(`\n## ${childText}\n`);
              break;
            case 'h3':
              parts.push(`\n### ${childText}\n`);
              break;
            case 'h4':
              parts.push(`\n#### ${childText}\n`);
              break;
            case 'h5':
              parts.push(`\n##### ${childText}\n`);
              break;
            case 'h6':
              parts.push(`\n###### ${childText}\n`);
              break;
            case 'p':
              parts.push(`\n${childText}\n`);
              break;
            case 'strong':
            case 'b':
              parts.push(`**${childText}**`);
              break;
            case 'em':
            case 'i':
              parts.push(`*${childText}*`);
              break;
            case 'code':
              parts.push(`\`${childText}\``);
              break;
            case 'pre':
              parts.push(`\n\`\`\`\n${childText}\n\`\`\`\n`);
              break;
            case 'blockquote':
              parts.push(`\n> ${childText.replace(/\n/g, '\n> ')}\n`);
              break;
            case 'ul':
            case 'ol':
              parts.push(`\n${childText}\n`);
              break;
            case 'li': {
              const parentTag = el.tagName?.toLowerCase();
              const prefix = parentTag === 'ol' ? '1. ' : '- ';
              parts.push(`${prefix}${childText.trim()}`);
              break;
            }
            case 'a': {
              const href = childEl.getAttribute('href') || '';
              parts.push(href ? `[${childText}](${href})` : childText);
              break;
            }
            case 'img': {
              const alt = childEl.getAttribute('alt') || '';
              const src = childEl.getAttribute('src') || '';
              parts.push(src ? `![${alt}](${src})` : '');
              break;
            }
            case 'br':
              parts.push('\n');
              break;
            case 'hr':
              parts.push('\n---\n');
              break;
            case 'table':
              parts.push(`\n${childText}\n`);
              break;
            case 'tr': {
              const cells = Array.from(childEl.querySelectorAll('td, th'))
                .map((cell) => cell.textContent?.trim() || '')
                .join(' | ');
              if (cells) parts.push(`| ${cells} |`);
              // Add header separator after first row
              if (childEl.parentElement?.querySelector('tr') === childEl) {
                const colCount = childEl.querySelectorAll('td, th').length;
                parts.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
              }
              break;
            }
            default:
              parts.push(childText);
              break;
          }
        }
      }

      return parts.join(' ').replace(/  +/g, ' ');
    }

    content = processElement(mainContent);

    // Clean up excessive whitespace
    content = content
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+/, '')
      .replace(/\s+$/, '');

    // Try to get metadata
    const byline =
      document.querySelector('meta[name="author"]')?.getAttribute('content') ||
      (document as any).querySelector('[rel="author"]')?.textContent ||
      undefined;
    const siteName =
      document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      undefined;

    return {
      title: document.title || '',
      content: content || '[No content extracted]',
      byline,
      siteName,
    };
  } catch (error) {
    return {
      title: document.title || '',
      content: `[Error extracting content: ${(error as Error).message}]`,
    };
  }
}

/**
 * Format extracted page content for injection into AI messages.
 */
export function formatPageContent(page: ExtractedPage): string {
  const parts: string[] = [];
  parts.push(`# Page: ${page.title}`);
  if (page.byline) parts.push(`Author: ${page.byline}`);
  if (page.siteName) parts.push(`Site: ${page.siteName}`);
  parts.push(`URL: ${page.url}`);
  parts.push('');
  parts.push(page.content);
  return parts.join('\n');
}
