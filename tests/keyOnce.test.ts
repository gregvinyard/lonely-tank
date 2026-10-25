import { describe, expect, it } from 'vitest';
import { keyOnce } from '../src/input/keyOnce';

class FakeKeyboardEvent {}
(globalThis as unknown as { KeyboardEvent: unknown }).KeyboardEvent ??= FakeKeyboardEvent;

describe('keyOnce', () => {
  it('runs once per event even when the event is dispatched again', () => {
    let n = 0;
    const h = keyOnce((_e?: unknown) => n++);
    const a = new (globalThis.KeyboardEvent as unknown as new () => KeyboardEvent)();
    const b = new (globalThis.KeyboardEvent as unknown as new () => KeyboardEvent)();
    h(a);
    h(a);
    h(b);
    expect(n).toBe(2);
  });

  it('keeps separate handlers independent', () => {
    let n = 0;
    const e = new (globalThis.KeyboardEvent as unknown as new () => KeyboardEvent)();
    keyOnce((_e?: unknown) => n++)(e);
    keyOnce((_e?: unknown) => n++)(e);
    expect(n).toBe(2);
  });

  it('passes through calls without an event', () => {
    let n = 0;
    const h = keyOnce((_e?: unknown) => n++);
    h();
    h();
    expect(n).toBe(2);
  });
});
