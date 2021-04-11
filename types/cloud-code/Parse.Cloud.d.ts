export function define(functionName: any, handler: any, validationHandler: any): void;
export function job(functionName: any, handler: any): void;
export function beforeSave(parseClass: any, handler: any, validationHandler: any): void;
export function beforeDelete(parseClass: any, handler: any, validationHandler: any): void;
export function beforeLogin(handler: any, ...args: any[]): void;
export function afterLogin(handler: any, ...args: any[]): void;
export function afterLogout(handler: any, ...args: any[]): void;
export function afterSave(parseClass: any, handler: any, validationHandler: any): void;
export function afterDelete(parseClass: any, handler: any, validationHandler: any): void;
export function beforeFind(parseClass: any, handler: any, validationHandler: any): void;
export function afterFind(parseClass: any, handler: any, validationHandler: any): void;
export function beforeSaveFile(handler: any, validationHandler: any): void;
export function afterSaveFile(handler: any, validationHandler: any): void;
export function beforeDeleteFile(handler: any, validationHandler: any): void;
export function afterDeleteFile(handler: any, validationHandler: any): void;
export function beforeConnect(handler: any, validationHandler: any): void;
export function sendEmail(data: any): any;
export function beforeSubscribe(parseClass: any, handler: any, validationHandler: any): void;
export function onLiveQueryEvent(handler: any): void;
export function afterLiveQueryEvent(parseClass: any, handler: any, validationHandler: any): void;
export function _removeAllHooks(): void;
export function useMasterKey(): void;
export const httpRequest: {
    (options: {
        /**
         * The body of the request. If it is a JSON object, then the Content-Type set in the headers must be application/x-www-form-urlencoded or application/json. You can also set this to a {@link Buffer} object to send raw bytes. If you use a Buffer, you should also set the Content-Type header explicitly to describe what these bytes represent.
         */
        body: any;
        /**
         * The function that is called when the request fails. It will be passed a Parse.Cloud.HTTPResponse object.
         */
        error: Function;
        /**
         * Whether to follow redirects caused by HTTP 3xx responses. Defaults to false.
         */
        followRedirects: boolean;
        /**
         * The headers for the request.
         */
        headers: any;
        /**
         * The method of the request. GET, POST, PUT, DELETE, HEAD, and OPTIONS are supported. Will default to GET if not specified.
         */
        method: string;
        /**
         * The query portion of the url. You can pass a JSON object of key value pairs like params: {q : 'Sean Plott'} or a raw string like params:q=Sean Plott.
         */
        params: any;
        /**
         * The function that is called when the request successfully completes. It will be passed a Parse.Cloud.HTTPResponse object.
         */
        success: Function;
        /**
         * The url to send the request to.
         */
        url: string;
    }): Promise<any>;
    encodeBody: ({ body, headers }: {
        body: any;
        headers?: {};
    }) => {
        body: any;
        headers: {};
    };
};
