export = CheckGroup;
/**
 * @module SecurityCheck
 */
/**
 * A group of security checks.
 * @interface CheckGroup
 */
declare class CheckGroup {
    _name: void;
    _checks: void;
    /**
     * The security check group name; to be overridden by child class.
     */
    setName(): void;
    name(): void;
    /**
     * The security checks; to be overridden by child class.
     */
    setChecks(): void;
    checks(): void;
    /**
     * Runs all checks.
     */
    run(): Promise<void>;
}
