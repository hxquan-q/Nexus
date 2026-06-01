/**
 * File-to-text extraction pipeline for document uploads.
 * Supports PDF, DOCX, CSV, TXT, and MD formats.
 * All parsers use dynamic imports for code splitting.
 */

export type FileFormat = 'pdf' | 'docx' | 'csv' | 'txt' | 'md';

export interface ParsedFile {
  text: string;
  format: FileFormat;
  name: string;
}

const EXTENSION_MAP: Record<string, FileFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  csv: 'csv',
  txt: 'txt',
  md: 'md',
};

/**
 * Detect file format from the file extension.
 */
export function detectFormat(filename: string): FileFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * Parse an uploaded File object into text.
 * Uses dynamic imports for all parsers to enable code splitting.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error(`Unsupported file format: ${file.name}`);
  }

  let text: string;
  switch (format) {
    case 'pdf':
      text = await parsePdf(file);
      break;
    case 'docx':
      text = await parseDocx(file);
      break;
    case 'csv':
      text = await parseCsv(file);
      break;
    case 'txt':
    case 'md':
      text = await parseText(file);
      break;
  }

  return { text, format, name: file.name };
}

/**
 * Parse a PDF file using pdfjs-dist.
 * Extracts text content page by page.
 * Dynamic import ensures pdf.js is only loaded when a PDF is uploaded.
 */
async function parsePdf(file: File): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist');

    // Configure worker — use a CDN copy matching the installed version
    const pdfjsVersion = pdfjsLib.version;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      if (pageText.trim()) {
        pages.push(`--- Page ${i} ---\n${pageText.trim()}`);
      }
    }

    return pages.join('\n\n') || '[No text content extracted from PDF]';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse PDF: ${msg}`);
  }
}

/**
 * Parse a DOCX file using mammoth.
 * Extracts raw text content.
 * Dynamic import ensures mammoth is only loaded when a DOCX is uploaded.
 */
async function parseDocx(file: File): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim() || '[No text content extracted from DOCX]';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse DOCX: ${msg}`);
  }
}

/**
 * Parse a CSV file using PapaParse.
 * Produces a readable text representation of the table.
 * Dynamic import ensures PapaParse is only loaded when a CSV is uploaded.
 */
async function parseCsv(file: File): Promise<string> {
  try {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();

    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete(results: any) {
          if (results.errors.length > 0 && results.data.length === 0) {
            resolve('[Failed to parse CSV file]');
            return;
          }

          const data = results.data as Record<string, string>[];
          const headers = results.meta.fields ?? [];

          if (headers.length === 0 || data.length === 0) {
            resolve('[No data found in CSV file]');
            return;
          }

          // Format as a readable table summary
          const lines: string[] = [];
          lines.push(`CSV file: ${data.length} rows, ${headers.length} columns`);
          lines.push('');
          lines.push(`Columns: ${headers.join(', ')}`);
          lines.push('');

          // Show first 20 rows as a formatted table
          const maxRows = Math.min(data.length, 20);
          const displayData = data.slice(0, maxRows);

          for (const row of displayData) {
            const rowParts = headers.map((h: string) => `${h}: ${row[h] ?? ''}`);
            lines.push(rowParts.join(' | '));
          }

          if (data.length > maxRows) {
            lines.push(`\n... and ${data.length - maxRows} more rows`);
          }

          resolve(lines.join('\n'));
        },
        error(err: any) {
          resolve(`[Failed to parse CSV: ${err.message}]`);
        },
      });
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse CSV: ${msg}`);
  }
}

/**
 * Read raw text from a TXT or MD file.
 */
async function parseText(file: File): Promise<string> {
  const text = await file.text();
  return text.trim() || '[Empty file]';
}
