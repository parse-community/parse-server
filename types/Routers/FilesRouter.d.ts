export var __esModule: boolean;
export class FilesRouter {
    expressRouter({ maxUploadSize }?: {
        maxUploadSize?: string;
    }): any;
    getHandler(req: any, res: any): void;
    createHandler(req: any, res: any, next: any): Promise<void>;
    deleteHandler(req: any, res: any, next: any): Promise<void>;
    metadataHandler(req: any, res: any): Promise<void>;
}
