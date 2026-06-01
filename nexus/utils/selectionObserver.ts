/**
 * SelectionObserver - Monitors text selection across the page
 * Detects selection in normal DOM elements and input/textarea fields.
 * Fires callbacks when selection appears or clears.
 */

export interface SelectionData {
  text: string;
  rect: DOMRect;
  mousePoint: { x: number; y: number } | null;
  range?: Range;
}

export interface SelectionObserverCallbacks {
  onSelection: (data: SelectionData) => void;
  onClear: () => void;
  onClick?: (event: PointerEvent) => void;
}

export class SelectionObserver {
  private callbacks: SelectionObserverCallbacks;
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingMousePoint: { x: number; y: number } | null = null;
  private isPointerDown = false;

  private boundSelectionEnd: (e: PointerEvent) => void;
  private boundMouseDown: (e: PointerEvent) => void;
  private boundSelectionChange: () => void;

  constructor(callbacks: SelectionObserverCallbacks) {
    this.callbacks = callbacks;

    this.boundSelectionEnd = this.onSelectionEnd.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundSelectionChange = this.onSelectionChange.bind(this);

    this.init();
  }

  private init(): void {
    document.addEventListener('mouseup', this.boundSelectionEnd as EventListener, true);
    document.addEventListener('pointerup', this.boundSelectionEnd, true);
    document.addEventListener('touchend', this.boundSelectionEnd as EventListener, true);
    document.addEventListener('mousedown', this.boundMouseDown as EventListener, true);
    document.addEventListener('pointerdown', this.boundMouseDown, true);
    document.addEventListener('touchstart', this.boundMouseDown as EventListener, true);
    document.addEventListener('selectionchange', this.boundSelectionChange);
  }

  private onMouseDown(pointerEvent: PointerEvent): void {
    this.isPointerDown = true;
    if (this.callbacks.onClick) {
      this.callbacks.onClick(pointerEvent);
    }
  }

  private onSelectionEnd(pointerEvent: PointerEvent): void {
    this.isPointerDown = false;
    this.scheduleSelectionCheck(pointerEvent);
  }

  private onSelectionChange(): void {
    if (this.isPointerDown) return;
    this.scheduleSelectionCheck(null);
  }

  private scheduleSelectionCheck(pointerEvent: PointerEvent | null): void {
    const mousePoint = this.getEventPoint(pointerEvent);
    if (mousePoint || !this.pendingMousePoint) {
      this.pendingMousePoint = mousePoint;
    }

    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }

    // Delay slightly to let native selection state settle
    this.selectionTimer = setTimeout(() => {
      this.selectionTimer = null;
      const selectionData = this.readSelection(this.pendingMousePoint);
      this.pendingMousePoint = null;

      if (selectionData && selectionData.text.length > 0) {
        this.callbacks.onSelection(selectionData);
      } else {
        this.callbacks.onClear();
      }
    }, 10);
  }

  private readSelection(mousePoint: { x: number; y: number } | null): SelectionData | null {
    const inputSelection = this.readInputSelection(mousePoint);
    if (inputSelection) return inputSelection;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const rect =
      typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : this.emptyRect();

    return { text, range, rect, mousePoint };
  }

  private readInputSelection(mousePoint: { x: number; y: number } | null): SelectionData | null {
    const element = this.getActiveElement();
    if (!this.isTextInput(element)) return null;

    const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number' || start === end) {
      return null;
    }

    const text = inputEl.value.slice(start, end).trim();
    if (!text) return null;

    const rect =
      typeof inputEl.getBoundingClientRect === 'function'
        ? inputEl.getBoundingClientRect()
        : this.emptyRect();

    return { text, rect, mousePoint };
  }

  private getActiveElement(): Element | null {
    let element = document.activeElement;
    while (element && element.shadowRoot && element.shadowRoot.activeElement) {
      element = element.shadowRoot.activeElement;
    }
    return element;
  }

  private isTextInput(element: Element | null): boolean {
    if (!element || typeof (element as any).value !== 'string') return false;
    const tagName = element.tagName;
    return tagName === 'TEXTAREA' || tagName === 'INPUT';
  }

  private getEventPoint(pointerEvent: PointerEvent | null): { x: number; y: number } | null {
    if (!pointerEvent) return null;

    const source =
      (pointerEvent as any).changedTouches?.[0] ??
      (pointerEvent as any).touches?.[0] ??
      pointerEvent;

    if (typeof source.clientX !== 'number' || typeof source.clientY !== 'number') {
      return null;
    }

    return { x: source.clientX, y: source.clientY };
  }

  private emptyRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }

  disconnect(): void {
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
      this.selectionTimer = null;
    }
    this.pendingMousePoint = null;

    document.removeEventListener('mouseup', this.boundSelectionEnd as EventListener, true);
    document.removeEventListener('pointerup', this.boundSelectionEnd, true);
    document.removeEventListener('touchend', this.boundSelectionEnd as EventListener, true);
    document.removeEventListener('mousedown', this.boundMouseDown as EventListener, true);
    document.removeEventListener('pointerdown', this.boundMouseDown, true);
    document.removeEventListener('touchstart', this.boundMouseDown as EventListener, true);
    document.removeEventListener('selectionchange', this.boundSelectionChange);
  }
}
