export var __esModule: boolean;
export default _default;
declare const FilesController_base: any;
export class FilesController extends FilesController_base {
    [x: string]: any;
    getFileData(config: any, filename: any): any;
    createFile(config: any, filename: any, data: any, contentType: any, options: any): any;
    deleteFile(config: any, filename: any): any;
    getMetadata(filename: any): any;
    /**
     * Find file references in REST-format object and adds the url key
     * with the current mount point and app id.
     * Object may be a single object or list of REST-format objects.
     */
    expandFilesInObject(config: any, object: any): void;
    expectedAdapterType(): typeof _FilesAdapter.FilesAdapter;
    handleFileStream(config: any, filename: any, req: any, res: any, contentType: any): any;
    validateFilename(filename: any): any;
}
declare var _default: typeof FilesController;
import _FilesAdapter = require("../Adapters/Files/FilesAdapter");
