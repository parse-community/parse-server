export var __esModule: boolean;
export default _default;
declare namespace _default {
    export { general };
    export { connect };
    export { subscribe };
    export { update };
    export { unsubscribe };
}
declare namespace general {
    const title: string;
    const type: string;
    namespace properties {
        namespace op {
            const type_1: string;
            export { type_1 as type };
            const _enum: string[];
            export { _enum as enum };
        }
    }
    const required: string[];
}
declare namespace connect {
    const title_1: string;
    export { title_1 as title };
    const type_2: string;
    export { type_2 as type };
    export namespace properties_1 {
        const op_1: string;
        export { op_1 as op };
        export namespace applicationId {
            const type_3: string;
            export { type_3 as type };
        }
        export namespace javascriptKey {
            const type_4: string;
            export { type_4 as type };
        }
        export namespace masterKey {
            const type_5: string;
            export { type_5 as type };
        }
        export namespace clientKey {
            const type_6: string;
            export { type_6 as type };
        }
        export namespace windowsKey {
            const type_7: string;
            export { type_7 as type };
        }
        export namespace restAPIKey {
            const type_8: string;
            export { type_8 as type };
        }
        export namespace sessionToken {
            const type_9: string;
            export { type_9 as type };
        }
        export namespace installationId {
            const type_10: string;
            export { type_10 as type };
        }
    }
    export { properties_1 as properties };
    const required_1: string[];
    export { required_1 as required };
    export const additionalProperties: boolean;
}
declare namespace subscribe {
    const title_2: string;
    export { title_2 as title };
    const type_11: string;
    export { type_11 as type };
    export namespace properties_2 {
        const op_2: string;
        export { op_2 as op };
        export namespace requestId {
            const type_12: string;
            export { type_12 as type };
        }
        export namespace query {
            const title_3: string;
            export { title_3 as title };
            const type_13: string;
            export { type_13 as type };
            export namespace properties_3 {
                namespace className {
                    const type_14: string;
                    export { type_14 as type };
                }
                namespace where {
                    const type_15: string;
                    export { type_15 as type };
                }
                namespace fields {
                    const type_16: string;
                    export { type_16 as type };
                    export namespace items {
                        const type_17: string;
                        export { type_17 as type };
                    }
                    export const minItems: number;
                    export const uniqueItems: boolean;
                }
            }
            export { properties_3 as properties };
            const required_2: string[];
            export { required_2 as required };
            const additionalProperties_1: boolean;
            export { additionalProperties_1 as additionalProperties };
        }
        export namespace sessionToken_1 {
            const type_18: string;
            export { type_18 as type };
        }
        export { sessionToken_1 as sessionToken };
    }
    export { properties_2 as properties };
    const required_3: string[];
    export { required_3 as required };
    const additionalProperties_2: boolean;
    export { additionalProperties_2 as additionalProperties };
}
declare namespace update {
    const title_4: string;
    export { title_4 as title };
    const type_19: string;
    export { type_19 as type };
    export namespace properties_4 {
        const op_3: string;
        export { op_3 as op };
        export namespace requestId_1 {
            const type_20: string;
            export { type_20 as type };
        }
        export { requestId_1 as requestId };
        export namespace query_1 {
            const title_5: string;
            export { title_5 as title };
            const type_21: string;
            export { type_21 as type };
            export namespace properties_5 {
                export namespace className_1 {
                    const type_22: string;
                    export { type_22 as type };
                }
                export { className_1 as className };
                export namespace where_1 {
                    const type_23: string;
                    export { type_23 as type };
                }
                export { where_1 as where };
                export namespace fields_1 {
                    const type_24: string;
                    export { type_24 as type };
                    export namespace items_1 {
                        const type_25: string;
                        export { type_25 as type };
                    }
                    export { items_1 as items };
                    const minItems_1: number;
                    export { minItems_1 as minItems };
                    const uniqueItems_1: boolean;
                    export { uniqueItems_1 as uniqueItems };
                }
                export { fields_1 as fields };
            }
            export { properties_5 as properties };
            const required_4: string[];
            export { required_4 as required };
            const additionalProperties_3: boolean;
            export { additionalProperties_3 as additionalProperties };
        }
        export { query_1 as query };
        export namespace sessionToken_2 {
            const type_26: string;
            export { type_26 as type };
        }
        export { sessionToken_2 as sessionToken };
    }
    export { properties_4 as properties };
    const required_5: string[];
    export { required_5 as required };
    const additionalProperties_4: boolean;
    export { additionalProperties_4 as additionalProperties };
}
declare namespace unsubscribe {
    const title_6: string;
    export { title_6 as title };
    const type_27: string;
    export { type_27 as type };
    export namespace properties_6 {
        const op_4: string;
        export { op_4 as op };
        export namespace requestId_2 {
            const type_28: string;
            export { type_28 as type };
        }
        export { requestId_2 as requestId };
    }
    export { properties_6 as properties };
    const required_6: string[];
    export { required_6 as required };
    const additionalProperties_5: boolean;
    export { additionalProperties_5 as additionalProperties };
}
