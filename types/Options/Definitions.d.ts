export namespace ParseServerOptions {
    namespace accountLockout {
        const env: string;
        const help: string;
        const action: typeof parsers.objectParser;
    }
    namespace allowClientClassCreation {
        const env_1: string;
        export { env_1 as env };
        const help_1: string;
        export { help_1 as help };
        const action_1: typeof parsers.booleanParser;
        export { action_1 as action };
        const _default: boolean;
        export { _default as default };
    }
    namespace allowCustomObjectId {
        const env_2: string;
        export { env_2 as env };
        const help_2: string;
        export { help_2 as help };
        const action_2: typeof parsers.booleanParser;
        export { action_2 as action };
        const _default_1: boolean;
        export { _default_1 as default };
    }
    namespace allowHeaders {
        const env_3: string;
        export { env_3 as env };
        const help_3: string;
        export { help_3 as help };
        const action_3: typeof parsers.arrayParser;
        export { action_3 as action };
    }
    namespace allowOrigin {
        const env_4: string;
        export { env_4 as env };
        const help_4: string;
        export { help_4 as help };
    }
    namespace analyticsAdapter {
        const env_5: string;
        export { env_5 as env };
        const help_5: string;
        export { help_5 as help };
        const action_4: typeof parsers.moduleOrObjectParser;
        export { action_4 as action };
    }
    namespace appId {
        const env_6: string;
        export { env_6 as env };
        const help_6: string;
        export { help_6 as help };
        export const required: boolean;
    }
    namespace appName {
        const env_7: string;
        export { env_7 as env };
        const help_7: string;
        export { help_7 as help };
    }
    namespace auth {
        const env_8: string;
        export { env_8 as env };
        const help_8: string;
        export { help_8 as help };
        const action_5: typeof parsers.objectParser;
        export { action_5 as action };
    }
    namespace cacheAdapter {
        const env_9: string;
        export { env_9 as env };
        const help_9: string;
        export { help_9 as help };
        const action_6: typeof parsers.moduleOrObjectParser;
        export { action_6 as action };
    }
    namespace cacheMaxSize {
        const env_10: string;
        export { env_10 as env };
        const help_10: string;
        export { help_10 as help };
        const action_7: (opt: any) => number;
        export { action_7 as action };
        const _default_2: number;
        export { _default_2 as default };
    }
    namespace cacheTTL {
        const env_11: string;
        export { env_11 as env };
        const help_11: string;
        export { help_11 as help };
        const action_8: (opt: any) => number;
        export { action_8 as action };
        const _default_3: number;
        export { _default_3 as default };
    }
    namespace clientKey {
        const env_12: string;
        export { env_12 as env };
        const help_12: string;
        export { help_12 as help };
    }
    namespace cloud {
        const env_13: string;
        export { env_13 as env };
        const help_13: string;
        export { help_13 as help };
    }
    namespace cluster {
        const env_14: string;
        export { env_14 as env };
        const help_14: string;
        export { help_14 as help };
        const action_9: any;
        export { action_9 as action };
    }
    namespace collectionPrefix {
        const env_15: string;
        export { env_15 as env };
        const help_15: string;
        export { help_15 as help };
        const _default_4: string;
        export { _default_4 as default };
    }
    namespace customPages {
        const env_16: string;
        export { env_16 as env };
        const help_16: string;
        export { help_16 as help };
        const action_10: typeof parsers.objectParser;
        export { action_10 as action };
        const _default_5: {};
        export { _default_5 as default };
    }
    namespace databaseAdapter {
        const env_17: string;
        export { env_17 as env };
        const help_17: string;
        export { help_17 as help };
        const action_11: typeof parsers.moduleOrObjectParser;
        export { action_11 as action };
    }
    namespace databaseOptions {
        const env_18: string;
        export { env_18 as env };
        const help_18: string;
        export { help_18 as help };
        const action_12: typeof parsers.objectParser;
        export { action_12 as action };
    }
    namespace databaseURI {
        const env_19: string;
        export { env_19 as env };
        const help_19: string;
        export { help_19 as help };
        const required_1: boolean;
        export { required_1 as required };
        const _default_6: string;
        export { _default_6 as default };
    }
    namespace directAccess {
        const env_20: string;
        export { env_20 as env };
        const help_20: string;
        export { help_20 as help };
        const action_13: typeof parsers.booleanParser;
        export { action_13 as action };
        const _default_7: boolean;
        export { _default_7 as default };
    }
    namespace dotNetKey {
        const env_21: string;
        export { env_21 as env };
        const help_21: string;
        export { help_21 as help };
    }
    namespace emailAdapter {
        const env_22: string;
        export { env_22 as env };
        const help_22: string;
        export { help_22 as help };
        const action_14: typeof parsers.moduleOrObjectParser;
        export { action_14 as action };
    }
    namespace emailVerifyTokenReuseIfValid {
        const env_23: string;
        export { env_23 as env };
        const help_23: string;
        export { help_23 as help };
        const action_15: typeof parsers.booleanParser;
        export { action_15 as action };
        const _default_8: boolean;
        export { _default_8 as default };
    }
    namespace emailVerifyTokenValidityDuration {
        const env_24: string;
        export { env_24 as env };
        const help_24: string;
        export { help_24 as help };
        const action_16: (opt: any) => number;
        export { action_16 as action };
    }
    namespace enableAnonymousUsers {
        const env_25: string;
        export { env_25 as env };
        const help_25: string;
        export { help_25 as help };
        const action_17: typeof parsers.booleanParser;
        export { action_17 as action };
        const _default_9: boolean;
        export { _default_9 as default };
    }
    namespace enableExpressErrorHandler {
        const env_26: string;
        export { env_26 as env };
        const help_26: string;
        export { help_26 as help };
        const action_18: typeof parsers.booleanParser;
        export { action_18 as action };
        const _default_10: boolean;
        export { _default_10 as default };
    }
    namespace encryptionKey {
        const env_27: string;
        export { env_27 as env };
        const help_27: string;
        export { help_27 as help };
    }
    namespace expireInactiveSessions {
        const env_28: string;
        export { env_28 as env };
        const help_28: string;
        export { help_28 as help };
        const action_19: typeof parsers.booleanParser;
        export { action_19 as action };
        const _default_11: boolean;
        export { _default_11 as default };
    }
    namespace fileKey {
        const env_29: string;
        export { env_29 as env };
        const help_29: string;
        export { help_29 as help };
    }
    namespace filesAdapter {
        const env_30: string;
        export { env_30 as env };
        const help_30: string;
        export { help_30 as help };
        const action_20: typeof parsers.moduleOrObjectParser;
        export { action_20 as action };
    }
    namespace fileUpload {
        const env_31: string;
        export { env_31 as env };
        const help_31: string;
        export { help_31 as help };
        const action_21: typeof parsers.objectParser;
        export { action_21 as action };
        const _default_12: {};
        export { _default_12 as default };
    }
    namespace graphQLPath {
        const env_32: string;
        export { env_32 as env };
        const help_32: string;
        export { help_32 as help };
        const _default_13: string;
        export { _default_13 as default };
    }
    namespace graphQLSchema {
        const env_33: string;
        export { env_33 as env };
        const help_33: string;
        export { help_33 as help };
    }
    namespace host {
        const env_34: string;
        export { env_34 as env };
        const help_34: string;
        export { help_34 as help };
        const _default_14: string;
        export { _default_14 as default };
    }
    namespace idempotencyOptions {
        const env_35: string;
        export { env_35 as env };
        const help_35: string;
        export { help_35 as help };
        const action_22: typeof parsers.objectParser;
        export { action_22 as action };
        const _default_15: {};
        export { _default_15 as default };
    }
    namespace javascriptKey {
        const env_36: string;
        export { env_36 as env };
        const help_36: string;
        export { help_36 as help };
    }
    namespace jsonLogs {
        const env_37: string;
        export { env_37 as env };
        const help_37: string;
        export { help_37 as help };
        const action_23: typeof parsers.booleanParser;
        export { action_23 as action };
    }
    namespace liveQuery {
        const env_38: string;
        export { env_38 as env };
        const help_38: string;
        export { help_38 as help };
        const action_24: typeof parsers.objectParser;
        export { action_24 as action };
    }
    namespace liveQueryServerOptions {
        const env_39: string;
        export { env_39 as env };
        const help_39: string;
        export { help_39 as help };
        const action_25: typeof parsers.objectParser;
        export { action_25 as action };
    }
    namespace loggerAdapter {
        const env_40: string;
        export { env_40 as env };
        const help_40: string;
        export { help_40 as help };
        const action_26: typeof parsers.moduleOrObjectParser;
        export { action_26 as action };
    }
    namespace logLevel {
        const env_41: string;
        export { env_41 as env };
        const help_41: string;
        export { help_41 as help };
    }
    namespace logsFolder {
        const env_42: string;
        export { env_42 as env };
        const help_42: string;
        export { help_42 as help };
        const _default_16: string;
        export { _default_16 as default };
    }
    namespace masterKey {
        const env_43: string;
        export { env_43 as env };
        const help_43: string;
        export { help_43 as help };
        const required_2: boolean;
        export { required_2 as required };
    }
    namespace masterKeyIps {
        const env_44: string;
        export { env_44 as env };
        const help_44: string;
        export { help_44 as help };
        const action_27: typeof parsers.arrayParser;
        export { action_27 as action };
        const _default_17: any[];
        export { _default_17 as default };
    }
    namespace maxLimit {
        const env_45: string;
        export { env_45 as env };
        const help_45: string;
        export { help_45 as help };
        const action_28: (opt: any) => number;
        export { action_28 as action };
    }
    namespace maxLogFiles {
        const env_46: string;
        export { env_46 as env };
        const help_46: string;
        export { help_46 as help };
        const action_29: typeof parsers.objectParser;
        export { action_29 as action };
    }
    namespace maxUploadSize {
        const env_47: string;
        export { env_47 as env };
        const help_47: string;
        export { help_47 as help };
        const _default_18: string;
        export { _default_18 as default };
    }
    namespace middleware {
        const env_48: string;
        export { env_48 as env };
        const help_48: string;
        export { help_48 as help };
    }
    namespace mountGraphQL {
        const env_49: string;
        export { env_49 as env };
        const help_49: string;
        export { help_49 as help };
        const action_30: typeof parsers.booleanParser;
        export { action_30 as action };
        const _default_19: boolean;
        export { _default_19 as default };
    }
    namespace mountPath {
        const env_50: string;
        export { env_50 as env };
        const help_50: string;
        export { help_50 as help };
        const _default_20: string;
        export { _default_20 as default };
    }
    namespace mountPlayground {
        const env_51: string;
        export { env_51 as env };
        const help_51: string;
        export { help_51 as help };
        const action_31: typeof parsers.booleanParser;
        export { action_31 as action };
        const _default_21: boolean;
        export { _default_21 as default };
    }
    namespace objectIdSize {
        const env_52: string;
        export { env_52 as env };
        const help_52: string;
        export { help_52 as help };
        const action_32: (opt: any) => number;
        export { action_32 as action };
        const _default_22: number;
        export { _default_22 as default };
    }
    namespace pages {
        const env_53: string;
        export { env_53 as env };
        const help_53: string;
        export { help_53 as help };
        const action_33: typeof parsers.objectParser;
        export { action_33 as action };
        const _default_23: {};
        export { _default_23 as default };
    }
    namespace passwordPolicy {
        const env_54: string;
        export { env_54 as env };
        const help_54: string;
        export { help_54 as help };
        const action_34: typeof parsers.objectParser;
        export { action_34 as action };
    }
    namespace playgroundPath {
        const env_55: string;
        export { env_55 as env };
        const help_55: string;
        export { help_55 as help };
        const _default_24: string;
        export { _default_24 as default };
    }
    namespace port {
        const env_56: string;
        export { env_56 as env };
        const help_56: string;
        export { help_56 as help };
        const action_35: (opt: any) => number;
        export { action_35 as action };
        const _default_25: number;
        export { _default_25 as default };
    }
    namespace preserveFileName {
        const env_57: string;
        export { env_57 as env };
        const help_57: string;
        export { help_57 as help };
        const action_36: typeof parsers.booleanParser;
        export { action_36 as action };
        const _default_26: boolean;
        export { _default_26 as default };
    }
    namespace preventLoginWithUnverifiedEmail {
        const env_58: string;
        export { env_58 as env };
        const help_58: string;
        export { help_58 as help };
        const action_37: typeof parsers.booleanParser;
        export { action_37 as action };
        const _default_27: boolean;
        export { _default_27 as default };
    }
    namespace protectedFields {
        const env_59: string;
        export { env_59 as env };
        const help_59: string;
        export { help_59 as help };
        const action_38: typeof parsers.objectParser;
        export { action_38 as action };
        namespace _default_28 {
            const _User: {
                '*': string[];
            };
        }
        export { _default_28 as default };
    }
    namespace publicServerURL {
        const env_60: string;
        export { env_60 as env };
        const help_60: string;
        export { help_60 as help };
    }
    namespace push {
        const env_61: string;
        export { env_61 as env };
        const help_61: string;
        export { help_61 as help };
        const action_39: typeof parsers.objectParser;
        export { action_39 as action };
    }
    namespace readOnlyMasterKey {
        const env_62: string;
        export { env_62 as env };
        const help_62: string;
        export { help_62 as help };
    }
    namespace restAPIKey {
        const env_63: string;
        export { env_63 as env };
        const help_63: string;
        export { help_63 as help };
    }
    namespace revokeSessionOnPasswordReset {
        const env_64: string;
        export { env_64 as env };
        const help_64: string;
        export { help_64 as help };
        const action_40: typeof parsers.booleanParser;
        export { action_40 as action };
        const _default_29: boolean;
        export { _default_29 as default };
    }
    namespace scheduledPush {
        const env_65: string;
        export { env_65 as env };
        const help_65: string;
        export { help_65 as help };
        const action_41: typeof parsers.booleanParser;
        export { action_41 as action };
        const _default_30: boolean;
        export { _default_30 as default };
    }
    namespace security {
        const env_66: string;
        export { env_66 as env };
        const help_66: string;
        export { help_66 as help };
        const action_42: typeof parsers.objectParser;
        export { action_42 as action };
        const _default_31: {};
        export { _default_31 as default };
    }
    namespace serverCloseComplete {
        const env_67: string;
        export { env_67 as env };
        const help_67: string;
        export { help_67 as help };
    }
    namespace serverStartComplete {
        const env_68: string;
        export { env_68 as env };
        const help_68: string;
        export { help_68 as help };
    }
    namespace serverURL {
        const env_69: string;
        export { env_69 as env };
        const help_69: string;
        export { help_69 as help };
        const required_3: boolean;
        export { required_3 as required };
    }
    namespace sessionLength {
        const env_70: string;
        export { env_70 as env };
        const help_70: string;
        export { help_70 as help };
        const action_43: (opt: any) => number;
        export { action_43 as action };
        const _default_32: number;
        export { _default_32 as default };
    }
    namespace silent {
        const env_71: string;
        export { env_71 as env };
        const help_71: string;
        export { help_71 as help };
        const action_44: typeof parsers.booleanParser;
        export { action_44 as action };
    }
    namespace startLiveQueryServer {
        const env_72: string;
        export { env_72 as env };
        const help_72: string;
        export { help_72 as help };
        const action_45: typeof parsers.booleanParser;
        export { action_45 as action };
    }
    namespace userSensitiveFields {
        const env_73: string;
        export { env_73 as env };
        const help_73: string;
        export { help_73 as help };
        const action_46: typeof parsers.arrayParser;
        export { action_46 as action };
    }
    namespace verbose {
        const env_74: string;
        export { env_74 as env };
        const help_74: string;
        export { help_74 as help };
        const action_47: typeof parsers.booleanParser;
        export { action_47 as action };
    }
    namespace verifyUserEmails {
        const env_75: string;
        export { env_75 as env };
        const help_75: string;
        export { help_75 as help };
        const action_48: typeof parsers.booleanParser;
        export { action_48 as action };
        const _default_33: boolean;
        export { _default_33 as default };
    }
    namespace webhookKey {
        const env_76: string;
        export { env_76 as env };
        const help_76: string;
        export { help_76 as help };
    }
}
export namespace SecurityOptions {
    namespace checkGroups {
        const env_77: string;
        export { env_77 as env };
        const help_77: string;
        export { help_77 as help };
        const action_49: typeof parsers.arrayParser;
        export { action_49 as action };
    }
    namespace enableCheck {
        const env_78: string;
        export { env_78 as env };
        const help_78: string;
        export { help_78 as help };
        const action_50: typeof parsers.booleanParser;
        export { action_50 as action };
        const _default_34: boolean;
        export { _default_34 as default };
    }
    namespace enableCheckLog {
        const env_79: string;
        export { env_79 as env };
        const help_79: string;
        export { help_79 as help };
        const action_51: typeof parsers.booleanParser;
        export { action_51 as action };
        const _default_35: boolean;
        export { _default_35 as default };
    }
}
export namespace PagesOptions {
    namespace customRoutes {
        const env_80: string;
        export { env_80 as env };
        const help_80: string;
        export { help_80 as help };
        const action_52: typeof parsers.arrayParser;
        export { action_52 as action };
        const _default_36: any[];
        export { _default_36 as default };
    }
    namespace customUrls {
        const env_81: string;
        export { env_81 as env };
        const help_81: string;
        export { help_81 as help };
        const action_53: typeof parsers.objectParser;
        export { action_53 as action };
        const _default_37: {};
        export { _default_37 as default };
    }
    namespace enableLocalization {
        const env_82: string;
        export { env_82 as env };
        const help_82: string;
        export { help_82 as help };
        const action_54: typeof parsers.booleanParser;
        export { action_54 as action };
        const _default_38: boolean;
        export { _default_38 as default };
    }
    namespace enableRouter {
        const env_83: string;
        export { env_83 as env };
        const help_83: string;
        export { help_83 as help };
        const action_55: typeof parsers.booleanParser;
        export { action_55 as action };
        const _default_39: boolean;
        export { _default_39 as default };
    }
    namespace forceRedirect {
        const env_84: string;
        export { env_84 as env };
        const help_84: string;
        export { help_84 as help };
        const action_56: typeof parsers.booleanParser;
        export { action_56 as action };
        const _default_40: boolean;
        export { _default_40 as default };
    }
    namespace localizationFallbackLocale {
        const env_85: string;
        export { env_85 as env };
        const help_85: string;
        export { help_85 as help };
        const _default_41: string;
        export { _default_41 as default };
    }
    namespace localizationJsonPath {
        const env_86: string;
        export { env_86 as env };
        const help_86: string;
        export { help_86 as help };
    }
    namespace pagesEndpoint {
        const env_87: string;
        export { env_87 as env };
        const help_87: string;
        export { help_87 as help };
        const _default_42: string;
        export { _default_42 as default };
    }
    namespace pagesPath {
        const env_88: string;
        export { env_88 as env };
        const help_88: string;
        export { help_88 as help };
        const _default_43: string;
        export { _default_43 as default };
    }
    namespace placeholders {
        const env_89: string;
        export { env_89 as env };
        const help_89: string;
        export { help_89 as help };
        const action_57: typeof parsers.objectParser;
        export { action_57 as action };
        const _default_44: {};
        export { _default_44 as default };
    }
}
export namespace PagesRoute {
    namespace handler {
        const env_90: string;
        export { env_90 as env };
        const help_90: string;
        export { help_90 as help };
        const required_4: boolean;
        export { required_4 as required };
    }
    namespace method {
        const env_91: string;
        export { env_91 as env };
        const help_91: string;
        export { help_91 as help };
        const required_5: boolean;
        export { required_5 as required };
    }
    namespace path {
        const env_92: string;
        export { env_92 as env };
        const help_92: string;
        export { help_92 as help };
        const required_6: boolean;
        export { required_6 as required };
    }
}
export namespace PagesCustomUrlsOptions {
    namespace emailVerificationLinkExpired {
        const env_93: string;
        export { env_93 as env };
        const help_93: string;
        export { help_93 as help };
    }
    namespace emailVerificationLinkInvalid {
        const env_94: string;
        export { env_94 as env };
        const help_94: string;
        export { help_94 as help };
    }
    namespace emailVerificationSendFail {
        const env_95: string;
        export { env_95 as env };
        const help_95: string;
        export { help_95 as help };
    }
    namespace emailVerificationSendSuccess {
        const env_96: string;
        export { env_96 as env };
        const help_96: string;
        export { help_96 as help };
    }
    namespace emailVerificationSuccess {
        const env_97: string;
        export { env_97 as env };
        const help_97: string;
        export { help_97 as help };
    }
    namespace passwordReset {
        const env_98: string;
        export { env_98 as env };
        const help_98: string;
        export { help_98 as help };
    }
    namespace passwordResetLinkInvalid {
        const env_99: string;
        export { env_99 as env };
        const help_99: string;
        export { help_99 as help };
    }
    namespace passwordResetSuccess {
        const env_100: string;
        export { env_100 as env };
        const help_100: string;
        export { help_100 as help };
    }
}
export namespace CustomPagesOptions {
    export namespace choosePassword {
        const env_101: string;
        export { env_101 as env };
        const help_101: string;
        export { help_101 as help };
    }
    export namespace expiredVerificationLink {
        const env_102: string;
        export { env_102 as env };
        const help_102: string;
        export { help_102 as help };
    }
    export namespace invalidLink {
        const env_103: string;
        export { env_103 as env };
        const help_103: string;
        export { help_103 as help };
    }
    export namespace invalidPasswordResetLink {
        const env_104: string;
        export { env_104 as env };
        const help_104: string;
        export { help_104 as help };
    }
    export namespace invalidVerificationLink {
        const env_105: string;
        export { env_105 as env };
        const help_105: string;
        export { help_105 as help };
    }
    export namespace linkSendFail {
        const env_106: string;
        export { env_106 as env };
        const help_106: string;
        export { help_106 as help };
    }
    export namespace linkSendSuccess {
        const env_107: string;
        export { env_107 as env };
        const help_107: string;
        export { help_107 as help };
    }
    export namespace parseFrameURL {
        const env_108: string;
        export { env_108 as env };
        const help_108: string;
        export { help_108 as help };
    }
    export namespace passwordResetSuccess_1 {
        const env_109: string;
        export { env_109 as env };
        const help_109: string;
        export { help_109 as help };
    }
    export { passwordResetSuccess_1 as passwordResetSuccess };
    export namespace verifyEmailSuccess {
        const env_110: string;
        export { env_110 as env };
        const help_110: string;
        export { help_110 as help };
    }
}
export namespace LiveQueryOptions {
    namespace classNames {
        const env_111: string;
        export { env_111 as env };
        const help_111: string;
        export { help_111 as help };
        const action_58: typeof parsers.arrayParser;
        export { action_58 as action };
    }
    namespace pubSubAdapter {
        const env_112: string;
        export { env_112 as env };
        const help_112: string;
        export { help_112 as help };
        const action_59: typeof parsers.moduleOrObjectParser;
        export { action_59 as action };
    }
    namespace redisOptions {
        const env_113: string;
        export { env_113 as env };
        const help_113: string;
        export { help_113 as help };
        const action_60: typeof parsers.objectParser;
        export { action_60 as action };
    }
    namespace redisURL {
        const env_114: string;
        export { env_114 as env };
        const help_114: string;
        export { help_114 as help };
    }
    namespace wssAdapter {
        const env_115: string;
        export { env_115 as env };
        const help_115: string;
        export { help_115 as help };
        const action_61: typeof parsers.moduleOrObjectParser;
        export { action_61 as action };
    }
}
export namespace LiveQueryServerOptions {
    export namespace appId_1 {
        const env_116: string;
        export { env_116 as env };
        const help_116: string;
        export { help_116 as help };
    }
    export { appId_1 as appId };
    export namespace cacheTimeout {
        const env_117: string;
        export { env_117 as env };
        const help_117: string;
        export { help_117 as help };
        const action_62: (opt: any) => number;
        export { action_62 as action };
    }
    export namespace keyPairs {
        const env_118: string;
        export { env_118 as env };
        const help_118: string;
        export { help_118 as help };
        const action_63: typeof parsers.objectParser;
        export { action_63 as action };
    }
    export namespace logLevel_1 {
        const env_119: string;
        export { env_119 as env };
        const help_119: string;
        export { help_119 as help };
    }
    export { logLevel_1 as logLevel };
    export namespace masterKey_1 {
        const env_120: string;
        export { env_120 as env };
        const help_120: string;
        export { help_120 as help };
    }
    export { masterKey_1 as masterKey };
    export namespace port_1 {
        const env_121: string;
        export { env_121 as env };
        const help_121: string;
        export { help_121 as help };
        const action_64: (opt: any) => number;
        export { action_64 as action };
        const _default_45: number;
        export { _default_45 as default };
    }
    export { port_1 as port };
    export namespace pubSubAdapter_1 {
        const env_122: string;
        export { env_122 as env };
        const help_122: string;
        export { help_122 as help };
        const action_65: typeof parsers.moduleOrObjectParser;
        export { action_65 as action };
    }
    export { pubSubAdapter_1 as pubSubAdapter };
    export namespace redisOptions_1 {
        const env_123: string;
        export { env_123 as env };
        const help_123: string;
        export { help_123 as help };
        const action_66: typeof parsers.objectParser;
        export { action_66 as action };
    }
    export { redisOptions_1 as redisOptions };
    export namespace redisURL_1 {
        const env_124: string;
        export { env_124 as env };
        const help_124: string;
        export { help_124 as help };
    }
    export { redisURL_1 as redisURL };
    export namespace serverURL_1 {
        const env_125: string;
        export { env_125 as env };
        const help_125: string;
        export { help_125 as help };
    }
    export { serverURL_1 as serverURL };
    export namespace websocketTimeout {
        const env_126: string;
        export { env_126 as env };
        const help_126: string;
        export { help_126 as help };
        const action_67: (opt: any) => number;
        export { action_67 as action };
    }
    export namespace wssAdapter_1 {
        const env_127: string;
        export { env_127 as env };
        const help_127: string;
        export { help_127 as help };
        const action_68: typeof parsers.moduleOrObjectParser;
        export { action_68 as action };
    }
    export { wssAdapter_1 as wssAdapter };
}
export namespace IdempotencyOptions {
    namespace paths {
        const env_128: string;
        export { env_128 as env };
        const help_128: string;
        export { help_128 as help };
        const action_69: typeof parsers.arrayParser;
        export { action_69 as action };
        const _default_46: any[];
        export { _default_46 as default };
    }
    namespace ttl {
        const env_129: string;
        export { env_129 as env };
        const help_129: string;
        export { help_129 as help };
        const action_70: (opt: any) => number;
        export { action_70 as action };
        const _default_47: number;
        export { _default_47 as default };
    }
}
export namespace AccountLockoutOptions {
    namespace duration {
        const env_130: string;
        export { env_130 as env };
        const help_130: string;
        export { help_130 as help };
        const action_71: (opt: any) => number;
        export { action_71 as action };
    }
    namespace threshold {
        const env_131: string;
        export { env_131 as env };
        const help_131: string;
        export { help_131 as help };
        const action_72: (opt: any) => number;
        export { action_72 as action };
    }
    namespace unlockOnPasswordReset {
        const env_132: string;
        export { env_132 as env };
        const help_132: string;
        export { help_132 as help };
        const action_73: typeof parsers.booleanParser;
        export { action_73 as action };
        const _default_48: boolean;
        export { _default_48 as default };
    }
}
export namespace PasswordPolicyOptions {
    namespace doNotAllowUsername {
        const env_133: string;
        export { env_133 as env };
        const help_133: string;
        export { help_133 as help };
        const action_74: typeof parsers.booleanParser;
        export { action_74 as action };
        const _default_49: boolean;
        export { _default_49 as default };
    }
    namespace maxPasswordAge {
        const env_134: string;
        export { env_134 as env };
        const help_134: string;
        export { help_134 as help };
        const action_75: (opt: any) => number;
        export { action_75 as action };
    }
    namespace maxPasswordHistory {
        const env_135: string;
        export { env_135 as env };
        const help_135: string;
        export { help_135 as help };
        const action_76: (opt: any) => number;
        export { action_76 as action };
    }
    namespace resetTokenReuseIfValid {
        const env_136: string;
        export { env_136 as env };
        const help_136: string;
        export { help_136 as help };
        const action_77: typeof parsers.booleanParser;
        export { action_77 as action };
        const _default_50: boolean;
        export { _default_50 as default };
    }
    namespace resetTokenValidityDuration {
        const env_137: string;
        export { env_137 as env };
        const help_137: string;
        export { help_137 as help };
        const action_78: (opt: any) => number;
        export { action_78 as action };
    }
    namespace validationError {
        const env_138: string;
        export { env_138 as env };
        const help_138: string;
        export { help_138 as help };
    }
    namespace validatorCallback {
        const env_139: string;
        export { env_139 as env };
        const help_139: string;
        export { help_139 as help };
    }
    namespace validatorPattern {
        const env_140: string;
        export { env_140 as env };
        const help_140: string;
        export { help_140 as help };
    }
}
export namespace FileUploadOptions {
    namespace enableForAnonymousUser {
        const env_141: string;
        export { env_141 as env };
        const help_141: string;
        export { help_141 as help };
        const action_79: typeof parsers.booleanParser;
        export { action_79 as action };
        const _default_51: boolean;
        export { _default_51 as default };
    }
    namespace enableForAuthenticatedUser {
        const env_142: string;
        export { env_142 as env };
        const help_142: string;
        export { help_142 as help };
        const action_80: typeof parsers.booleanParser;
        export { action_80 as action };
        const _default_52: boolean;
        export { _default_52 as default };
    }
    namespace enableForPublic {
        const env_143: string;
        export { env_143 as env };
        const help_143: string;
        export { help_143 as help };
        const action_81: typeof parsers.booleanParser;
        export { action_81 as action };
        const _default_53: boolean;
        export { _default_53 as default };
    }
}
export namespace DatabaseOptions {
    namespace enableSchemaHooks {
        const env_144: string;
        export { env_144 as env };
        const help_144: string;
        export { help_144 as help };
        const action_82: typeof parsers.booleanParser;
        export { action_82 as action };
        const _default_54: boolean;
        export { _default_54 as default };
    }
}
import parsers = require("./parsers");
