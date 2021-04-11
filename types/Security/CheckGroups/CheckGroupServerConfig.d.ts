export = CheckGroupServerConfig;
declare const CheckGroupServerConfig_base: any;
/**
 * @module SecurityCheck
 */
/**
* The security checks group for Parse Server configuration.
* Checks common Parse Server parameters such as access keys.
*/
declare class CheckGroupServerConfig extends CheckGroupServerConfig_base {
    [x: string]: any;
    setName(): string;
    setChecks(): _Check.Check[];
}
import _Check = require("../Check");
