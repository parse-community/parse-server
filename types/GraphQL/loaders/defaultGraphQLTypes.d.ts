export var __esModule: boolean;
export var ARRAY_RESULT: _graphql.GraphQLUnionType;
export class TypeValidationError extends Error {
    constructor(value: any, type: any);
}
export function parseStringValue(value: any): string;
export function parseIntValue(value: any): number;
export function parseFloatValue(value: any): number;
export function parseBooleanValue(value: any): boolean;
export function parseValue(value: any): any;
export function parseListValues(values: any): any;
export function parseObjectFields(fields: any): any;
export const ANY: _graphql.GraphQLScalarType;
export const OBJECT: _graphql.GraphQLScalarType;
export function parseDateIsoValue(value: any): Date;
export function serializeDateIso(value: any): string;
export const DATE: _graphql.GraphQLScalarType;
export const BYTES: _graphql.GraphQLScalarType;
export function parseFileValue(value: any): any;
export const FILE: _graphql.GraphQLScalarType;
export const FILE_INFO: _graphql.GraphQLObjectType<any, any>;
export const FILE_INPUT: _graphql.GraphQLInputObjectType;
export namespace GEO_POINT_FIELDS {
    namespace latitude {
        const description: string;
        const type: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
    }
    namespace longitude {
        const description_1: string;
        export { description_1 as description };
        const type_1: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
        export { type_1 as type };
    }
}
export const GEO_POINT_INPUT: _graphql.GraphQLInputObjectType;
export const GEO_POINT: _graphql.GraphQLObjectType<any, any>;
export const POLYGON_INPUT: _graphql.GraphQLList<_graphql.GraphQLType>;
export const POLYGON: _graphql.GraphQLList<_graphql.GraphQLType>;
export const USER_ACL_INPUT: _graphql.GraphQLInputObjectType;
export const ROLE_ACL_INPUT: _graphql.GraphQLInputObjectType;
export const PUBLIC_ACL_INPUT: _graphql.GraphQLInputObjectType;
export const ACL_INPUT: _graphql.GraphQLInputObjectType;
export const USER_ACL: _graphql.GraphQLObjectType<any, any>;
export const ROLE_ACL: _graphql.GraphQLObjectType<any, any>;
export const PUBLIC_ACL: _graphql.GraphQLObjectType<any, any>;
export const ACL: _graphql.GraphQLObjectType<any, any>;
export const OBJECT_ID: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
export namespace CLASS_NAME_ATT {
    const description_2: string;
    export { description_2 as description };
    const type_2: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
    export { type_2 as type };
}
export namespace GLOBAL_OR_OBJECT_ID_ATT {
    const description_3: string;
    export { description_3 as description };
    export { OBJECT_ID as type };
}
export namespace OBJECT_ID_ATT {
    const description_4: string;
    export { description_4 as description };
    export { OBJECT_ID as type };
}
export namespace CREATED_AT_ATT {
    const description_5: string;
    export { description_5 as description };
    const type_3: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
    export { type_3 as type };
}
export namespace UPDATED_AT_ATT {
    const description_6: string;
    export { description_6 as description };
    const type_4: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
    export { type_4 as type };
}
export namespace INPUT_FIELDS {
    namespace ACL {
        export { ACL as type };
    }
}
export namespace CREATE_RESULT_FIELDS {
    export { OBJECT_ID_ATT as objectId };
    export { CREATED_AT_ATT as createdAt };
}
export namespace UPDATE_RESULT_FIELDS {
    export { UPDATED_AT_ATT as updatedAt };
}
export const PARSE_OBJECT_FIELDS: any;
export const PARSE_OBJECT: _graphql.GraphQLInterfaceType;
export namespace SESSION_TOKEN_ATT {
    const description_7: string;
    export { description_7 as description };
    const type_5: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
    export { type_5 as type };
}
export const READ_PREFERENCE: _graphql.GraphQLEnumType;
export namespace READ_PREFERENCE_ATT {
    const description_8: string;
    export { description_8 as description };
    export { READ_PREFERENCE as type };
}
export namespace INCLUDE_READ_PREFERENCE_ATT {
    const description_9: string;
    export { description_9 as description };
    export { READ_PREFERENCE as type };
}
export namespace SUBQUERY_READ_PREFERENCE_ATT {
    const description_10: string;
    export { description_10 as description };
    export { READ_PREFERENCE as type };
}
export const READ_OPTIONS_INPUT: _graphql.GraphQLInputObjectType;
export namespace READ_OPTIONS_ATT {
    const description_11: string;
    export { description_11 as description };
    export { READ_OPTIONS_INPUT as type };
}
export namespace WHERE_ATT {
    const description_12: string;
    export { description_12 as description };
    export { OBJECT as type };
}
export namespace SKIP_ATT {
    const description_13: string;
    export { description_13 as description };
    const type_6: _graphql.GraphQLScalarType;
    export { type_6 as type };
}
export namespace LIMIT_ATT {
    const description_14: string;
    export { description_14 as description };
    const type_7: _graphql.GraphQLScalarType;
    export { type_7 as type };
}
export namespace COUNT_ATT {
    const description_15: string;
    export { description_15 as description };
    const type_8: _graphql.GraphQLNonNull<_graphql.GraphQLNullableType>;
    export { type_8 as type };
}
export const SEARCH_INPUT: _graphql.GraphQLInputObjectType;
export const TEXT_INPUT: _graphql.GraphQLInputObjectType;
export const BOX_INPUT: _graphql.GraphQLInputObjectType;
export const WITHIN_INPUT: _graphql.GraphQLInputObjectType;
export const CENTER_SPHERE_INPUT: _graphql.GraphQLInputObjectType;
export const GEO_WITHIN_INPUT: _graphql.GraphQLInputObjectType;
export const GEO_INTERSECTS_INPUT: _graphql.GraphQLInputObjectType;
export function equalTo(type: any): {
    description: string;
    type: any;
};
export function notEqualTo(type: any): {
    description: string;
    type: any;
};
export function lessThan(type: any): {
    description: string;
    type: any;
};
export function lessThanOrEqualTo(type: any): {
    description: string;
    type: any;
};
export function greaterThan(type: any): {
    description: string;
    type: any;
};
export function greaterThanOrEqualTo(type: any): {
    description: string;
    type: any;
};
export function inOp(type: any): {
    description: string;
    type: _graphql.GraphQLList<_graphql.GraphQLType>;
};
export function notIn(type: any): {
    description: string;
    type: _graphql.GraphQLList<_graphql.GraphQLType>;
};
export namespace exists {
    const description_16: string;
    export { description_16 as description };
    const type_9: _graphql.GraphQLScalarType;
    export { type_9 as type };
}
export namespace matchesRegex {
    const description_17: string;
    export { description_17 as description };
    const type_10: _graphql.GraphQLScalarType;
    export { type_10 as type };
}
export namespace options {
    const description_18: string;
    export { description_18 as description };
    const type_11: _graphql.GraphQLScalarType;
    export { type_11 as type };
}
export const SUBQUERY_INPUT: _graphql.GraphQLInputObjectType;
export const SELECT_INPUT: _graphql.GraphQLInputObjectType;
export namespace inQueryKey {
    const description_19: string;
    export { description_19 as description };
    export { SELECT_INPUT as type };
}
export namespace notInQueryKey {
    const description_20: string;
    export { description_20 as description };
    export { SELECT_INPUT as type };
}
export const ID_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const STRING_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const NUMBER_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const BOOLEAN_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const ARRAY_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const KEY_VALUE_INPUT: _graphql.GraphQLInputObjectType;
export const OBJECT_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const DATE_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const BYTES_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const FILE_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const GEO_POINT_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const POLYGON_WHERE_INPUT: _graphql.GraphQLInputObjectType;
export const ELEMENT: _graphql.GraphQLObjectType<any, any>;
import _graphql = require("graphql");
export let ARRAY_RESULT: any;
export function loadArrayResult(parseGraphQLSchema: any, parseClasses: any): void;
export function load(parseGraphQLSchema: any): void;
