/**
 * A push-based async iterable queue.
 *
 * Used to feed user messages into a streaming SDK query(), enabling
 * btw injections into an in-progress run without cancellation.
 */
export class AsyncQueue {
  constructor() {
    this._items = [];
    this._waiters = [];
    this._closed = false;
  }

  /** Push a value. No-op if already closed. */
  push(value) {
    if (this._closed) return;
    if (this._waiters.length > 0) {
      this._waiters.shift()({ value, done: false });
    } else {
      this._items.push(value);
    }
  }

  /** Close the queue — signals the async iterator to stop yielding. */
  close() {
    if (this._closed) return;
    this._closed = true;
    while (this._waiters.length > 0) {
      this._waiters.shift()({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator]() {
    const self = this;
    return {
      next() {
        if (self._items.length > 0) {
          return Promise.resolve({ value: self._items.shift(), done: false });
        }
        if (self._closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          self._waiters.push(resolve);
        });
      },
    };
  }
}
