export var __esModule: boolean;
export default _default;
declare const ClassesRouter_base: any;
export class ClassesRouter extends ClassesRouter_base {
    [x: string]: any;
    static JSONFromQuery(query: any): {};
    static optionsFromBody(body: any): {
        skip: number;
        limit: number;
        order: string;
        count: boolean;
        keys: any;
        excludeKeys: any;
        include: string;
        includeAll: boolean;
        readPreference: any;
        includeReadPreference: any;
        subqueryReadPreference: any;
        hint: any;
        explain: any;
    };
    className(req: any): any;
    handleFind(req: any): any;
    handleGet(req: any): any;
    handleCreate(req: any): any;
    handleUpdate(req: any): any;
    handleDelete(req: any): any;
    mountRoutes(): void;
}
declare var _default: typeof ClassesRouter;
