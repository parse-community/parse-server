export var __esModule: boolean;
export default _default;
/**
 GridStoreAdapter
 Stores files in Mongo using GridStore
 Requires the database adapter to be based on mongoclient
 (GridStore is deprecated, Please use GridFSBucket instead)

 
 */
export class GridStoreAdapter extends _FilesAdapter.FilesAdapter {
    constructor(mongoDatabaseURI?: any, mongoOptions?: {});
    _databaseURI: any;
    _mongoOptions: {
        useNewUrlParser: boolean;
        useUnifiedTopology: boolean;
    };
    _connect(): any;
    _connectionPromise: any;
    _client: any;
    handleFileStream(filename: any, req: any, res: any, contentType: any): Promise<void>;
    handleShutdown(): any;
    validateFilename(filename: any): any;
}
declare var _default: typeof GridStoreAdapter;
import _FilesAdapter = require("./FilesAdapter");
