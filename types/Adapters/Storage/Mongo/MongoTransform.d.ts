export function transformKey(className: any, fieldName: any, schema: any): any;
export function parseObjectToMongoObjectForCreate(className: any, restCreate: any, schema: any): {
    _created_at: Date;
    _updated_at: Date;
};
export function transformUpdate(className: any, restUpdate: any, parseFormatSchema: any): {
    $set: {
        _rperm: any;
        _wperm: any;
        _acl: any;
    };
};
export function transformWhere(className: any, restWhere: any, schema: any, count?: boolean): {};
export function mongoObjectToParseObject(className: any, mongoObject: any, schema: any): any;
export function relativeTimeToDate(text: any, now?: Date): {
    status: string;
    info: string;
    result?: undefined;
} | {
    status: string;
    info: string;
    result: Date;
};
export function transformConstraint(constraint: any, field: any, count?: boolean): typeof CannotTransform | {
    $elemMatch: {
        $nin: any[];
    };
    $geoWithin: {
        $centerSphere: any[];
    };
    $maxDistance: any;
};
export function transformPointerString(schema: any, field: any, pointerString: any): {
    __type: string;
    className: any;
    objectId: any;
};
declare function CannotTransform(): void;
export {};
