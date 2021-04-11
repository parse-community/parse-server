export function parseQueryParams(queryString: any): any;
export function getDatabaseOptionsFromURI(uri: any): {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: {};
    binary: boolean;
    client_encoding: any;
    application_name: any;
    fallback_application_name: any;
    poolSize: number;
    max: number;
    query_timeout: number;
    idleTimeoutMillis: number;
    keepAlive: boolean;
};
