export var __esModule: boolean;
export default _default;
export class HooksController {
    constructor(applicationId: any, databaseController: any, webhookKey: any);
    _applicationId: any;
    _webhookKey: any;
    database: any;
    load(): any;
    getFunction(functionName: any): any;
    getFunctions(): any;
    getTrigger(className: any, triggerName: any): any;
    getTriggers(): any;
    deleteFunction(functionName: any): any;
    deleteTrigger(className: any, triggerName: any): any;
    _getHooks(query?: {}): any;
    _removeHooks(query: any): any;
    saveHook(hook: any): any;
    addHookToTriggers(hook: any): void;
    addHook(hook: any): any;
    createOrUpdateHook(aHook: any): any;
    createHook(aHook: any): any;
    updateHook(aHook: any): any;
}
declare var _default: typeof HooksController;
