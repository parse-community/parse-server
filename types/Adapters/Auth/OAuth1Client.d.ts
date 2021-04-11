export = OAuth;
declare class OAuth {
    static encode(str: any): string;
    static nonce(): string;
    static buildParameterString(obj: any): string;
    static buildSignatureString(method: any, url: any, parameters: any): string;
    static signature(text: any, key: any): string;
    static signRequest(request: any, oauth_parameters: any, consumer_secret: any, auth_token_secret: any): any;
    constructor(options: any);
    consumer_key: any;
    consumer_secret: any;
    auth_token: any;
    auth_token_secret: any;
    host: any;
    oauth_params: any;
    signatureMethod: string;
    version: string;
    send(method: any, path: any, params: any, body: any): Promise<any>;
    buildRequest(method: any, path: any, params: any, body: any): {
        host: any;
        path: any;
        method: any;
    };
    get(path: any, params: any): Promise<any>;
    post(path: any, params: any, body: any): Promise<any>;
}
