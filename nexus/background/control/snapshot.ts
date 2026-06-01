/**
 * Accessibility tree snapshot extraction and formatting.
 * Converts the CDP Accessibility.getFullAXTree response into a readable,
 * token-efficient text tree with stable UIDs for element interaction.
 */

import type { BrowserConnection } from './connection';

interface AXNode {
  nodeId: string;
  role?: { type: string; value: string };
  name?: { type: string; value: string };
  value?: { type: string; value: string };
  description?: { type: string; value: string };
  properties?: Array<{ name: string; value: { type: string; value: any } }>;
  childIds?: string[];
  backendDOMNodeId?: number;
  ignored?: boolean;
  parentId?: string;
}

const UNINTERESTING_ROLES = new Set([
  'generic',
  'presentation',
  'none',
  'div',
  'text',
  'paragraph',
  'section',
  'StructuralContainer',
  'unknown',
  'LayoutTable',
  'LayoutTableRow',
  'LayoutTableCell',
]);

const EXCLUDED_PROPS = new Set([
  'id',
  'role',
  'name',
  'elementHandle',
  'children',
  'backendNodeId',
  'value',
  'parentId',
  'description',
]);

const BOOLEAN_PROPERTY_MAP: Record<string, string> = {
  disabled: 'disableable',
  expanded: 'expandable',
  focused: 'focusable',
  selected: 'selectable',
  checked: 'checkable',
  pressed: 'pressable',
  editable: 'editable',
  multiselectable: 'multiselectable',
  modal: 'modal',
  required: 'required',
  readonly: 'readonly',
};

export class SnapshotManager {
  private connection: BrowserConnection;
  private snapshotMap = new Map<string, number>(); // uid -> backendNodeId
  private uidToAxNode = new Map<string, AXNode>();
  private uidToNodeId = new Map<string, string>();
  private nodeIdToUid = new Map<string, string>();
  private axNodeByNodeId = new Map<string, AXNode>();
  private backendNodeIdToUid = new Map<number, string>();
  private snapshotIdCount = 0;

  constructor(connection: BrowserConnection) {
    this.connection = connection;
    this.connection.onDetach(() => this.reset());
    this.connection.addListener?.((method: string, params: any) => {
      if (this._shouldResetStableIdsForEvent(method, params)) {
        this.reset();
      }
    });
  }

  private _shouldResetStableIdsForEvent(method: string, params: any): boolean {
    if (method === 'Page.navigatedWithinDocument') return false;
    if (method === 'Page.frameStartedNavigating') {
      return !['sameDocument', 'historySameDocument'].includes(params?.navigationType);
    }
    if (method === 'Page.frameNavigated') {
      return !params?.frame?.parentId;
    }
    return false;
  }

  private _getVal(prop: any): string | undefined {
    return prop?.value;
  }

  private _hasProp(node: AXNode, propName: string): boolean {
    return (
      node.properties?.some((p) => p.name === propName && p.value.value === true) ?? false
    );
  }

  private _isInteresting(node: AXNode): boolean {
    if (node.ignored) return false;
    const role = this._getVal(node.role);
    const name = this._getVal(node.name);
    const value = this._getVal(node.value);

    if (
      this._hasProp(node, 'focused') ||
      this._hasProp(node, 'editable') ||
      this._hasProp(node, 'required')
    ) {
      return true;
    }

    if (UNINTERESTING_ROLES.has(role ?? '')) {
      const hasName = name && String(name).trim().length > 0;
      const hasValue = value !== undefined && String(value).trim().length > 0;
      return hasName || hasValue;
    }

    return true;
  }

  private _escapeStr(str: string): string {
    const s = String(str);
    if (/^[\w-]+$/.test(s)) return s;
    return `"${s.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }

  clear(): void {
    this.snapshotMap.clear();
    this.uidToAxNode.clear();
    this.uidToNodeId.clear();
    this.nodeIdToUid.clear();
    this.axNodeByNodeId.clear();
  }

  reset(): void {
    this.clear();
    this.backendNodeIdToUid.clear();
  }

  getBackendNodeId(uid: string): number {
    const id = this.snapshotMap.get(uid);
    if (id) return id;

    if (uid && uid.includes('_')) {
      const parts = uid.split('_');
      const snapshotVersion = parseInt(parts[0], 10);
      if (!isNaN(snapshotVersion) && snapshotVersion !== this.snapshotIdCount) {
        throw new Error(
          `Stale Element Reference: UID '${uid}' belongs to an older snapshot (v${snapshotVersion}). Current is v${this.snapshotIdCount}. Call 'browser_take_snapshot' first.`,
        );
      }
    }

    throw new Error(
      `Element '${uid}' not found in current snapshot. Call 'browser_take_snapshot' to get fresh UIDs.`,
    );
  }

  getAXNode(uid: string): AXNode | undefined {
    return this.uidToAxNode.get(uid);
  }

  /**
   * Traverse descendants looking for a matching node.
   */
  findDescendant(rootUid: string, predicate: (node: AXNode, uid: string) => boolean): string | null {
    const rootNodeId = this.uidToNodeId.get(rootUid);
    if (!rootNodeId) return null;

    const visit = (nodeId: string): string | null => {
      const node = this.axNodeByNodeId.get(nodeId);
      if (!node?.childIds) return null;

      for (const childId of node.childIds) {
        const childNode = this.axNodeByNodeId.get(childId);
        const childUid = this.nodeIdToUid.get(childId);
        if (childNode && childUid && predicate(childNode, childUid)) {
          return childUid;
        }
        const desc = visit(childId);
        if (desc) return desc;
      }
      return null;
    };

    return visit(rootNodeId);
  }

  async takeSnapshot(args: { verbose?: boolean } = {}): Promise<string> {
    await this.connection.sendCommand('DOM.enable');
    await this.connection.sendCommand('Accessibility.enable');

    const { nodes } = await this.connection.sendCommand('Accessibility.getFullAXTree');

    this.snapshotIdCount++;
    this.clear();

    const seenBackendNodeIds = new Set<number>();
    for (const node of nodes) {
      if (node.nodeId) this.axNodeByNodeId.set(node.nodeId, node);
    }

    let nodeCounter = 0;
    const snapshotId = this.snapshotIdCount;

    const resolveUid = (node: AXNode, fallbackUid: string): string => {
      const backendNodeId = node.backendDOMNodeId;
      if (!backendNodeId) return fallbackUid;
      const existingUid = this.backendNodeIdToUid.get(backendNodeId);
      if (existingUid) return existingUid;
      this.backendNodeIdToUid.set(backendNodeId, fallbackUid);
      return fallbackUid;
    };

    const onNode = (node: AXNode, uid: string): void => {
      if (node.backendDOMNodeId) {
        this.snapshotMap.set(uid, node.backendDOMNodeId);
        seenBackendNodeIds.add(node.backendDOMNodeId);
      }
      this.uidToAxNode.set(uid, node);
      if (node.nodeId) {
        this.uidToNodeId.set(uid, node.nodeId);
        this.nodeIdToUid.set(node.nodeId, uid);
      }
    };

    // Build node lookup
    const nodeById = new Map<string, AXNode>();
    for (const node of nodes) {
      if (node.nodeId) nodeById.set(node.nodeId, node);
    }

    // Find root node (not a child of any other node)
    const allChildIds = new Set(nodes.flatMap((n: AXNode) => n.childIds || []));
    const root = nodes.find((n: AXNode) => !allChildIds.has(n.nodeId));
    if (!root) return 'Error: Could not find root of accessibility tree.';

    const formatNode = (node: AXNode, depth: number): string => {
      const interesting = this._isInteresting(node);
      const shouldPrint = args.verbose || interesting;

      let line = '';

      if (shouldPrint) {
        nodeCounter++;
        const fallbackUid = `${snapshotId}_${nodeCounter}`;
        const uid = resolveUid(node, fallbackUid);
        onNode(node, uid);

        const role = this._getVal(node.role);
        const name = this._getVal(node.name);
        const value = this._getVal(node.value);
        const description = this._getVal(node.description);

        const parts: string[] = [`uid=${uid}`];
        if (role) parts.push(role);
        if (name) parts.push(this._escapeStr(name));
        if (value !== undefined && value !== '' && String(value) !== name) {
          parts.push(`value=${this._escapeStr(value)}`);
        }
        if (description) parts.push(`desc=${this._escapeStr(description)}`);

        if (node.properties) {
          for (const property of node.properties) {
            if (EXCLUDED_PROPS.has(property.name)) continue;
            const propertyValue = property.value?.value;
            if (typeof propertyValue === 'boolean') {
              if (property.name in BOOLEAN_PROPERTY_MAP) {
                parts.push(BOOLEAN_PROPERTY_MAP[property.name]);
              }
              if (propertyValue === true) {
                parts.push(property.name);
              }
            } else if (propertyValue !== undefined && propertyValue !== '') {
              if (property.name === 'value' && String(propertyValue) === name) continue;
              parts.push(`${property.name}=${this._escapeStr(propertyValue)}`);
            }
          }
        }

        line = ' '.repeat(depth * 2) + parts.join(' ') + '\n';
      }

      const nextDepth = shouldPrint ? depth + 1 : depth;
      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = nodeById.get(childId);
          if (child) {
            line += formatNode(child, nextDepth);
          }
        }
      }
      return line;
    };

    const snapshot = formatNode(root, 0);

    // Prune stale backendNodeId mappings
    for (const backendNodeId of this.backendNodeIdToUid.keys()) {
      if (!seenBackendNodeIds.has(backendNodeId)) {
        this.backendNodeIdToUid.delete(backendNodeId);
      }
    }

    return snapshot;
  }
}
