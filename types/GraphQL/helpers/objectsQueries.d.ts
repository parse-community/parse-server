export var __esModule: boolean;
export function needToGetAllKeys(fields: any, keys: any, parseClasses: any): any;
export function getObject(className: any, objectId: any, keys: any, include: any, readPreference: any, includeReadPreference: any, config: any, auth: any, info: any, parseClasses: any): Promise<any>;
export function findObjects(className: any, where: any, order: any, skipInput: any, first: any, after: any, last: any, before: any, keys: any, include: any, includeAll: any, readPreference: any, includeReadPreference: any, subqueryReadPreference: any, config: any, auth: any, info: any, selectedFields: any, parseClasses: any): Promise<{
    edges: any;
    pageInfo: {
        hasPreviousPage: boolean;
        startCursor: any;
        endCursor: any;
        hasNextPage: boolean;
    };
    count: any;
}>;
export function calculateSkipAndLimit(skipInput: any, first: any, after: any, last: any, before: any, maxLimit: any): {
    skip: any;
    limit: any;
    needToPreCount: boolean;
};
