import logger from '../logger';

export type FlattenedObjectData = { [attr: string]: any };
export type QueryData = { [attr: string]: any };

class Subscription {
  // It is query condition eg query.where
  query: QueryData;
  className: string;
  hash: string;
  clientRequestIds: Object;

  constructor(className: string, query: QueryData, queryHash: string) {
    this.className = className;
    this.query = query;
    this.hash = queryHash;
    this.clientRequestIds = new Map();
  }

  addClientSubscription(clientId: number, requestId: number): void {
    if (!this.clientRequestIds.has(clientId)) {
      this.clientRequestIds.set(clientId, []);
    }
    const requestIds = this.clientRequestIds.get(clientId);
    requestIds.push(requestId);
  }

  deleteClientSubscription(clientId: number, requestId: number): void {
    const requestIds = this.clientRequestIds.get(clientId);
    if (typeof requestIds === 'undefined') {
      logger.error('Can not find client %d to delete', clientId);
      return;
    }

    const index = requestIds.indexOf(requestId);
    if (index < 0) {
      logger.error('Can not find client %d subscription %d to delete', clientId, requestId);
      return;
    }
    requestIds.splice(index, 1);
    // Delete client reference if it has no subscription
    if (requestIds.length == 0) {
      this.clientRequestIds.delete(clientId);
    }
  }

  hasSubscribingClient(): boolean {
    return this.clientRequestIds.size > 0;
  }
}

export {
  Subscription
}
