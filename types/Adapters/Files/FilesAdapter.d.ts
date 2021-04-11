export var __esModule: boolean;
export default _default;
export function validateFilename(filename: any): any;
/**
 * @module Adapters
 */
/**
 * @interface FilesAdapter
 */
export class FilesAdapter {
    /** Responsible for storing the file in order to be retrieved later by its filename
     *
     * @param {string} filename - the filename to save
     * @param {*} data - the buffer of data from the file
     * @param {string} contentType - the supposed contentType
     * @discussion the contentType can be undefined if the controller was not able to determine it
     * @param {object} options - (Optional) options to be passed to file adapter (S3 File Adapter Only)
     * - tags: object containing key value pairs that will be stored with file
     * - metadata: object containing key value pairs that will be sotred with file (https://docs.aws.amazon.com/AmazonS3/latest/user-guide/add-object-metadata.html)
     * @discussion options are not supported by all file adapters. Check the your adapter's documentation for compatibility
     *
     * @return {Promise} a promise that should fail if the storage didn't succeed
     */
    createFile(filename: string, data: any, contentType: string, options: object): Promise<any>;
    /** Responsible for deleting the specified file
     *
     * @param {string} filename - the filename to delete
     *
     * @return {Promise} a promise that should fail if the deletion didn't succeed
     */
    deleteFile(filename: string): Promise<any>;
    /** Responsible for retrieving the data of the specified file
     *
     * @param {string} filename - the name of file to retrieve
     *
     * @return {Promise} a promise that should pass with the file data or fail on error
     */
    getFileData(filename: string): Promise<any>;
    /** Returns an absolute URL where the file can be accessed
     *
     * @param {Config} config - server configuration
     * @param {string} filename
     *
     * @return {string} Absolute URL
     */
    getFileLocation(config: any, filename: string): string;
}
declare var _default: typeof FilesAdapter;
