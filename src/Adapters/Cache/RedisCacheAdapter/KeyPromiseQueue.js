// KeyPromiseQueue is a simple promise queue
// used to queue operations per key basis.
// Once the tail promise in the key-queue fulfills,
// the chain on that key will be cleared.
export class KeyPromiseQueue {
  constructor() {
    this.queue = {};
  }

  enqueue(key, operation) {
    const tuple = this.beforeOp(key);
    const toAwait = tuple[1];
    const nextOperation = toAwait.then(operation);
    const wrappedOperation = nextOperation.then(result => {
      this.afterOp(key);
      return result;
    });
    tuple[1] = wrappedOperation;
    return wrappedOperation;
  }

  beforeOp(key) {
    let tuple = this.queue[key];
    if (!tuple) {
      tuple = [0, Promise.resolve()];
      this.queue[key] = tuple;
    }
    tuple[0]++;
    return tuple;
  }

  afterOp(key) {
    const tuple = this.queue[key];
    if (!tuple) {
      return;
    }
    tuple[0]--;
    if (tuple[0] <= 0) {
      delete this.queue[key];
      return;
    }
  }
}
