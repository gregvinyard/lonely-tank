// Phaser 4.2.1 dispatches its keyboard queue on every DOM key event but only
// clears the queue once per frame, so when several keys arrive in the same
// frame the earlier events are dispatched again (its duplicate check only
// catches the most recent one). Handlers wrapped with keyOnce ignore any DOM
// event they've already handled.

const handled = new WeakMap<KeyboardEvent, Set<object>>();

/** Wraps a key handler so it runs at most once per DOM KeyboardEvent. */
export function keyOnce<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const id = {};
  return (...args: A) => {
    const event = args.find((a): a is KeyboardEvent => typeof KeyboardEvent !== 'undefined' && a instanceof KeyboardEvent);
    if (event) {
      let seen = handled.get(event);
      if (!seen) handled.set(event, (seen = new Set()));
      if (seen.has(id)) return;
      seen.add(id);
    }
    fn(...args);
  };
}
