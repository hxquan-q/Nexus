/**
 * Agent Skills system
 * Skills are stored in IndexedDB and contain instructions, scripts, and reference files.
 */

import { openDB, type IDBPDatabase } from 'idb';

// ============================================================
// Types
// ============================================================

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
}

export interface SkillScript {
  name: string;
  path: string;
  content: string;
}

export interface SkillFile {
  path: string;
  content: string;
}

export interface Skill {
  id: string;
  metadata: SkillMetadata;
  instructions: string;
  scripts: SkillScript[];
  references: SkillFile[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// Database
// ============================================================

const DB_NAME = 'nexus-skills';
const DB_VERSION = 1;

interface SkillsDBSchema {
  skills: {
    key: string;
    value: Skill;
    indexes: { 'by-name': string };
  };
  'skill-files': {
    key: string;
    value: { skillId: string; path: string; content: string };
    indexes: { 'by-skillId': string };
  };
}

let dbInstance: IDBPDatabase<SkillsDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<SkillsDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SkillsDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('skills')) {
        const store = db.createObjectStore('skills', { keyPath: 'id' });
        store.createIndex('by-name', 'metadata.name');
      }
      if (!db.objectStoreNames.contains('skill-files')) {
        const store = db.createObjectStore('skill-files', { keyPath: 'path' });
        store.createIndex('by-skillId', 'skillId');
      }
    },
  });

  return dbInstance;
}

// ============================================================
// Skill CRUD
// ============================================================

export async function getAllSkills(): Promise<Skill[]> {
  const db = await getDB();
  return db.getAll('skills');
}

export async function getSkill(id: string): Promise<Skill | null> {
  const db = await getDB();
  const skill = await db.get('skills', id);
  return skill || null;
}

export async function getSkillByName(name: string): Promise<Skill | null> {
  const db = await getDB();
  const index = db.transaction('skills').store.index('by-name');
  const skill = await index.get(name);
  return skill || null;
}

export async function saveSkill(skill: Skill): Promise<void> {
  const db = await getDB();
  await db.put('skills', { ...skill, updatedAt: Date.now() });

  // Save associated files
  const tx = db.transaction('skill-files', 'readwrite');
  for (const script of skill.scripts) {
    await tx.store.put({ skillId: skill.id, path: script.path, content: script.content });
  }
  for (const ref of skill.references) {
    await tx.store.put({ skillId: skill.id, path: ref.path, content: ref.content });
  }
  await tx.done;
}

export async function deleteSkill(id: string): Promise<void> {
  const db = await getDB();

  // Delete associated files
  const tx = db.transaction('skill-files', 'readwrite');
  const index = tx.store.index('by-skillId');
  let cursor = await index.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;

  // Delete the skill
  await db.delete('skills', id);
}

// ============================================================
// Skill File Access
// ============================================================

export async function getSkillFileAsText(
  skillId: string,
  filePath: string,
): Promise<string | null> {
  const db = await getDB();
  const record = await db.get('skill-files', filePath);
  if (record && record.skillId === skillId) {
    return record.content;
  }
  return null;
}

// ============================================================
// Skill Import
// ============================================================

/**
 * Import a skill from a SKILL.md or skill.json file.
 * Accepts a FileList from a file picker (expecting .zip files).
 */
export async function importSkill(files: FileList): Promise<Skill> {
  const file = files[0];
  if (!file) throw new Error('No file selected');

  // Support .zip import
  if (file.name.endsWith('.zip')) {
    return importSkillFromZip(file);
  }

  // Support direct SKILL.md or skill.json import
  if (file.name === 'SKILL.md' || file.name.endsWith('.md')) {
    return importSkillFromMd(file);
  }

  if (file.name === 'skill.json' || file.name.endsWith('.json')) {
    return importSkillFromJson(file);
  }

  throw new Error('Unsupported file format. Use .zip, SKILL.md, or skill.json');
}

async function importSkillFromZip(file: File): Promise<Skill> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  // Find SKILL.md or skill.json
  let skillMdFile = zip.file('SKILL.md');
  if (!skillMdFile) {
    // Search recursively
    const mdFiles = Object.keys(zip.files).filter((f) => f.endsWith('SKILL.md') || f.endsWith('skill.md'));
    if (mdFiles.length > 0) {
      skillMdFile = zip.file(mdFiles[0]);
    }
  }

  let skillJsonFile = zip.file('skill.json');
  if (!skillJsonFile) {
    const jsonFiles = Object.keys(zip.files).filter((f) => f.endsWith('skill.json'));
    if (jsonFiles.length > 0) {
      skillJsonFile = zip.file(jsonFiles[0]);
    }
  }

  let metadata: SkillMetadata;
  let instructions: string;

  if (skillMdFile) {
    const content = await skillMdFile.async('string');
    const parsed = parseSkillMd(content);
    metadata = parsed.metadata;
    instructions = parsed.instructions;
  } else if (skillJsonFile) {
    const content = await skillJsonFile.async('string');
    const json = JSON.parse(content);
    metadata = json.metadata || json;
    instructions = json.instructions || '';
  } else {
    throw new Error('No SKILL.md or skill.json found in zip archive');
  }

  if (!metadata.name || !metadata.description) {
    throw new Error('Skill must have a name and description');
  }

  // Collect scripts
  const scripts: SkillScript[] = [];
  const scriptFiles = Object.keys(zip.files).filter(
    (f) => f.includes('scripts/') && f.endsWith('.js') && !zip.files[f].dir,
  );
  for (const path of scriptFiles) {
    const content = await zip.files[path].async('string');
    const name = path.split('/').pop() || path;
    scripts.push({ name, path, content });
  }

  // Collect reference files
  const references: SkillFile[] = [];
  const refFiles = Object.keys(zip.files).filter(
    (f) =>
      f.includes('references/') &&
      !zip.files[f].dir &&
      !f.endsWith('/'),
  );
  for (const path of refFiles) {
    const content = await zip.files[path].async('string');
    references.push({ path, content });
  }

  const skill: Skill = {
    id: `skill-${metadata.name}-${Date.now()}`,
    metadata,
    instructions,
    scripts,
    references,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveSkill(skill);
  return skill;
}

async function importSkillFromMd(file: File): Promise<Skill> {
  const content = await file.text();
  const { metadata, instructions } = parseSkillMd(content);

  const skill: Skill = {
    id: `skill-${metadata.name}-${Date.now()}`,
    metadata,
    instructions,
    scripts: [],
    references: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveSkill(skill);
  return skill;
}

async function importSkillFromJson(file: File): Promise<Skill> {
  const content = await file.text();
  const json = JSON.parse(content);

  const skill: Skill = {
    id: json.id || `skill-${json.metadata?.name || 'unknown'}-${Date.now()}`,
    metadata: json.metadata || { name: 'Unknown', description: '' },
    instructions: json.instructions || '',
    scripts: json.scripts || [],
    references: json.references || [],
    createdAt: json.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  await saveSkill(skill);
  return skill;
}

// ============================================================
// Parsing
// ============================================================

/**
 * Parse a SKILL.md file with YAML frontmatter.
 */
export function parseSkillMd(content: string): { metadata: SkillMetadata; instructions: string } {
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = normalizedContent.match(frontmatterRegex);

  if (!match) {
    // If no frontmatter, treat entire content as instructions with default metadata
    return {
      metadata: { name: 'unnamed-skill', description: 'Imported skill without metadata' },
      instructions: content.trim(),
    };
  }

  const yamlContent = match[1];
  const instructions = match[2].trim();
  const metadata = parseSimpleYaml(yamlContent);

  if (!metadata.name || !metadata.description) {
    throw new Error('SKILL.md must have name and description fields');
  }

  return { metadata, instructions };
}

/**
 * Simple YAML parser for frontmatter.
 */
function parseSimpleYaml(yaml: string): SkillMetadata {
  const normalizedYaml = yaml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedYaml.split('\n');
  const result: Record<string, string> = {};
  let currentKey = '';
  let multilineValue = '';
  let inMultiline = false;

  for (const line of lines) {
    if (inMultiline) {
      if (line.startsWith('  ') || line.trim() === '') {
        multilineValue += (multilineValue ? '\n' : '') + line.replace(/^  /, '');
        continue;
      } else {
        result[currentKey] = multilineValue.trim();
        inMultiline = false;
        multilineValue = '';
      }
    }

    const keyMatch = line.match(/^([a-z-]+):\s*(.*)$/i);
    if (keyMatch) {
      const [, key, value] = keyMatch;
      const normalizedKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

      if (value === '|' || value === '>') {
        currentKey = normalizedKey;
        inMultiline = true;
        multilineValue = '';
      } else if (value) {
        result[normalizedKey] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  if (inMultiline && multilineValue) {
    result[currentKey] = multilineValue.trim();
  }

  return result as unknown as SkillMetadata;
}

// ============================================================
// Skills Prompt Generation
// ============================================================

/**
 * Generate the skills prompt to inject into the system prompt.
 */
export function generateSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const skillsXml = skills
    .map(
      (skill) =>
        `  <skill>\n    <name>${skill.metadata.name}</name>\n    <description>${skill.metadata.description}</description>\n  </skill>`,
    )
    .join('\n');

  return `<available_skills>
${skillsXml}
</available_skills>

When the user's task matches a skill's description, you should activate that skill.
To activate a skill, use the activate_skill tool with the skill name.`;
}

/**
 * Generate tool definitions for skills.
 */
export function getSkillsAsTools(
  skills: Skill[],
): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: { type: 'object'; properties: Record<string, unknown>; required: string[] };
  };
}> {
  const tools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    };
  }> = [];

  if (skills.length === 0) return tools;

  // activate_skill tool
  tools.push({
    type: 'function',
    function: {
      name: 'activate_skill',
      description: 'Activate a skill by name. Returns the skill instructions.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the skill to activate' },
        },
        required: ['name'],
      },
    },
  });

  // execute_skill_script tool (only if any skills have scripts)
  const hasScripts = skills.some((s) => s.scripts.length > 0);
  if (hasScripts) {
    tools.push({
      type: 'function',
      function: {
        name: 'execute_skill_script',
        description: 'Execute a script from an activated skill.',
        parameters: {
          type: 'object',
          properties: {
            skillName: { type: 'string', description: 'The name of the skill' },
            scriptName: {
              type: 'string',
              description: 'The name of the script to execute',
            },
            arguments: {
              type: 'object',
              description: 'Arguments to pass to the script',
              properties: {},
            },
          },
          required: ['skillName', 'scriptName'],
        },
      },
    });
  }

  // read_skill_file tool
  tools.push({
    type: 'function',
    function: {
      name: 'read_skill_file',
      description: 'Read a reference file from a skill.',
      parameters: {
        type: 'object',
        properties: {
          skillName: { type: 'string', description: 'The name of the skill' },
          filePath: { type: 'string', description: 'The path of the file to read' },
        },
        required: ['skillName', 'filePath'],
      },
    },
  });

  return tools;
}
