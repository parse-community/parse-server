export var __esModule: boolean;
export function flatten(array: any): any;
export function jobStatusHandler(config: any): Readonly<{
    setRunning: (jobName: any, params: any) => any;
    setSucceeded: (message: any) => any;
    setMessage: (message: any) => any;
    setFailed: (message: any) => any;
}>;
export function pushStatusHandler(config: any, existingObjectId: any): Readonly<{
    setInitial: (body: {}, where: any, options?: {
        source: string;
    }) => any;
    setRunning: (batches: any) => any;
    trackSent: (results: any, UTCOffset: any, cleanupInstallations?: string) => any;
    complete: () => any;
    fail: (err: any) => any;
}>;
