export interface EnterSubmitEventLike {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  which?: number;
}

const IME_PROCESSING_KEYCODE = 229;

export function shouldSubmitOnEnter(event: EnterSubmitEventLike): boolean {
  if (event.key !== 'Enter' || event.shiftKey) {
    return false;
  }

  if (event.isComposing) {
    return false;
  }

  const legacyImeKeyCode = event.keyCode ?? event.which;
  return legacyImeKeyCode !== IME_PROCESSING_KEYCODE;
}
