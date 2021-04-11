export var __esModule: boolean;
export default _default;
export class GridFSBucketAdapter extends _FilesAdapter.FilesAdapter {
    constructor(mongoDatabaseURI?: any, mongoOptions?: {}, encryptionKey?: any);
    _databaseURI: any;
    _algorithm: string;
    _encryptionKey: string;
    _mongoOptions: {
        useNewUrlParser: boolean;
        useUnifiedTopology: boolean;
    };
    _connect(): any;
    _connectionPromise: any;
    _client: any;
    _getBucket(): any;
    rotateEncryptionKey(options?: {}): Promise<any>;
    getMetadata(filename: any): Promise<{
        metadata?: undefined;
    } | {
        metadata: any;
    }>;
    handleFileStream(filename: any, req: any, res: any, contentType: any): Promise<void>;
    handleShutdown(): any;
    validateFilename(filename: any): any;
}
declare var _default: typeof GridFSBucketAdapter;
import _FilesAdapter = require("./FilesAdapter");
