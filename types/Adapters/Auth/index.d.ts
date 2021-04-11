declare function _exports(authOptions?: {}, enableAnonymousUsers?: boolean): Readonly<{
    getValidatorForProvider: (provider: any) => (authData: any) => any;
    setEnableAnonymousUsers: (enable: any) => void;
}>;
declare namespace _exports {
    export { loadAuthAdapter };
}
export = _exports;
declare function loadAuthAdapter(provider: any, authOptions: any): {
    adapter: any;
    appIds: any;
    providerOptions: any;
};
