import events from 'events';

const emitter = new events.EventEmitter();

class Publisher {
  emitter: any;

  constructor(emitter: any) {
    this.emitter = emitter;
  }

  publish(channel: string, message: string): void {
    this.emitter.emit(channel, message);
  }
}

class Subscriber extends events.EventEmitter {
  emitter: any;
  subscriptions: any;

  constructor(emitter: any) {
    super();
    this.emitter = emitter;
    this.subscriptions = new Map();
  }

  subscribe(channel: string): void {
    const handler = (message) => {
      this.emit('message', channel, message);
    }
    this.subscriptions.set(channel, handler);
    this.emitter.on(channel, handler);
  }

  unsubscribe(channel: string): void {
    if (!this.subscriptions.has(channel)) {
      return;
    }
    this.emitter.removeListener(channel, this.subscriptions.get(channel));
    this.subscriptions.delete(channel);
  }
}

function createPublisher(): any {
  return new Publisher(emitter);
}

function createSubscriber(): any {
  return new Subscriber(emitter);
}

const EventEmitterPubSub = {
  createPublisher,
  createSubscriber
}

export {
  EventEmitterPubSub
}
