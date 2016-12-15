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

class Consumer extends events.EventEmitter {
  static subscriptions = new Map();
  emitter: any;

  constructor(emitter: any) {
    super();
    this.emitter = emitter;
  }

  subscribe(channel: string): void {
    this.unsubscribe(channel);
    const handler = (message) => {
      this.emit('message', channel, message);
    }
    Consumer.subscriptions.set(channel, handler);
    this.emitter.on(channel, handler);
  }

  unsubscribe(channel: string): void {
    if (!Consumer.subscriptions.has(channel)) {
      //console.log('No channel to unsub from');
      return;
    }

    //console.log('unsub ', channel);
    this.emitter.removeListener(channel, Consumer.subscriptions.get(channel));
    Consumer.subscriptions.delete(channel);
  }
}

function createPublisher(): any {
  return new Publisher(emitter);
}

function createSubscriber(): any {
  return new Consumer(emitter);
}

const EventEmitterMQ = {
  createPublisher,
  createSubscriber
}

export {
  EventEmitterMQ
}
