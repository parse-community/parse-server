export = CheckGroupDatabase;
declare const CheckGroupDatabase_base: any;
/**
 * @module SecurityCheck
 */
/**
* The security checks group for Parse Server configuration.
* Checks common Parse Server parameters such as access keys.
*/
declare class CheckGroupDatabase extends CheckGroupDatabase_base {
    [x: string]: any;
    setName(): string;
    setChecks(): _Check.Check[];
}
import _Check = require("../Check");
