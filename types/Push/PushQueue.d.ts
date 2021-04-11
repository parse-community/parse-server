export var __esModule: boolean;
export class PushQueue {
    static defaultPushChannel(): string;
    constructor(config?: {});
    channel: any;
    batchSize: any;
    parsePublisher: any;
    enqueue(body: any, where: any, config: any, auth: any, pushStatus: any): Promise<any>;
}
