export var __esModule: boolean;
export default _default;
declare const AnalyticsController_base: any;
export class AnalyticsController extends AnalyticsController_base {
    [x: string]: any;
    appOpened(req: any): Promise<{
        response: any;
    } | {
        response: {};
    }>;
    trackEvent(req: any): Promise<{
        response: any;
    } | {
        response: {};
    }>;
    expectedAdapterType(): typeof _AnalyticsAdapter.AnalyticsAdapter;
}
declare var _default: typeof AnalyticsController;
import _AnalyticsAdapter = require("../Adapters/Analytics/AnalyticsAdapter");
