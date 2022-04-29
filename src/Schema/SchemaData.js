// @flow-disable-next
import deepcopy from 'deepcopy';
import type { Schema, SchemaFields } from '../Controllers/types';

const defaultColumns: { [string]: SchemaFields } = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    objectId: { type: 'String' },
    createdAt: { type: 'Date' },
    updatedAt: { type: 'Date' },
    ACL: { type: 'ACL' },
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    username: { type: 'String' },
    password: { type: 'String' },
    email: { type: 'String' },
    emailVerified: { type: 'Boolean' },
    authData: { type: 'Object' },
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    installationId: { type: 'String' },
    deviceToken: { type: 'String' },
    channels: { type: 'Array' },
    deviceType: { type: 'String' },
    pushType: { type: 'String' },
    GCMSenderId: { type: 'String' },
    timeZone: { type: 'String' },
    localeIdentifier: { type: 'String' },
    badge: { type: 'Number' },
    appVersion: { type: 'String' },
    appName: { type: 'String' },
    appIdentifier: { type: 'String' },
    parseVersion: { type: 'String' },
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    name: { type: 'String' },
    users: { type: 'Relation', targetClass: '_User' },
    roles: { type: 'Relation', targetClass: '_Role' },
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    user: { type: 'Pointer', targetClass: '_User' },
    installationId: { type: 'String' },
    sessionToken: { type: 'String' },
    expiresAt: { type: 'Date' },
    createdWith: { type: 'Object' },
  },
  _Product: {
    productIdentifier: { type: 'String' },
    download: { type: 'File' },
    downloadName: { type: 'String' },
    icon: { type: 'File' },
    order: { type: 'Number' },
    title: { type: 'String' },
    subtitle: { type: 'String' },
  },
  _PushStatus: {
    pushTime: { type: 'String' },
    source: { type: 'String' }, // rest or webui
    query: { type: 'String' }, // the stringified JSON query
    payload: { type: 'String' }, // the stringified JSON payload,
    title: { type: 'String' },
    expiry: { type: 'Number' },
    expiration_interval: { type: 'Number' },
    status: { type: 'String' },
    numSent: { type: 'Number' },
    numFailed: { type: 'Number' },
    pushHash: { type: 'String' },
    errorMessage: { type: 'Object' },
    sentPerType: { type: 'Object' },
    failedPerType: { type: 'Object' },
    sentPerUTCOffset: { type: 'Object' },
    failedPerUTCOffset: { type: 'Object' },
    count: { type: 'Number' }, // tracks # of batches queued and pending
  },
  _JobStatus: {
    jobName: { type: 'String' },
    source: { type: 'String' },
    status: { type: 'String' },
    message: { type: 'String' },
    params: { type: 'Object' }, // params received when calling the job
    finishedAt: { type: 'Date' },
  },
  _JobSchedule: {
    jobName: { type: 'String' },
    description: { type: 'String' },
    params: { type: 'String' },
    startAfter: { type: 'String' },
    daysOfWeek: { type: 'Array' },
    timeOfDay: { type: 'String' },
    lastRun: { type: 'Number' },
    repeatMinutes: { type: 'Number' },
  },
  _Hooks: {
    functionName: { type: 'String' },
    className: { type: 'String' },
    triggerName: { type: 'String' },
    url: { type: 'String' },
  },
  _GlobalConfig: {
    objectId: { type: 'String' },
    params: { type: 'Object' },
    masterKeyOnly: { type: 'Object' },
  },
  _GraphQLConfig: {
    objectId: { type: 'String' },
    config: { type: 'Object' },
  },
  _Audience: {
    objectId: { type: 'String' },
    name: { type: 'String' },
    query: { type: 'String' }, //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    lastUsed: { type: 'Date' },
    timesUsed: { type: 'Number' },
  },
  _Idempotency: {
    reqId: { type: 'String' },
    expire: { type: 'Date' },
  },
});

const volatileClasses = Object.freeze([
  '_JobStatus',
  '_PushStatus',
  '_Hooks',
  '_GlobalConfig',
  '_GraphQLConfig',
  '_JobSchedule',
  '_Audience',
  '_Idempotency',
]);

const injectDefaultSchema = ({ className, fields, classLevelPermissions, indexes }: Schema) => {
  const defaultSchema: Schema = {
    className,
    fields: {
      ...defaultColumns._Default,
      ...(defaultColumns[className] || {}),
      ...fields,
    },
    classLevelPermissions,
  };
  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }
  return defaultSchema;
};

class SchemaData {
  __data: any;
  __protectedFields: any;
  constructor(allSchemas = [], protectedFields = {}) {
    this.__data = {};
    this.__protectedFields = protectedFields;
    allSchemas.forEach(schema => {
      if (volatileClasses.includes(schema.className)) {
        return;
      }
      Object.defineProperty(this, schema.className, {
        get: () => {
          if (!this.__data[schema.className]) {
            const data = {};
            data.fields = injectDefaultSchema(schema).fields;
            data.classLevelPermissions = deepcopy(schema.classLevelPermissions);
            data.indexes = schema.indexes;

            const classProtectedFields = this.__protectedFields[schema.className];
            if (classProtectedFields) {
              for (const key in classProtectedFields) {
                const unq = new Set([
                  ...(data.classLevelPermissions.protectedFields[key] || []),
                  ...classProtectedFields[key],
                ]);
                data.classLevelPermissions.protectedFields[key] = Array.from(unq);
              }
            }

            this.__data[schema.className] = data;
          }
          return this.__data[schema.className];
        },
      });
    });

    // Inject the in-memory classes
    volatileClasses.forEach(className => {
      Object.defineProperty(this, className, {
        get: () => {
          if (!this.__data[className]) {
            const schema = injectDefaultSchema({
              className,
              fields: {},
              classLevelPermissions: {},
            });
            const data = {};
            data.fields = schema.fields;
            data.classLevelPermissions = schema.classLevelPermissions;
            data.indexes = schema.indexes;
            this.__data[className] = data;
          }
          return this.__data[className];
        },
      });
    });
  }
}

export { defaultColumns, volatileClasses, injectDefaultSchema, SchemaData };
