/**
 * FloatingBall - Small floating button on every page
 * Can be clicked to open sidepanel or dragged to reposition
 */

const BALL_HOST_ID = 'nexus-floating-ball-host';
const BALL_Z_INDEX = '2147483645';

let ballHost: HTMLElement | null = null;
let ballShadow: ShadowRoot | null = null;
let isEnabled = true;
let isDragging = false;
let dragStartY = 0;
let ballStartY = 0;
let currentY = 20; // bottom offset in px

function getBallStyles(): string {
  return `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .nexus-ball {
      position: fixed;
      right: 20px;
      z-index: ${BALL_Z_INDEX};
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
      transition: opacity 200ms ease, transform 200ms ease, box-shadow 200ms ease;
      user-select: none;
      touch-action: none;
    }

    .nexus-ball:hover {
      opacity: 1;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.1);
    }

    .nexus-ball:active {
      transform: scale(0.92);
    }

    .nexus-ball.dragging {
      opacity: 1;
      cursor: grabbing;
      transition: none;
    }

    .nexus-ball-icon {
      width: 22px;
      height: 22px;
      pointer-events: none;
    }

    .nexus-ball.hidden {
      opacity: 0;
      transform: scale(0.6);
      pointer-events: none;
    }
  `;
}

function getBallIcon(): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>`;
}

const boundDragStart = (e: PointerEvent) => onDragStart(e);
const boundDragMove = (e: PointerEvent) => onDragMove(e);
const boundDragEnd = (e: PointerEvent) => onDragEnd(e);

export function initFloatingBall(): void {
  if (ballHost) return; // Already initialized

  // Check if floating ball is enabled in settings
  chrome.storage.local.get(['nexusFloatingBallEnabled'], (result: { nexusFloatingBallEnabled?: boolean }) => {
    isEnabled = result?.nexusFloatingBallEnabled !== false;
    if (!isEnabled) return;

    createBall();
  });

  // Watch for setting changes
  chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: any; oldValue?: any }>, area: string) => {
    if (area === 'local' && changes.nexusFloatingBallEnabled !== undefined) {
      const wasEnabled = isEnabled;
      isEnabled = changes.nexusFloatingBallEnabled.newValue !== false;
      if (isEnabled && !wasEnabled) {
        createBall();
      } else if (!isEnabled && wasEnabled) {
        destroyBall();
      }
    }
  });
}

function createBall(): void {
  if (ballHost) return;

  const host = document.createElement('div');
  host.id = BALL_HOST_ID;
  host.style.cssText = 'all: initial; position: static; width: 0; height: 0;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = getBallStyles();
  shadow.appendChild(style);

  const ball = document.createElement('button');
  ball.className = 'nexus-ball';
  ball.style.bottom = `${currentY}px`;
  ball.innerHTML = `<span class="nexus-ball-icon">${getBallIcon()}</span>`;
  ball.title = 'Nexus';
  ball.setAttribute('aria-label', 'Open Nexus');

  ball.addEventListener('pointerdown', boundDragStart);

  ball.addEventListener('click', (e) => {
    if (isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
  });

  shadow.appendChild(ball);
  (document.documentElement || document.body).appendChild(host);

  ballHost = host;
  ballShadow = shadow;

  // Animate in
  requestAnimationFrame(() => {
    ball.classList.remove('hidden');
  });
}

let dragTimeout: ReturnType<typeof setTimeout> | null = null;
let hasMoved = false;

function onDragStart(e: PointerEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();

  const ball = ballShadow?.querySelector('.nexus-ball') as HTMLElement | null;
  if (!ball) return;

  isDragging = true;
  hasMoved = false;
  dragStartY = e.clientY;
  ballStartY = currentY;
  ball.classList.add('dragging');

  ball.setPointerCapture(e.pointerId);
  ball.addEventListener('pointermove', boundDragMove);
  ball.addEventListener('pointerup', boundDragEnd);

  if (dragTimeout) clearTimeout(dragTimeout);
  dragTimeout = setTimeout(() => {
    // If held for 200ms without moving, treat as drag
  }, 200);
}

function onDragMove(e: PointerEvent): void {
  if (!isDragging) return;

  const deltaY = dragStartY - e.clientY;
  if (Math.abs(deltaY) > 3) hasMoved = true;

  const ball = ballShadow?.querySelector('.nexus-ball') as HTMLElement | null;
  if (!ball) return;

  const viewportHeight = window.innerHeight;
  const newY = Math.max(20, Math.min(viewportHeight - 64, ballStartY + deltaY));
  currentY = newY;
  ball.style.bottom = `${currentY}px`;
}

function onDragEnd(e: PointerEvent): void {
  const ball = ballShadow?.querySelector('.nexus-ball') as HTMLElement | null;
  if (!ball) return;

  ball.classList.remove('dragging');
  ball.removeEventListener('pointermove', boundDragMove);
  ball.removeEventListener('pointerup', boundDragEnd);

  if (dragTimeout) {
    clearTimeout(dragTimeout);
    dragTimeout = null;
  }

  // Only count as drag if moved significantly
  const wasDrag = hasMoved;
  isDragging = false;
  hasMoved = false;

  if (wasDrag) {
    // Prevent the click handler from firing after drag
    ball.style.pointerEvents = 'none';
    setTimeout(() => {
      ball.style.pointerEvents = '';
    }, 50);
  }
}

function destroyBall(): void {
  if (ballHost && ballHost.parentNode) {
    ballHost.parentNode.removeChild(ballHost);
  }
  ballHost = null;
  ballShadow = null;
}

export function destroyFloatingBall(): void {
  destroyBall();
}
