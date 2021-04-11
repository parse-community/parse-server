export = Id;
declare class Id {
    static fromString(str: any): Id;
    constructor(className: any, objectId: any);
    className: any;
    objectId: any;
    toString(): string;
}
