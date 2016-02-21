// AzureBlobStorageAdapter
//
// Stores Parse files in Azure Blob Storage.

import * as azure from 'azure-storage';
import { FilesAdapter } from './FilesAdapter';

export class AzureBlobStorageAdapter extends FilesAdapter {
    // Creates an Azure Storage client.
    // Provide storage account name or storage account connection string as first parameter
    // Provide container name as second parameter
    // If you had provided storage account name, then also provide storage access key
    // Host is optional, Azure will default to the default host
    // directAccess defaults to false. If set to true, the file URL will be the actual blob URL
    constructor(
        storageAccountOrConnectionString,
        container, {
            storageAccessKey = '',
            host = '',
            directAccess = false
        } = {}
    ) {
        super();

        this._storageAccountOrConnectionString = storageAccountOrConnectionString;
        this._storageAccessKey = storageAccessKey;
        this._host = host;
        this._container = container;
        this._directAccess = directAccess;
        if (this._storageAccountOrConnectionString.indexOf(';') != -1) {
            // Connection string was passed
            // Extract storage account name
            // Storage account name is needed in getFileLocation
            this._storageAccountName = this._storageAccountOrConnectionString.substring(
                this._storageAccountOrConnectionString.indexOf('AccountName') + 12,
                this._storageAccountOrConnectionString.indexOf(';', this._storageAccountOrConnectionString.indexOf('AccountName') + 12)
            );
        } else {
            // Storage account name was passed
            this._storageAccountName = this._storageAccountOrConnectionString;
        }
        // Init client
        this._azureBlobStorageClient = azure.createBlobService(this._storageAccountOrConnectionString, this._storageAccessKey, this._host);
    }

    // For a given config object, filename, and data, store a file in Azure Blob Storage
    // Returns a promise containing the Azure Blob Storage blob creation response
    createFile(config, filename, data) {
        let containerParams = {};
        if (this._directAccess) {
            containerParams.publicAccessLevel = 'blob';
        }

        return new Promise((resolve, reject) => {
            this._azureBlobStorageClient.createContainerIfNotExists(
                this._container,
                containerParams,
                (cerror, cresult, cresponse) => {
                    if (cerror) {
                        return reject(cerror);
                    }
                    this._azureBlobStorageClient.createBlockBlobFromText(
                        this._container,
                        filename,
                        data,
                        (error, result, response) => {
                            if (error) {
                                return reject(error);
                            }
                            resolve(result);
                        });
                });
        });
    }

    deleteFile(config, filename) {
        return new Promise((resolve, reject) => {
            this._azureBlobStorageClient.deleteBlob(
                this._container,
                filename,
                (error, response) => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(response);
                });
        });
    }

    // Search for and return a file if found by filename
    // Returns a promise that succeeds with the buffer result from Azure Blob Storage
    getFileData(config, filename) {
        return new Promise((resolve, reject) => {
            this._azureBlobStorageClient.getBlobToText(
                this._container,
                filename,
                (error, text, blob, response) => {
                    if (error) {
                        return reject(error);
                    }
                    if(Buffer.isBuffer(text)) {
                        resolve(text);
                    }
                    else {
                        resolve(new Buffer(text, 'utf-8'));
                    }
                    
                });
        });
    }

    // Generates and returns the location of a file stored in Azure Blob Storage for the given request and filename
    // The location is the direct Azure Blob Storage link if the option is set, otherwise we serve the file through parse-server
    getFileLocation(config, filename) {
        if (this._directAccess) {
            return `http://${this._storageAccountName}.blob.core.windows.net/${this._container}/${filename}`;
        }
        return (config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename));
    }
}

export default AzureBlobStorageAdapter;
