export function Auth({ config, cacheController, isMaster, isReadOnly, user, installationId }: {
    config: any;
    cacheController?: any;
    isMaster?: boolean;
    isReadOnly?: boolean;
    user: any;
    installationId: any;
}): void;
export class Auth {
    constructor({ config, cacheController, isMaster, isReadOnly, user, installationId }: {
        config: any;
        cacheController?: any;
        isMaster?: boolean;
        isReadOnly?: boolean;
        user: any;
        installationId: any;
    });
    config: any;
    cacheController: any;
    installationId: any;
    isMaster: boolean;
    user: any;
    isReadOnly: boolean;
    userRoles: any[];
    fetchedRoles: boolean;
    rolePromise: Promise<any>;
    isUnauthenticated(): boolean;
    getUserRoles(): Promise<any>;
    getRolesForUser(): Promise<any[]>;
    _loadRoles(): Promise<any>;
    cacheRoles(): boolean;
    getRolesByIds(ins: any): Promise<any[]>;
    _getAllRolesNamesForRoleIds(roleIDs: any, names?: any[], queriedRoles?: {}): any;
}
export function master(config: any): Auth;
export function nobody(config: any): Auth;
export function readOnly(config: any): Auth;
export function getAuthForSessionToken({ config, cacheController, sessionToken, installationId }: {
    config: any;
    cacheController: any;
    sessionToken: any;
    installationId: any;
}): Promise<Auth>;
export function getAuthForLegacySessionToken({ config, sessionToken, installationId }: {
    config: any;
    sessionToken: any;
    installationId: any;
}): any;
