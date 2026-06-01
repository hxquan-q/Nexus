import { describe, expect, it } from 'vitest';
import { shouldSubmitOnEnter } from './enterSubmit';

describe('shouldSubmitOnEnter', () => {
  it('allows plain Enter to submit', () => {
    expect(
      shouldSubmitOnEnter({
        key: 'Enter',
        shiftKey: false,
      }),
    ).toBe(true);
  });

  it('keeps Shift+Enter for newline', () => {
    expect(
      shouldSubmitOnEnter({
        key: 'Enter',
        shiftKey: true,
      }),
    ).toBe(false);
  });

  it('does not submit while IME composition is active', () => {
    expect(
      shouldSubmitOnEnter({
        key: 'Enter',
        shiftKey: false,
        isComposing: true,
      }),
    ).toBe(false);
  });

  it('does not submit when browser reports the IME processing keycode', () => {
    expect(
      shouldSubmitOnEnter({
        key: 'Enter',
        shiftKey: false,
        keyCode: 229,
      }),
    ).toBe(false);
  });
});
