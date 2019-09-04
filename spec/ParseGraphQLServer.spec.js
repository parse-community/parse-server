const http = require('http');
const express = require('express');
const req = require('../lib/request');
const fetch = require('node-fetch');
const FormData = require('form-data');
const ws = require('ws');
const pluralize = require('pluralize');
const { getMainDefinition } = require('apollo-utilities');
const { ApolloLink, split } = require('apollo-link');
const { createHttpLink } = require('apollo-link-http');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { createUploadLink } = require('apollo-upload-client');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { WebSocketLink } = require('apollo-link-ws');
const ApolloClient = require('apollo-client').default;
const gql = require('graphql-tag');
const { ParseServer } = require('../');
const { ParseGraphQLServer } = require('../lib/GraphQL/ParseGraphQLServer');
const ReadPreference = require('mongodb').ReadPreference;

function handleError(e) {
  if (
    e &&
    e.networkError &&
    e.networkError.result &&
    e.networkError.result.errors
  ) {
    fail(e.networkError.result.errors);
  } else {
    fail(e);
  }
}

describe('ParseGraphQLServer', () => {
  let parseServer;
  let parseGraphQLServer;

  beforeAll(async () => {
    parseServer = await global.reconfigureServer({});
    parseGraphQLServer = new ParseGraphQLServer(parseServer, {
      graphQLPath: '/graphql',
      playgroundPath: '/playground',
      subscriptionsPath: '/subscriptions',
    });
  });

  describe('constructor', () => {
    it('should require a parseServer instance', () => {
      expect(() => new ParseGraphQLServer()).toThrow(
        'You must provide a parseServer instance!'
      );
    });

    it('should require config.graphQLPath', () => {
      expect(() => new ParseGraphQLServer(parseServer)).toThrow(
        'You must provide a config.graphQLPath!'
      );
      expect(() => new ParseGraphQLServer(parseServer, {})).toThrow(
        'You must provide a config.graphQLPath!'
      );
    });

    it('should only require parseServer and config.graphQLPath args', () => {
      let parseGraphQLServer;
      expect(() => {
        parseGraphQLServer = new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphql',
        });
      }).not.toThrow();
      expect(parseGraphQLServer.parseGraphQLSchema).toBeDefined();
      expect(parseGraphQLServer.parseGraphQLSchema.databaseController).toEqual(
        parseServer.config.databaseController
      );
    });

    it('should initialize parseGraphQLSchema with a log controller', async () => {
      const loggerAdapter = {
        log: () => {},
        error: () => {},
      };
      const parseServer = await global.reconfigureServer({
        loggerAdapter,
      });
      const parseGraphQLServer = new ParseGraphQLServer(parseServer, {
        graphQLPath: 'graphql',
      });
      expect(parseGraphQLServer.parseGraphQLSchema.log.adapter).toBe(
        loggerAdapter
      );
    });
  });

  describe('_getGraphQLOptions', () => {
    const req = {
      info: new Object(),
      config: new Object(),
      auth: new Object(),
    };

    it("should return schema and context with req's info, config and auth", async () => {
      const options = await parseGraphQLServer._getGraphQLOptions(req);
      expect(options.schema).toEqual(
        parseGraphQLServer.parseGraphQLSchema.graphQLSchema
      );
      expect(options.context.info).toEqual(req.info);
      expect(options.context.config).toEqual(req.config);
      expect(options.context.auth).toEqual(req.auth);
    });

    it('should load GraphQL schema in every call', async () => {
      const originalLoad = parseGraphQLServer.parseGraphQLSchema.load;
      let counter = 0;
      parseGraphQLServer.parseGraphQLSchema.load = () => ++counter;
      expect((await parseGraphQLServer._getGraphQLOptions(req)).schema).toEqual(
        1
      );
      expect((await parseGraphQLServer._getGraphQLOptions(req)).schema).toEqual(
        2
      );
      expect((await parseGraphQLServer._getGraphQLOptions(req)).schema).toEqual(
        3
      );
      parseGraphQLServer.parseGraphQLSchema.load = originalLoad;
    });
  });

  describe('_transformMaxUploadSizeToBytes', () => {
    it('should transform to bytes', () => {
      expect(parseGraphQLServer._transformMaxUploadSizeToBytes('20mb')).toBe(
        20971520
      );
      expect(parseGraphQLServer._transformMaxUploadSizeToBytes('333Gb')).toBe(
        357556027392
      );
      expect(
        parseGraphQLServer._transformMaxUploadSizeToBytes('123456KB')
      ).toBe(126418944);
    });
  });

  describe('applyGraphQL', () => {
    it('should require an Express.js app instance', () => {
      expect(() => parseGraphQLServer.applyGraphQL()).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() => parseGraphQLServer.applyGraphQL({})).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() =>
        parseGraphQLServer.applyGraphQL(new express())
      ).not.toThrow();
    });

    it('should apply middlewares at config.graphQLPath', () => {
      let useCount = 0;
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'somepath',
        }).applyGraphQL({
          use: path => {
            useCount++;
            expect(path).toEqual('somepath');
          },
        })
      ).not.toThrow();
      expect(useCount).toBeGreaterThan(0);
    });
  });

  describe('applyPlayground', () => {
    it('should require an Express.js app instance', () => {
      expect(() => parseGraphQLServer.applyPlayground()).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() => parseGraphQLServer.applyPlayground({})).toThrow(
        'You must provide an Express.js app instance!'
      );
      expect(() =>
        parseGraphQLServer.applyPlayground(new express())
      ).not.toThrow();
    });

    it('should require initialization with config.playgroundPath', () => {
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphql',
        }).applyPlayground(new express())
      ).toThrow('You must provide a config.playgroundPath to applyPlayground!');
    });

    it('should apply middlewares at config.playgroundPath', () => {
      let useCount = 0;
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphQL',
          playgroundPath: 'somepath',
        }).applyPlayground({
          get: path => {
            useCount++;
            expect(path).toEqual('somepath');
          },
        })
      ).not.toThrow();
      expect(useCount).toBeGreaterThan(0);
    });
  });

  describe('createSubscriptions', () => {
    it('should require initialization with config.subscriptionsPath', () => {
      expect(() =>
        new ParseGraphQLServer(parseServer, {
          graphQLPath: 'graphql',
        }).createSubscriptions({})
      ).toThrow(
        'You must provide a config.subscriptionsPath to createSubscriptions!'
      );
    });
  });

  describe('setGraphQLConfig', () => {
    let parseGraphQLServer;
    beforeEach(() => {
      parseGraphQLServer = new ParseGraphQLServer(parseServer, {
        graphQLPath: 'graphql',
      });
    });
    it('should pass the graphQLConfig onto the parseGraphQLController', async () => {
      let received;
      parseGraphQLServer.parseGraphQLController = {
        async updateGraphQLConfig(graphQLConfig) {
          received = graphQLConfig;
          return {};
        },
      };
      const graphQLConfig = { enabledForClasses: [] };
      await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
      expect(received).toBe(graphQLConfig);
    });
    it('should not absorb exceptions from parseGraphQLController', async () => {
      parseGraphQLServer.parseGraphQLController = {
        async updateGraphQLConfig() {
          throw new Error('Network request failed');
        },
      };
      await expectAsync(
        parseGraphQLServer.setGraphQLConfig({})
      ).toBeRejectedWith(new Error('Network request failed'));
    });
    it('should return the response from parseGraphQLController', async () => {
      parseGraphQLServer.parseGraphQLController = {
        async updateGraphQLConfig() {
          return { response: { result: true } };
        },
      };
      await expectAsync(parseGraphQLServer.setGraphQLConfig({})).toBeResolvedTo(
        { response: { result: true } }
      );
    });
  });

  describe('Auto API', () => {
    let httpServer;
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-Javascript-Key': 'test',
    };

    let apolloClient;

    let user1;
    let user2;
    let user3;
    let user4;
    let user5;
    let role;
    let object1;
    let object2;
    let object3;
    let object4;
    let objects = [];

    async function prepareData() {
      user1 = new Parse.User();
      user1.setUsername('user1');
      user1.setPassword('user1');
      await user1.signUp();

      user2 = new Parse.User();
      user2.setUsername('user2');
      user2.setPassword('user2');
      await user2.signUp();

      user3 = new Parse.User();
      user3.setUsername('user3');
      user3.setPassword('user3');
      await user3.signUp();

      user4 = new Parse.User();
      user4.setUsername('user4');
      user4.setPassword('user4');
      await user4.signUp();

      user5 = new Parse.User();
      user5.setUsername('user5');
      user5.setPassword('user5');
      await user5.signUp();

      const roleACL = new Parse.ACL();
      roleACL.setPublicReadAccess(true);
      role = new Parse.Role();
      role.setName('role');
      role.setACL(roleACL);
      role.getUsers().add(user1);
      role.getUsers().add(user3);
      role = await role.save();

      const schemaController = await parseServer.config.databaseController.loadSchema();
      try {
        await schemaController.addClassIfNotExists(
          'GraphQLClass',
          {
            someField: { type: 'String' },
            pointerToUser: { type: 'Pointer', targetClass: '_User' },
          },
          {
            find: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            create: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            get: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            update: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            addField: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            delete: {
              'role:role': true,
              [user1.id]: true,
              [user2.id]: true,
            },
            readUserFields: ['pointerToUser'],
            writeUserFields: ['pointerToUser'],
          },
          {}
        );
      } catch (err) {
        if (
          !(err instanceof Parse.Error) ||
          err.message !== 'Class GraphQLClass already exists.'
        ) {
          throw err;
        }
      }

      object1 = new Parse.Object('GraphQLClass');
      object1.set('someField', 'someValue1');
      const object1ACL = new Parse.ACL();
      object1ACL.setPublicReadAccess(false);
      object1ACL.setPublicWriteAccess(false);
      object1ACL.setRoleReadAccess(role, true);
      object1ACL.setRoleWriteAccess(role, true);
      object1ACL.setReadAccess(user1.id, true);
      object1ACL.setWriteAccess(user1.id, true);
      object1ACL.setReadAccess(user2.id, true);
      object1ACL.setWriteAccess(user2.id, true);
      object1.setACL(object1ACL);
      await object1.save(undefined, { useMasterKey: true });

      object2 = new Parse.Object('GraphQLClass');
      object2.set('someField', 'someValue2');
      const object2ACL = new Parse.ACL();
      object2ACL.setPublicReadAccess(false);
      object2ACL.setPublicWriteAccess(false);
      object2ACL.setReadAccess(user1.id, true);
      object2ACL.setWriteAccess(user1.id, true);
      object2ACL.setReadAccess(user2.id, true);
      object2ACL.setWriteAccess(user2.id, true);
      object2ACL.setReadAccess(user5.id, true);
      object2ACL.setWriteAccess(user5.id, true);
      object2.setACL(object2ACL);
      await object2.save(undefined, { useMasterKey: true });

      object3 = new Parse.Object('GraphQLClass');
      object3.set('someField', 'someValue3');
      object3.set('pointerToUser', user5);
      await object3.save(undefined, { useMasterKey: true });

      object4 = new Parse.Object('PublicClass');
      object4.set('someField', 'someValue4');
      await object4.save();

      objects = [];
      objects.push(object1, object2, object3, object4);
    }

    beforeAll(async () => {
      const expressApp = express();
      httpServer = http.createServer(expressApp);
      expressApp.use('/parse', parseServer.app);
      ParseServer.createLiveQueryServer(httpServer, {
        port: 1338,
      });
      parseGraphQLServer.applyGraphQL(expressApp);
      parseGraphQLServer.applyPlayground(expressApp);
      parseGraphQLServer.createSubscriptions(httpServer);
      await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));

      const subscriptionClient = new SubscriptionClient(
        'ws://localhost:13377/subscriptions',
        {
          reconnect: true,
          connectionParams: headers,
        },
        ws
      );
      const wsLink = new WebSocketLink(subscriptionClient);
      const httpLink = createUploadLink({
        uri: 'http://localhost:13377/graphql',
        fetch,
        headers,
      });
      apolloClient = new ApolloClient({
        link: split(
          ({ query }) => {
            const { kind, operation } = getMainDefinition(query);
            return (
              kind === 'OperationDefinition' && operation === 'subscription'
            );
          },
          wsLink,
          httpLink
        ),
        cache: new InMemoryCache(),
        defaultOptions: {
          query: {
            fetchPolicy: 'no-cache',
          },
        },
      });
    });

    afterAll(async () => {
      await httpServer.close();
    });

    describe('GraphQL', () => {
      it('should be healthy', async () => {
        try {
          const health = (await apolloClient.query({
            query: gql`
              query Health {
                health
              }
            `,
          })).data.health;
          expect(health).toBeTruthy();
        } catch (e) {
          handleError(e);
        }
      });

      it('should be cors enabled', async () => {
        let checked = false;
        const apolloClient = new ApolloClient({
          link: new ApolloLink((operation, forward) => {
            return forward(operation).map(response => {
              const context = operation.getContext();
              const {
                response: { headers },
              } = context;
              expect(headers.get('access-control-allow-origin')).toEqual('*');
              checked = true;
              return response;
            });
          }).concat(
            createHttpLink({
              uri: 'http://localhost:13377/graphql',
              fetch,
              headers: {
                ...headers,
                Origin: 'http://someorigin.com',
              },
            })
          ),
          cache: new InMemoryCache(),
        });
        const healthResponse = await apolloClient.query({
          query: gql`
            query Health {
              health
            }
          `,
        });
        expect(healthResponse.data.health).toBeTruthy();
        expect(checked).toBeTruthy();
      });

      it('should handle Parse headers', async () => {
        let checked = false;
        const originalGetGraphQLOptions = parseGraphQLServer._getGraphQLOptions;
        parseGraphQLServer._getGraphQLOptions = async req => {
          expect(req.info).toBeDefined();
          expect(req.config).toBeDefined();
          expect(req.auth).toBeDefined();
          checked = true;
          return await originalGetGraphQLOptions.bind(parseGraphQLServer)(req);
        };
        const health = (await apolloClient.query({
          query: gql`
            query Health {
              health
            }
          `,
        })).data.health;
        expect(health).toBeTruthy();
        expect(checked).toBeTruthy();
        parseGraphQLServer._getGraphQLOptions = originalGetGraphQLOptions;
      });
    });

    describe('Playground', () => {
      it('should mount playground', async () => {
        const res = await req({
          method: 'GET',
          url: 'http://localhost:13377/playground',
        });
        expect(res.status).toEqual(200);
      });
    });

    describe('Schema', () => {
      describe('Default Types', () => {
        it('should have Object scalar type', async () => {
          const objectType = (await apolloClient.query({
            query: gql`
              query ObjectType {
                __type(name: "Object") {
                  kind
                }
              }
            `,
          })).data['__type'];
          expect(objectType.kind).toEqual('SCALAR');
        });

        it('should have Date scalar type', async () => {
          const dateType = (await apolloClient.query({
            query: gql`
              query DateType {
                __type(name: "Date") {
                  kind
                }
              }
            `,
          })).data['__type'];
          expect(dateType.kind).toEqual('SCALAR');
        });

        it('should have ArrayResult type', async () => {
          const arrayResultType = (await apolloClient.query({
            query: gql`
              query ArrayResultType {
                __type(name: "ArrayResult") {
                  kind
                }
              }
            `,
          })).data['__type'];
          expect(arrayResultType.kind).toEqual('UNION');
        });

        it('should have File object type', async () => {
          const fileType = (await apolloClient.query({
            query: gql`
              query FileType {
                __type(name: "FileInfo") {
                  kind
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          expect(fileType.kind).toEqual('OBJECT');
          expect(fileType.fields.map(field => field.name).sort()).toEqual([
            'name',
            'url',
          ]);
        });

        it('should have Class interface type', async () => {
          const classType = (await apolloClient.query({
            query: gql`
              query ClassType {
                __type(name: "ParseObject") {
                  kind
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          expect(classType.kind).toEqual('INTERFACE');
          expect(classType.fields.map(field => field.name).sort()).toEqual([
            'ACL',
            'createdAt',
            'id',
            'updatedAt',
          ]);
        });

        it('should have ReadPreference enum type', async () => {
          const readPreferenceType = (await apolloClient.query({
            query: gql`
              query ReadPreferenceType {
                __type(name: "ReadPreference") {
                  kind
                  enumValues {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          expect(readPreferenceType.kind).toEqual('ENUM');
          expect(
            readPreferenceType.enumValues.map(value => value.name).sort()
          ).toEqual([
            'NEAREST',
            'PRIMARY',
            'PRIMARY_PREFERRED',
            'SECONDARY',
            'SECONDARY_PREFERRED',
          ]);
        });

        it('should have FindResult object type', async () => {
          const findResultType = (await apolloClient.query({
            query: gql`
              query FindResultType {
                __type(name: "FindResult") {
                  kind
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          expect(findResultType.kind).toEqual('OBJECT');
          expect(findResultType.fields.map(name => name.name).sort()).toEqual([
            'count',
            'results',
          ]);
        });

        it('should have GraphQLUpload object type', async () => {
          const graphQLUploadType = (await apolloClient.query({
            query: gql`
              query GraphQLUploadType {
                __type(name: "Upload") {
                  kind
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          expect(graphQLUploadType.kind).toEqual('SCALAR');
        });

        it('should have all expected types', async () => {
          const schemaTypes = (await apolloClient.query({
            query: gql`
              query SchemaTypes {
                __schema {
                  types {
                    name
                  }
                }
              }
            `,
          })).data['__schema'].types.map(type => type.name);

          const expectedTypes = [
            'ParseObject',
            'Date',
            'FileInfo',
            'FindResult',
            'ReadPreference',
            'Upload',
          ];
          expect(
            expectedTypes.every(type => schemaTypes.indexOf(type) !== -1)
          ).toBeTruthy(JSON.stringify(schemaTypes.types));
        });
      });

      describe('Parse Class Types', () => {
        it('should have all expected types', async () => {
          await parseServer.config.databaseController.loadSchema();

          const schemaTypes = (await apolloClient.query({
            query: gql`
              query SchemaTypes {
                __schema {
                  types {
                    name
                  }
                }
              }
            `,
          })).data['__schema'].types.map(type => type.name);

          const expectedTypes = [
            'Role',
            'RoleWhereInput',
            'CreateRoleFieldsInput',
            'UpdateRoleFieldsInput',
            'RoleFindResult',
            'User',
            'UserWhereInput',
            'UserFindResult',
            'SignUpFieldsInput',
            'CreateUserFieldsInput',
            'UpdateUserFieldsInput',
          ];
          expect(
            expectedTypes.every(type => schemaTypes.indexOf(type) !== -1)
          ).toBeTruthy(JSON.stringify(schemaTypes));
        });

        it('should ArrayResult contains all types', async () => {
          const objectType = (await apolloClient.query({
            query: gql`
              query ObjectType {
                __type(name: "ArrayResult") {
                  kind
                  possibleTypes {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          const possibleTypes = objectType.possibleTypes.map(o => o.name);
          expect(possibleTypes).toContain('User');
          expect(possibleTypes).toContain('Role');
          expect(possibleTypes).toContain('Element');
        });

        it('should update schema when it changes', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.updateClass('_User', {
            foo: { type: 'String' },
          });

          const userFields = (await apolloClient.query({
            query: gql`
              query UserType {
                __type(name: "User") {
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'].fields.map(field => field.name);
          expect(userFields.indexOf('foo') !== -1).toBeTruthy();
        });

        it('should not contain password field from _User class', async () => {
          const userFields = (await apolloClient.query({
            query: gql`
              query UserType {
                __type(name: "User") {
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'].fields.map(field => field.name);
          expect(userFields.includes('password')).toBeFalsy();
        });
      });

      describe('Configuration', function() {
        const resetGraphQLCache = async () => {
          await Promise.all([
            parseGraphQLServer.parseGraphQLController.cacheController.graphQL.clear(),
            parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear(),
          ]);
        };

        beforeEach(async () => {
          await parseGraphQLServer.setGraphQLConfig({});
          await resetGraphQLCache();
        });

        it('should only include types in the enabledForClasses list', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.addClassIfNotExists('SuperCar', {
            foo: { type: 'String' },
          });

          const graphQLConfig = {
            enabledForClasses: ['SuperCar'],
          };
          await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
          await resetGraphQLCache();

          const { data } = await apolloClient.query({
            query: gql`
              query UserType {
                userType: __type(name: "User") {
                  fields {
                    name
                  }
                }
                superCarType: __type(name: "SuperCar") {
                  fields {
                    name
                  }
                }
              }
            `,
          });
          expect(data.userType).toBeNull();
          expect(data.superCarType).toBeTruthy();
        });
        it('should not include types in the disabledForClasses list', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.addClassIfNotExists('SuperCar', {
            foo: { type: 'String' },
          });

          const graphQLConfig = {
            disabledForClasses: ['SuperCar'],
          };
          await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
          await resetGraphQLCache();

          const { data } = await apolloClient.query({
            query: gql`
              query UserType {
                userType: __type(name: "User") {
                  fields {
                    name
                  }
                }
                superCarType: __type(name: "SuperCar") {
                  fields {
                    name
                  }
                }
              }
            `,
          });
          expect(data.superCarType).toBeNull();
          expect(data.userType).toBeTruthy();
        });
        it('should remove query operations when disabled', async () => {
          const superCar = new Parse.Object('SuperCar');
          await superCar.save({ foo: 'bar' });
          const customer = new Parse.Object('Customer');
          await customer.save({ foo: 'bar' });

          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindCustomer {
                  customers {
                    count
                  }
                }
              `,
            })
          ).toBeResolved();

          const graphQLConfig = {
            classConfigs: [
              {
                className: 'SuperCar',
                query: {
                  get: false,
                  find: true,
                },
              },
              {
                className: 'Customer',
                query: {
                  get: true,
                  find: false,
                },
              },
            ],
          };
          await parseGraphQLServer.setGraphQLConfig(graphQLConfig);
          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetCustomer($id: ID!) {
                  customer(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: customer.id,
              },
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars {
                    count
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindCustomer {
                  customers {
                    count
                  }
                }
              `,
            })
          ).toBeRejected();
        });

        it('should remove mutation operations, create, update and delete, when disabled', async () => {
          const superCar1 = new Parse.Object('SuperCar');
          await superCar1.save({ foo: 'bar' });
          const customer1 = new Parse.Object('Customer');
          await customer1.save({ foo: 'bar' });

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation UpdateSuperCar($id: ID!, $foo: String!) {
                  updateSuperCar(id: $id, fields: { foo: $foo }) {
                    updatedAt
                  }
                }
              `,
              variables: {
                id: superCar1.id,
                foo: 'lah',
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteCustomer($id: ID!) {
                  deleteCustomer(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: customer1.id,
              },
            })
          ).toBeResolved();

          const { data: customerData } = await apolloClient.query({
            query: gql`
              mutation CreateCustomer($foo: String!) {
                createCustomer(fields: { foo: $foo }) {
                  id
                }
              }
            `,
            variables: {
              foo: 'rah',
            },
          });
          expect(customerData.createCustomer).toBeTruthy();

          // used later
          const customer2Id = customerData.createCustomer.id;

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                mutation: {
                  create: true,
                  update: false,
                  destroy: true,
                },
              },
              {
                className: 'Customer',
                mutation: {
                  create: false,
                  update: true,
                  destroy: false,
                },
              },
            ],
          });
          await resetGraphQLCache();

          const { data: superCarData } = await apolloClient.query({
            query: gql`
              mutation CreateSuperCar($foo: String!) {
                createSuperCar(fields: { foo: $foo }) {
                  id
                }
              }
            `,
            variables: {
              foo: 'mah',
            },
          });
          expect(superCarData.createSuperCar).toBeTruthy();
          const superCar3Id = superCarData.createSuperCar.id;

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation UpdateSupercar($id: ID!, $foo: String!) {
                  updateSuperCar(id: $id, fields: { foo: $foo }) {
                    updatedAt
                  }
                }
              `,
              variables: {
                id: superCar3Id,
              },
            })
          ).toBeRejected();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteSuperCar($id: ID!) {
                  deleteSuperCar(id: $id) {
                    id
                  }
                }
              `,
              variables: {
                id: superCar3Id,
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation CreateCustomer($foo: String!) {
                  createCustomer(fields: { foo: $foo }) {
                    id
                  }
                }
              `,
              variables: {
                foo: 'rah',
              },
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation UpdateCustomer($id: ID!, $foo: String!) {
                  updateCustomer(id: $id, fields: { foo: $foo }) {
                    updatedAt
                  }
                }
              `,
              variables: {
                id: customer2Id,
                foo: 'tah',
              },
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteCustomer($id: ID!, $foo: String!) {
                  deleteCustomer(id: $id)
                }
              `,
              variables: {
                id: customer2Id,
              },
            })
          ).toBeRejected();
        });
        it('should only allow the supplied create and update fields for a class', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.addClassIfNotExists('SuperCar', {
            engine: { type: 'String' },
            doors: { type: 'Number' },
            price: { type: 'String' },
            mileage: { type: 'Number' },
          });

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  inputFields: {
                    create: ['engine', 'doors', 'price'],
                    update: ['price', 'mileage'],
                  },
                },
              },
            ],
          });

          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation InvalidCreateSuperCar {
                  createSuperCar(fields: { engine: "diesel", mileage: 1000 }) {
                    id
                  }
                }
              `,
            })
          ).toBeRejected();
          const { id: superCarId } = (await apolloClient.query({
            query: gql`
              mutation ValidCreateSuperCar {
                createSuperCar(
                  fields: { engine: "diesel", doors: 5, price: "£10000" }
                ) {
                  id
                }
              }
            `,
          })).data.createSuperCar;

          expect(superCarId).toBeTruthy();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation InvalidUpdateSuperCar($id: ID!) {
                  updateSuperCar(id: $id, fields: { engine: "petrol" }) {
                    updatedAt
                  }
                }
              `,
              variables: {
                id: superCarId,
              },
            })
          ).toBeRejected();

          const updatedSuperCar = (await apolloClient.query({
            query: gql`
              mutation ValidUpdateSuperCar($id: ID!) {
                updateSuperCar(id: $id, fields: { mileage: 2000 }) {
                  updatedAt
                }
              }
            `,
            variables: {
              id: superCarId,
            },
          })).data.updateSuperCar;
          expect(updatedSuperCar).toBeTruthy();
        });

        it('should only allow the supplied output fields for a class', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();

          await schemaController.addClassIfNotExists('SuperCar', {
            engine: { type: 'String' },
            doors: { type: 'Number' },
            price: { type: 'String' },
            mileage: { type: 'Number' },
            insuranceClaims: { type: 'Number' },
          });

          const superCar = await new Parse.Object('SuperCar').save({
            engine: 'petrol',
            doors: 3,
            price: '£7500',
            mileage: 0,
            insuranceCertificate: 'private-file.pdf',
          });

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  outputFields: ['engine', 'doors', 'price', 'mileage'],
                },
              },
            ],
          });

          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    id
                    engine
                    doors
                    price
                    mileage
                    insuranceCertificate
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeRejected();
          let getSuperCar = (await apolloClient.query({
            query: gql`
              query GetSuperCar($id: ID!) {
                superCar(id: $id) {
                  id
                  engine
                  doors
                  price
                  mileage
                }
              }
            `,
            variables: {
              id: superCar.id,
            },
          })).data.superCar;
          expect(getSuperCar).toBeTruthy();

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  outputFields: [],
                },
              },
            ],
          });

          await resetGraphQLCache();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetSuperCar($id: ID!) {
                  superCar(id: $id) {
                    engine
                  }
                }
              `,
              variables: {
                id: superCar.id,
              },
            })
          ).toBeRejected();
          getSuperCar = (await apolloClient.query({
            query: gql`
              query GetSuperCar($id: ID!) {
                superCar(id: $id) {
                  id
                }
              }
            `,
            variables: {
              id: superCar.id,
            },
          })).data.superCar;
          expect(getSuperCar.id).toBe(superCar.id);
        });

        it('should only allow the supplied constraint fields for a class', async () => {
          try {
            const schemaController = await parseServer.config.databaseController.loadSchema();

            await schemaController.addClassIfNotExists('SuperCar', {
              model: { type: 'String' },
              engine: { type: 'String' },
              doors: { type: 'Number' },
              price: { type: 'String' },
              mileage: { type: 'Number' },
              insuranceCertificate: { type: 'String' },
            });

            await new Parse.Object('SuperCar').save({
              model: 'McLaren',
              engine: 'petrol',
              doors: 3,
              price: '£7500',
              mileage: 0,
              insuranceCertificate: 'private-file.pdf',
            });

            await parseGraphQLServer.setGraphQLConfig({
              classConfigs: [
                {
                  className: 'SuperCar',
                  type: {
                    constraintFields: ['engine', 'doors', 'price'],
                  },
                },
              ],
            });

            await resetGraphQLCache();

            await expectAsync(
              apolloClient.query({
                query: gql`
                  query FindSuperCar {
                    superCars(
                      where: {
                        insuranceCertificate: { equalTo: "private-file.pdf" }
                      }
                    ) {
                      count
                    }
                  }
                `,
              })
            ).toBeRejected();

            await expectAsync(
              apolloClient.query({
                query: gql`
                  query FindSuperCar {
                    superCars(where: { mileage: { equalTo: 0 } }) {
                      count
                    }
                  }
                `,
              })
            ).toBeRejected();

            await expectAsync(
              apolloClient.query({
                query: gql`
                  query FindSuperCar {
                    superCars(where: { engine: { equalTo: "petrol" } }) {
                      count
                    }
                  }
                `,
              })
            ).toBeResolved();
          } catch (e) {
            handleError(e);
          }
        });

        it('should only allow the supplied sort fields for a class', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();

          await schemaController.addClassIfNotExists('SuperCar', {
            engine: { type: 'String' },
            doors: { type: 'Number' },
            price: { type: 'String' },
            mileage: { type: 'Number' },
          });

          await new Parse.Object('SuperCar').save({
            engine: 'petrol',
            doors: 3,
            price: '£7500',
            mileage: 0,
          });

          await parseGraphQLServer.setGraphQLConfig({
            classConfigs: [
              {
                className: 'SuperCar',
                type: {
                  sortFields: [
                    {
                      field: 'doors',
                      asc: true,
                      desc: true,
                    },
                    {
                      field: 'price',
                      asc: true,
                      desc: true,
                    },
                    {
                      field: 'mileage',
                      asc: true,
                      desc: false,
                    },
                  ],
                },
              },
            ],
          });

          await resetGraphQLCache();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [engine_ASC]) {
                    results {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [engine_DESC]) {
                    results {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [mileage_DESC]) {
                    results {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeRejected();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [mileage_ASC]) {
                    results {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [doors_ASC]) {
                    results {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [price_DESC]) {
                    results {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query FindSuperCar {
                  superCars(order: [price_ASC, doors_DESC]) {
                    results {
                      id
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
        });
      });

      describe('Class Schema Mutations', () => {
        it('should create a new class', async () => {
          try {
            const result = await apolloClient.mutate({
              mutation: gql`
                mutation {
                  class1: createClass(name: "Class1") {
                    name
                    schemaFields {
                      name
                      __typename
                    }
                  }
                  class2: createClass(name: "Class2", schemaFields: null) {
                    name
                    schemaFields {
                      name
                      __typename
                    }
                  }
                  class3: createClass(name: "Class3", schemaFields: {}) {
                    name
                    schemaFields {
                      name
                      __typename
                    }
                  }
                  class4: createClass(
                    name: "Class4"
                    schemaFields: {
                      addStrings: null
                      addNumbers: null
                      addBooleans: null
                      addArrays: null
                      addObjects: null
                      addDates: null
                      addFiles: null
                      addGeoPoint: null
                      addPolygons: null
                      addBytes: null
                      addPointers: null
                      addRelations: null
                    }
                  ) {
                    name
                    schemaFields {
                      name
                      __typename
                    }
                  }
                  class5: createClass(
                    name: "Class5"
                    schemaFields: {
                      addStrings: []
                      addNumbers: []
                      addBooleans: []
                      addArrays: []
                      addObjects: []
                      addDates: []
                      addFiles: []
                      addPolygons: []
                      addBytes: []
                      addPointers: []
                      addRelations: []
                    }
                  ) {
                    name
                    schemaFields {
                      name
                      __typename
                    }
                  }
                  class6: createClass(
                    name: "Class6"
                    schemaFields: {
                      addStrings: [
                        { name: "stringField1" }
                        { name: "stringField2" }
                        { name: "stringField3" }
                      ]
                      addNumbers: [
                        { name: "numberField1" }
                        { name: "numberField2" }
                        { name: "numberField3" }
                      ]
                      addBooleans: [
                        { name: "booleanField1" }
                        { name: "booleanField2" }
                        { name: "booleanField3" }
                      ]
                      addArrays: [
                        { name: "arrayField1" }
                        { name: "arrayField2" }
                        { name: "arrayField3" }
                      ]
                      addObjects: [
                        { name: "objectField1" }
                        { name: "objectField2" }
                        { name: "objectField3" }
                      ]
                      addDates: [
                        { name: "dateField1" }
                        { name: "dateField2" }
                        { name: "dateField3" }
                      ]
                      addFiles: [
                        { name: "fileField1" }
                        { name: "fileField2" }
                        { name: "fileField3" }
                      ]
                      addGeoPoint: { name: "geoPointField" }
                      addPolygons: [
                        { name: "polygonField1" }
                        { name: "polygonField2" }
                        { name: "polygonField3" }
                      ]
                      addBytes: [
                        { name: "bytesField1" }
                        { name: "bytesField2" }
                        { name: "bytesField3" }
                      ]
                      addPointers: [
                        { name: "pointerField1", targetClassName: "Class1" }
                        { name: "pointerField2", targetClassName: "Class6" }
                        { name: "pointerField3", targetClassName: "Class2" }
                      ]
                      addRelations: [
                        { name: "relationField1", targetClassName: "Class1" }
                        { name: "relationField2", targetClassName: "Class6" }
                        { name: "relationField3", targetClassName: "Class2" }
                      ]
                      remove: [
                        { name: "stringField3" }
                        { name: "numberField3" }
                        { name: "booleanField3" }
                        { name: "arrayField3" }
                        { name: "objectField3" }
                        { name: "dateField3" }
                        { name: "fileField3" }
                        { name: "polygonField3" }
                        { name: "bytesField3" }
                        { name: "pointerField3" }
                        { name: "relationField3" }
                        { name: "doesNotExist" }
                      ]
                    }
                  ) {
                    name
                    schemaFields {
                      name
                      __typename
                      ... on SchemaPointerField {
                        targetClassName
                      }
                      ... on SchemaRelationField {
                        targetClassName
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            const classes = Object.keys(result.data).map(fieldName => ({
              name: result.data[fieldName].name,
              schemaFields: result.data[fieldName].schemaFields.sort((a, b) =>
                a.name > b.name ? 1 : -1
              ),
              __typename: result.data[fieldName].__typename,
            }));
            expect(classes).toEqual([
              {
                name: 'Class1',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class2',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class3',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class4',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class5',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class6',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'arrayField1', __typename: 'SchemaArrayField' },
                  { name: 'arrayField2', __typename: 'SchemaArrayField' },
                  { name: 'booleanField1', __typename: 'SchemaBooleanField' },
                  { name: 'booleanField2', __typename: 'SchemaBooleanField' },
                  { name: 'bytesField1', __typename: 'SchemaBytesField' },
                  { name: 'bytesField2', __typename: 'SchemaBytesField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'dateField1', __typename: 'SchemaDateField' },
                  { name: 'dateField2', __typename: 'SchemaDateField' },
                  { name: 'fileField1', __typename: 'SchemaFileField' },
                  { name: 'fileField2', __typename: 'SchemaFileField' },
                  {
                    name: 'geoPointField',
                    __typename: 'SchemaGeoPointField',
                  },
                  { name: 'numberField1', __typename: 'SchemaNumberField' },
                  { name: 'numberField2', __typename: 'SchemaNumberField' },
                  { name: 'objectField1', __typename: 'SchemaObjectField' },
                  { name: 'objectField2', __typename: 'SchemaObjectField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  {
                    name: 'pointerField1',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'pointerField2',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class6',
                  },
                  { name: 'polygonField1', __typename: 'SchemaPolygonField' },
                  { name: 'polygonField2', __typename: 'SchemaPolygonField' },
                  {
                    name: 'relationField1',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'relationField2',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class6',
                  },
                  { name: 'stringField1', __typename: 'SchemaStringField' },
                  { name: 'stringField2', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
            ]);

            const findResult = await apolloClient.query({
              query: gql`
                query {
                  classes {
                    name
                    schemaFields {
                      name
                      __typename
                      ... on SchemaPointerField {
                        targetClassName
                      }
                      ... on SchemaRelationField {
                        targetClassName
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            findResult.data.classes = findResult.data.classes
              .filter(schemaClass => !schemaClass.name.startsWith('_'))
              .sort((a, b) => (a.name > b.name ? 1 : -1));
            findResult.data.classes.forEach(schemaClass => {
              schemaClass.schemaFields = schemaClass.schemaFields.sort((a, b) =>
                a.name > b.name ? 1 : -1
              );
            });
            expect(findResult.data.classes).toEqual([
              {
                name: 'Class1',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class2',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class3',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class4',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class5',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
              {
                name: 'Class6',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'arrayField1', __typename: 'SchemaArrayField' },
                  { name: 'arrayField2', __typename: 'SchemaArrayField' },
                  { name: 'booleanField1', __typename: 'SchemaBooleanField' },
                  { name: 'booleanField2', __typename: 'SchemaBooleanField' },
                  { name: 'bytesField1', __typename: 'SchemaBytesField' },
                  { name: 'bytesField2', __typename: 'SchemaBytesField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'dateField1', __typename: 'SchemaDateField' },
                  { name: 'dateField2', __typename: 'SchemaDateField' },
                  { name: 'fileField1', __typename: 'SchemaFileField' },
                  { name: 'fileField2', __typename: 'SchemaFileField' },
                  {
                    name: 'geoPointField',
                    __typename: 'SchemaGeoPointField',
                  },
                  { name: 'numberField1', __typename: 'SchemaNumberField' },
                  { name: 'numberField2', __typename: 'SchemaNumberField' },
                  { name: 'objectField1', __typename: 'SchemaObjectField' },
                  { name: 'objectField2', __typename: 'SchemaObjectField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  {
                    name: 'pointerField1',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'pointerField2',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class6',
                  },
                  { name: 'polygonField1', __typename: 'SchemaPolygonField' },
                  { name: 'polygonField2', __typename: 'SchemaPolygonField' },
                  {
                    name: 'relationField1',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'relationField2',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class6',
                  },
                  { name: 'stringField1', __typename: 'SchemaStringField' },
                  { name: 'stringField2', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
            ]);
          } catch (e) {
            handleError(e);
          }
        });

        it('should require master key to create a new class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(name: "SomeClass") {
                    name
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.OPERATION_FORBIDDEN
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'unauthorized: master key is required'
            );
          }
        });

        it('should not allow duplicated field names when creating', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    name: "SomeClass"
                    schemaFields: {
                      addStrings: [{ name: "someField" }]
                      addNumbers: [{ name: "someField" }]
                    }
                  ) {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.INVALID_KEY_NAME
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'Duplicated field name: someField'
            );
          }
        });

        it('should update an existing class', async () => {
          try {
            const result = await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    name: "MyNewClass"
                    schemaFields: { addStrings: [{ name: "willBeRemoved" }] }
                  ) {
                    name
                    schemaFields {
                      name
                      __typename
                    }
                  }
                  updateClass(
                    name: "MyNewClass"
                    schemaFields: {
                      addStrings: [
                        { name: "stringField1" }
                        { name: "stringField2" }
                        { name: "stringField3" }
                      ]
                      addNumbers: [
                        { name: "numberField1" }
                        { name: "numberField2" }
                        { name: "numberField3" }
                      ]
                      addBooleans: [
                        { name: "booleanField1" }
                        { name: "booleanField2" }
                        { name: "booleanField3" }
                      ]
                      addArrays: [
                        { name: "arrayField1" }
                        { name: "arrayField2" }
                        { name: "arrayField3" }
                      ]
                      addObjects: [
                        { name: "objectField1" }
                        { name: "objectField2" }
                        { name: "objectField3" }
                      ]
                      addDates: [
                        { name: "dateField1" }
                        { name: "dateField2" }
                        { name: "dateField3" }
                      ]
                      addFiles: [
                        { name: "fileField1" }
                        { name: "fileField2" }
                        { name: "fileField3" }
                      ]
                      addGeoPoint: { name: "geoPointField" }
                      addPolygons: [
                        { name: "polygonField1" }
                        { name: "polygonField2" }
                        { name: "polygonField3" }
                      ]
                      addBytes: [
                        { name: "bytesField1" }
                        { name: "bytesField2" }
                        { name: "bytesField3" }
                      ]
                      addPointers: [
                        { name: "pointerField1", targetClassName: "Class1" }
                        { name: "pointerField2", targetClassName: "Class6" }
                        { name: "pointerField3", targetClassName: "Class2" }
                      ]
                      addRelations: [
                        { name: "relationField1", targetClassName: "Class1" }
                        { name: "relationField2", targetClassName: "Class6" }
                        { name: "relationField3", targetClassName: "Class2" }
                      ]
                      remove: [
                        { name: "willBeRemoved" }
                        { name: "stringField3" }
                        { name: "numberField3" }
                        { name: "booleanField3" }
                        { name: "arrayField3" }
                        { name: "objectField3" }
                        { name: "dateField3" }
                        { name: "fileField3" }
                        { name: "polygonField3" }
                        { name: "bytesField3" }
                        { name: "pointerField3" }
                        { name: "relationField3" }
                        { name: "doesNotExist" }
                      ]
                    }
                  ) {
                    name
                    schemaFields {
                      name
                      __typename
                      ... on SchemaPointerField {
                        targetClassName
                      }
                      ... on SchemaRelationField {
                        targetClassName
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            result.data.createClass.schemaFields = result.data.createClass.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            result.data.updateClass.schemaFields = result.data.updateClass.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            expect(result).toEqual({
              data: {
                createClass: {
                  name: 'MyNewClass',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                    { name: 'willBeRemoved', __typename: 'SchemaStringField' },
                  ],
                  __typename: 'Class',
                },
                updateClass: {
                  name: 'MyNewClass',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'arrayField1', __typename: 'SchemaArrayField' },
                    { name: 'arrayField2', __typename: 'SchemaArrayField' },
                    { name: 'booleanField1', __typename: 'SchemaBooleanField' },
                    { name: 'booleanField2', __typename: 'SchemaBooleanField' },
                    { name: 'bytesField1', __typename: 'SchemaBytesField' },
                    { name: 'bytesField2', __typename: 'SchemaBytesField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'dateField1', __typename: 'SchemaDateField' },
                    { name: 'dateField2', __typename: 'SchemaDateField' },
                    { name: 'fileField1', __typename: 'SchemaFileField' },
                    { name: 'fileField2', __typename: 'SchemaFileField' },
                    {
                      name: 'geoPointField',
                      __typename: 'SchemaGeoPointField',
                    },
                    { name: 'numberField1', __typename: 'SchemaNumberField' },
                    { name: 'numberField2', __typename: 'SchemaNumberField' },
                    { name: 'objectField1', __typename: 'SchemaObjectField' },
                    { name: 'objectField2', __typename: 'SchemaObjectField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    {
                      name: 'pointerField1',
                      __typename: 'SchemaPointerField',
                      targetClassName: 'Class1',
                    },
                    {
                      name: 'pointerField2',
                      __typename: 'SchemaPointerField',
                      targetClassName: 'Class6',
                    },
                    { name: 'polygonField1', __typename: 'SchemaPolygonField' },
                    { name: 'polygonField2', __typename: 'SchemaPolygonField' },
                    {
                      name: 'relationField1',
                      __typename: 'SchemaRelationField',
                      targetClassName: 'Class1',
                    },
                    {
                      name: 'relationField2',
                      __typename: 'SchemaRelationField',
                      targetClassName: 'Class6',
                    },
                    { name: 'stringField1', __typename: 'SchemaStringField' },
                    { name: 'stringField2', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                  ],
                  __typename: 'Class',
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query {
                  class(name: "MyNewClass") {
                    name
                    schemaFields {
                      name
                      __typename
                      ... on SchemaPointerField {
                        targetClassName
                      }
                      ... on SchemaRelationField {
                        targetClassName
                      }
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            getResult.data.class.schemaFields = getResult.data.class.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            expect(getResult.data).toEqual({
              class: {
                name: 'MyNewClass',
                schemaFields: [
                  { name: 'ACL', __typename: 'SchemaACLField' },
                  { name: 'arrayField1', __typename: 'SchemaArrayField' },
                  { name: 'arrayField2', __typename: 'SchemaArrayField' },
                  { name: 'booleanField1', __typename: 'SchemaBooleanField' },
                  { name: 'booleanField2', __typename: 'SchemaBooleanField' },
                  { name: 'bytesField1', __typename: 'SchemaBytesField' },
                  { name: 'bytesField2', __typename: 'SchemaBytesField' },
                  { name: 'createdAt', __typename: 'SchemaDateField' },
                  { name: 'dateField1', __typename: 'SchemaDateField' },
                  { name: 'dateField2', __typename: 'SchemaDateField' },
                  { name: 'fileField1', __typename: 'SchemaFileField' },
                  { name: 'fileField2', __typename: 'SchemaFileField' },
                  {
                    name: 'geoPointField',
                    __typename: 'SchemaGeoPointField',
                  },
                  { name: 'numberField1', __typename: 'SchemaNumberField' },
                  { name: 'numberField2', __typename: 'SchemaNumberField' },
                  { name: 'objectField1', __typename: 'SchemaObjectField' },
                  { name: 'objectField2', __typename: 'SchemaObjectField' },
                  { name: 'objectId', __typename: 'SchemaStringField' },
                  {
                    name: 'pointerField1',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'pointerField2',
                    __typename: 'SchemaPointerField',
                    targetClassName: 'Class6',
                  },
                  { name: 'polygonField1', __typename: 'SchemaPolygonField' },
                  { name: 'polygonField2', __typename: 'SchemaPolygonField' },
                  {
                    name: 'relationField1',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class1',
                  },
                  {
                    name: 'relationField2',
                    __typename: 'SchemaRelationField',
                    targetClassName: 'Class6',
                  },
                  { name: 'stringField1', __typename: 'SchemaStringField' },
                  { name: 'stringField2', __typename: 'SchemaStringField' },
                  { name: 'updatedAt', __typename: 'SchemaDateField' },
                ],
                __typename: 'Class',
              },
            });
          } catch (e) {
            handleError(e);
          }
        });

        it('should require master key to update an existing class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(name: "SomeClass") {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
          } catch (e) {
            handleError(e);
          }

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  updateClass(name: "SomeClass") {
                    name
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.OPERATION_FORBIDDEN
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'unauthorized: master key is required'
            );
          }
        });

        it('should not allow duplicated field names when updating', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    name: "SomeClass"
                    schemaFields: { addStrings: [{ name: "someField" }] }
                  ) {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
          } catch (e) {
            handleError(e);
          }

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  updateClass(
                    name: "SomeClass"
                    schemaFields: { addNumbers: [{ name: "someField" }] }
                  ) {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.INVALID_KEY_NAME
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'Duplicated field name: someField'
            );
          }
        });

        it('should fail if updating an inexistent class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  updateClass(
                    name: "SomeInexistentClass"
                    schemaFields: { addNumbers: [{ name: "someField" }] }
                  ) {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.INVALID_CLASS_NAME
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'Class SomeInexistentClass does not exist.'
            );
          }
        });

        it('should delete an existing class', async () => {
          try {
            const result = await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(
                    name: "MyNewClass"
                    schemaFields: { addStrings: [{ name: "willBeRemoved" }] }
                  ) {
                    name
                    schemaFields {
                      name
                      __typename
                    }
                  }
                  deleteClass(name: "MyNewClass") {
                    name
                    schemaFields {
                      name
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            result.data.createClass.schemaFields = result.data.createClass.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            result.data.deleteClass.schemaFields = result.data.deleteClass.schemaFields.sort(
              (a, b) => (a.name > b.name ? 1 : -1)
            );
            expect(result).toEqual({
              data: {
                createClass: {
                  name: 'MyNewClass',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                    { name: 'willBeRemoved', __typename: 'SchemaStringField' },
                  ],
                  __typename: 'Class',
                },
                deleteClass: {
                  name: 'MyNewClass',
                  schemaFields: [
                    { name: 'ACL', __typename: 'SchemaACLField' },
                    { name: 'createdAt', __typename: 'SchemaDateField' },
                    { name: 'objectId', __typename: 'SchemaStringField' },
                    { name: 'updatedAt', __typename: 'SchemaDateField' },
                    { name: 'willBeRemoved', __typename: 'SchemaStringField' },
                  ],
                  __typename: 'Class',
                },
              },
            });

            try {
              await apolloClient.query({
                query: gql`
                  query {
                    class(name: "MyNewClass") {
                      name
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });
              fail('should fail');
            } catch (e) {
              expect(e.graphQLErrors[0].extensions.code).toEqual(
                Parse.Error.INVALID_CLASS_NAME
              );
              expect(e.graphQLErrors[0].message).toEqual(
                'Class MyNewClass does not exist.'
              );
            }
          } catch (e) {
            handleError(e);
          }
        });

        it('should require master key to delete an existing class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  createClass(name: "SomeClass") {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
          } catch (e) {
            handleError(e);
          }

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  deleteClass(name: "SomeClass") {
                    name
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.OPERATION_FORBIDDEN
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'unauthorized: master key is required'
            );
          }
        });

        it('should fail if deleting an inexistent class', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation {
                  deleteClass(name: "SomeInexistentClass") {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.INVALID_CLASS_NAME
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'Class SomeInexistentClass does not exist.'
            );
          }
        });

        it('should require master key to get an existing class', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query {
                  class(name: "_User") {
                    name
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.OPERATION_FORBIDDEN
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'unauthorized: master key is required'
            );
          }
        });

        it('should require master key to find the existing classes', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query {
                  classes {
                    name
                  }
                }
              `,
            });
            fail('should fail');
          } catch (e) {
            expect(e.graphQLErrors[0].extensions.code).toEqual(
              Parse.Error.OPERATION_FORBIDDEN
            );
            expect(e.graphQLErrors[0].message).toEqual(
              'unauthorized: master key is required'
            );
          }
        });
      });

      describe('Objects Queries', () => {
        describe('Get', () => {
          it('should return a class object using class specific query', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField', 'someValue');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = (await apolloClient.query({
              query: gql`
                query GetCustomer($id: ID!) {
                  customer(id: $id) {
                    id
                    someField
                    createdAt
                    updatedAt
                  }
                }
              `,
              variables: {
                id: obj.id,
              },
            })).data.customer;

            expect(result.id).toEqual(obj.id);
            expect(result.someField).toEqual('someValue');
            expect(new Date(result.createdAt)).toEqual(obj.createdAt);
            expect(new Date(result.updatedAt)).toEqual(obj.updatedAt);
          });

          it_only_db('mongo')(
            'should return child objects in array fields',
            async () => {
              const obj1 = new Parse.Object('Customer');
              const obj2 = new Parse.Object('SomeClass');
              const obj3 = new Parse.Object('Customer');

              obj1.set('someCustomerField', 'imCustomerOne');
              const arrayField = [42.42, 42, 'string', true];
              obj1.set('arrayField', arrayField);
              await obj1.save();

              obj2.set('someClassField', 'imSomeClassTwo');
              await obj2.save();

              obj3.set('manyRelations', [obj1, obj2]);
              await obj3.save();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const result = (await apolloClient.query({
                query: gql`
                  query GetCustomer($id: ID!) {
                    customer(id: $id) {
                      id
                      manyRelations {
                        ... on Customer {
                          id
                          someCustomerField
                          arrayField {
                            ... on Element {
                              value
                            }
                          }
                        }
                        ... on SomeClass {
                          id
                          someClassField
                        }
                      }
                      createdAt
                      updatedAt
                    }
                  }
                `,
                variables: {
                  id: obj3.id,
                },
              })).data.customer;

              expect(result.id).toEqual(obj3.id);
              expect(result.manyRelations.length).toEqual(2);

              const customerSubObject = result.manyRelations.find(
                o => o.id === obj1.id
              );
              const someClassSubObject = result.manyRelations.find(
                o => o.id === obj2.id
              );

              expect(customerSubObject).toBeDefined();
              expect(someClassSubObject).toBeDefined();
              expect(customerSubObject.someCustomerField).toEqual(
                'imCustomerOne'
              );
              const formatedArrayField = customerSubObject.arrayField.map(
                elem => elem.value
              );
              expect(formatedArrayField).toEqual(arrayField);
              expect(someClassSubObject.someClassField).toEqual(
                'imSomeClassTwo'
              );
            }
          );

          it_only_db('mongo')(
            'should return many child objects in allow cyclic query',
            async () => {
              const obj1 = new Parse.Object('Employee');
              const obj2 = new Parse.Object('Team');
              const obj3 = new Parse.Object('Company');
              const obj4 = new Parse.Object('Country');

              obj1.set('name', 'imAnEmployee');
              await obj1.save();

              obj2.set('name', 'imATeam');
              obj2.set('employees', [obj1]);
              await obj2.save();

              obj3.set('name', 'imACompany');
              obj3.set('teams', [obj2]);
              obj3.set('employees', [obj1]);
              await obj3.save();

              obj4.set('name', 'imACountry');
              obj4.set('companies', [obj3]);
              await obj4.save();

              obj1.set('country', obj4);
              await obj1.save();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const result = (await apolloClient.query({
                query: gql`
                  query DeepComplexGraphQLQuery($id: ID!) {
                    country(id: $id) {
                      id
                      name
                      companies {
                        ... on Company {
                          id
                          name
                          employees {
                            ... on Employee {
                              id
                              name
                            }
                          }
                          teams {
                            ... on Team {
                              id
                              name
                              employees {
                                ... on Employee {
                                  id
                                  name
                                  country {
                                    id
                                    name
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                `,
                variables: {
                  id: obj4.id,
                },
              })).data.country;

              const expectedResult = {
                id: obj4.id,
                name: 'imACountry',
                __typename: 'Country',
                companies: [
                  {
                    id: obj3.id,
                    name: 'imACompany',
                    __typename: 'Company',
                    employees: [
                      {
                        id: obj1.id,
                        name: 'imAnEmployee',
                        __typename: 'Employee',
                      },
                    ],
                    teams: [
                      {
                        id: obj2.id,
                        name: 'imATeam',
                        __typename: 'Team',
                        employees: [
                          {
                            id: obj1.id,
                            name: 'imAnEmployee',
                            __typename: 'Employee',
                            country: {
                              id: obj4.id,
                              name: 'imACountry',
                              __typename: 'Country',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              };
              expect(result).toEqual(expectedResult);
            }
          );

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            async function getObject(className, id, headers) {
              const specificQueryResult = await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    get: ${className.charAt(0).toLowerCase() +
                      className.slice(1)}(id: $id) {
                        id
                      createdAt
                      someField
                    }
                  }
                `,
                variables: {
                  id,
                },
                context: {
                  headers,
                },
              });

              return specificQueryResult;
            }

            await Promise.all(
              objects
                .slice(0, 3)
                .map(obj =>
                  expectAsync(
                    getObject(obj.className, obj.id)
                  ).toBeRejectedWith(jasmine.stringMatching('Object not found'))
                )
            );
            expect(
              (await getObject(object4.className, object4.id)).data.get
                .someField
            ).toEqual('someValue4');
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (await getObject(obj.className, obj.id, {
                    'X-Parse-Master-Key': 'test',
                  })).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (await getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user1.getSessionToken(),
                  })).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (await getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user2.getSessionToken(),
                  })).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await expectAsync(
              getObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user3.getSessionToken(),
              })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            await Promise.all(
              [object1, object3, object4].map(async obj =>
                expect(
                  (await getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user3.getSessionToken(),
                  })).data.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.slice(0, 3).map(obj =>
                expectAsync(
                  getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user4.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'))
              )
            );
            expect(
              (await getObject(object4.className, object4.id, {
                'X-Parse-Session-Token': user4.getSessionToken(),
              })).data.get.someField
            ).toEqual('someValue4');
            await Promise.all(
              objects.slice(0, 2).map(obj =>
                expectAsync(
                  getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user5.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'))
              )
            );
            expect(
              (await getObject(object3.className, object3.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.get.someField
            ).toEqual('someValue3');
            expect(
              (await getObject(object4.className, object4.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.get.someField
            ).toEqual('someValue4');
          });

          it('should support keys argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  get: graphQLClass(id: $id) {
                    someField
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  get: graphQLClass(id: $id) {
                    someField
                    pointerToUser {
                      id
                    }
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.get.someField).toBeDefined();
            expect(result1.data.get.pointerToUser).toBeUndefined();
            expect(result2.data.get.someField).toBeDefined();
            expect(result2.data.get.pointerToUser).toBeDefined();
          });

          it('should support include argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  get: graphQLClass(id: $id) {
                    pointerToUser {
                      id
                    }
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  graphQLClass(id: $id) {
                    pointerToUser {
                      username
                    }
                  }
                }
              `,
              variables: {
                id: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.get.pointerToUser.username).toBeUndefined();
            expect(
              result2.data.graphQLClass.pointerToUser.username
            ).toBeDefined();
          });

          describe_only_db('mongo')('read preferences', () => {
            it('should read from primary by default', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    graphQLClass(id: $id) {
                      pointerToUser {
                        username
                      }
                    }
                  }
                `,
                variables: {
                  id: object3.id,
                },
                context: {
                  headers: {
                    'X-Parse-Session-Token': user1.getSessionToken(),
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls
                .all()
                .forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.PRIMARY
                    );
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.PRIMARY
                    );
                  }
                });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support readPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    graphQLClass(id: $id, readPreference: SECONDARY) {
                      pointerToUser {
                        username
                      }
                    }
                  }
                `,
                variables: {
                  id: object3.id,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls
                .all()
                .forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.SECONDARY
                    );
                  }
                });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support includeReadPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($id: ID!) {
                    graphQLClass(
                      id: $id
                      readPreference: SECONDARY
                      includeReadPreference: NEAREST
                    ) {
                      pointerToUser {
                        username
                      }
                    }
                  }
                `,
                variables: {
                  id: object3.id,
                },
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls
                .all()
                .forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.NEAREST
                    );
                  }
                });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });
          });
        });

        describe('Find', () => {
          it('should return class objects using class specific query', async () => {
            const obj1 = new Parse.Object('Customer');
            obj1.set('someField', 'someValue1');
            await obj1.save();
            const obj2 = new Parse.Object('Customer');
            obj2.set('someField', 'someValue1');
            await obj2.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindCustomer {
                  customers {
                    results {
                      id
                      someField
                      createdAt
                      updatedAt
                    }
                  }
                }
              `,
            });

            expect(result.data.customers.results.length).toEqual(2);

            result.data.customers.results.forEach(resultObj => {
              const obj = resultObj.id === obj1.id ? obj1 : obj2;
              expect(resultObj.id).toEqual(obj.id);
              expect(resultObj.someField).toEqual(obj.get('someField'));
              expect(new Date(resultObj.createdAt)).toEqual(obj.createdAt);
              expect(new Date(resultObj.updatedAt)).toEqual(obj.updatedAt);
            });
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            async function findObjects(className, headers) {
              const graphqlClassName = pluralize(
                className.charAt(0).toLowerCase() + className.slice(1)
              );
              const result = await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find: ${graphqlClassName} {
                      results {
                        id
                        someField
                      }
                    }
                  }
                `,
                context: {
                  headers,
                },
              });

              return result;
            }

            expect(
              (await findObjects('GraphQLClass')).data.find.results.map(
                object => object.someField
              )
            ).toEqual([]);
            expect(
              (await findObjects('PublicClass')).data.find.results.map(
                object => object.someField
              )
            ).toEqual(['someValue4']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Master-Key': 'test',
              })).data.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (await findObjects('PublicClass', {
                'X-Parse-Master-Key': 'test',
              })).data.find.results.map(object => object.someField)
            ).toEqual(['someValue4']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })).data.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (await findObjects('PublicClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })).data.find.results.map(object => object.someField)
            ).toEqual(['someValue4']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user3.getSessionToken(),
              })).data.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue3']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user4.getSessionToken(),
              })).data.find.results.map(object => object.someField)
            ).toEqual([]);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.find.results.map(object => object.someField)
            ).toEqual(['someValue3']);
          });

          it('should support where argument using class specific query', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassWhereInput) {
                  graphQLClasses(where: $where) {
                    results {
                      someField
                    }
                  }
                }
              `,
              variables: {
                where: {
                  someField: {
                    in: ['someValue1', 'someValue2', 'someValue3'],
                  },
                  OR: [
                    {
                      pointerToUser: {
                        equalTo: user5.id,
                      },
                    },
                    {
                      id: {
                        equalTo: object1.id,
                      },
                    },
                  ],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(
              result.data.graphQLClasses.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue3']);
          });

          it('should support in pointer operator using class specific query', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassWhereInput) {
                  graphQLClasses(where: $where) {
                    results {
                      someField
                    }
                  }
                }
              `,
              variables: {
                where: {
                  pointerToUser: {
                    in: [user5.id],
                  },
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            const { results } = result.data.graphQLClasses;
            expect(results.length).toBe(1);
            expect(results[0].someField).toEqual('someValue3');
          });

          it('should support OR operation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query {
                  graphQLClasses(
                    where: {
                      OR: [
                        { someField: { equalTo: "someValue1" } }
                        { someField: { equalTo: "someValue2" } }
                      ]
                    }
                  ) {
                    results {
                      someField
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(
              result.data.graphQLClasses.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2']);
          });

          it('should support full text search', async () => {
            try {
              const obj = new Parse.Object('FullTextSearchTest');
              obj.set('field1', 'Parse GraphQL Server');
              obj.set('field2', 'It rocks!');
              await obj.save();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const result = await apolloClient.query({
                query: gql`
                  query FullTextSearchTests(
                    $where: FullTextSearchTestWhereInput
                  ) {
                    fullTextSearchTests(where: $where) {
                      results {
                        id
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
                variables: {
                  where: {
                    field1: {
                      text: {
                        search: {
                          term: 'graphql',
                        },
                      },
                    },
                  },
                },
              });

              expect(result.data.fullTextSearchTests.results[0].id).toEqual(
                obj.id
              );
            } catch (e) {
              handleError(e);
            }
          });

          it('should support order, skip and limit arguments', async () => {
            const promises = [];
            for (let i = 0; i < 100; i++) {
              const obj = new Parse.Object('SomeClass');
              obj.set('someField', `someValue${i < 10 ? '0' : ''}${i}`);
              obj.set('numberField', i % 3);
              promises.push(obj.save());
            }
            await Promise.all(promises);

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects(
                  $where: SomeClassWhereInput
                  $order: [SomeClassOrder!]
                  $skip: Int
                  $limit: Int
                ) {
                  find: someClasses(
                    where: $where
                    order: $order
                    skip: $skip
                    limit: $limit
                  ) {
                    results {
                      someField
                    }
                  }
                }
              `,
              variables: {
                where: {
                  someField: {
                    matchesRegex: '^someValue',
                  },
                },
                order: ['numberField_DESC', 'someField_ASC'],
                skip: 4,
                limit: 2,
              },
            });

            expect(result.data.find.results.map(obj => obj.someField)).toEqual([
              'someValue14',
              'someValue17',
            ]);
          });

          it('should support count', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const where = {
              someField: {
                in: ['someValue1', 'someValue2', 'someValue3'],
              },
              OR: [
                {
                  pointerToUser: {
                    equalTo: user5.id,
                  },
                },
                {
                  id: {
                    equalTo: object1.id,
                  },
                },
              ],
            };

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects(
                  $where: GraphQLClassWhereInput
                  $limit: Int
                ) {
                  find: graphQLClasses(where: $where, limit: $limit) {
                    results {
                      id
                    }
                    count
                  }
                }
              `,
              variables: {
                where,
                limit: 0,
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.find.results).toEqual([]);
            expect(result.data.find.count).toEqual(2);
          });

          it('should only count', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const where = {
              someField: {
                in: ['someValue1', 'someValue2', 'someValue3'],
              },
              OR: [
                {
                  pointerToUser: {
                    equalTo: user5.id,
                  },
                },
                {
                  id: {
                    equalTo: object1.id,
                  },
                },
              ],
            };

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    count
                  }
                }
              `,
              variables: {
                where,
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.find.results).toBeUndefined();
            expect(result.data.find.count).toEqual(2);
          });

          it('should respect max limit', async () => {
            parseServer = await global.reconfigureServer({
              maxLimit: 10,
            });

            const promises = [];
            for (let i = 0; i < 100; i++) {
              const obj = new Parse.Object('SomeClass');
              promises.push(obj.save());
            }
            await Promise.all(promises);

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($limit: Int) {
                  find: someClasses(
                    where: { id: { exists: true } }
                    limit: $limit
                  ) {
                    results {
                      id
                    }
                    count
                  }
                }
              `,
              variables: {
                limit: 50,
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.find.results.length).toEqual(10);
            expect(result.data.find.count).toEqual(100);
          });

          it('should support keys argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    results {
                      someField
                    }
                  }
                }
              `,
              variables: {
                where: {
                  id: { equalTo: object3.id },
                },
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    results {
                      someField
                      pointerToUser {
                        username
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  id: { equalTo: object3.id },
                },
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.find.results[0].someField).toBeDefined();
            expect(result1.data.find.results[0].pointerToUser).toBeUndefined();
            expect(result2.data.find.results[0].someField).toBeDefined();
            expect(result2.data.find.results[0].pointerToUser).toBeDefined();
          });

          it('should support include argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const where = {
              id: {
                equalTo: object3.id,
              },
            };

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    results {
                      pointerToUser {
                        id
                      }
                    }
                  }
                }
              `,
              variables: {
                where,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: GraphQLClassWhereInput) {
                  find: graphQLClasses(where: $where) {
                    results {
                      pointerToUser {
                        username
                      }
                    }
                  }
                }
              `,
              variables: {
                where,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });
            expect(
              result1.data.find.results[0].pointerToUser.username
            ).toBeUndefined();
            expect(
              result2.data.find.results[0].pointerToUser.username
            ).toBeDefined();
          });

          describe_only_db('mongo')('read preferences', () => {
            it('should read from primary by default', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find: graphQLClasses {
                      results {
                        pointerToUser {
                          username
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Session-Token': user1.getSessionToken(),
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls
                .all()
                .forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.PRIMARY
                    );
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.PRIMARY
                    );
                  }
                });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support readPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find: graphQLClasses(readPreference: SECONDARY) {
                      results {
                        pointerToUser {
                          username
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls
                .all()
                .forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.SECONDARY
                    );
                  }
                });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support includeReadPreference argument', async () => {
              await prepareData();

              await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    graphQLClasses(
                      readPreference: SECONDARY
                      includeReadPreference: NEAREST
                    ) {
                      results {
                        pointerToUser {
                          username
                        }
                      }
                    }
                  }
                `,
                context: {
                  headers: {
                    'X-Parse-Master-Key': 'test',
                  },
                },
              });

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls
                .all()
                .forEach(call => {
                  if (call.args[0].ns.collection.indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].ns.collection.indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[0].options.readPreference.mode).toBe(
                      ReadPreference.NEAREST
                    );
                  }
                });

              expect(foundGraphQLClassReadPreference).toBe(true);
              expect(foundUserClassReadPreference).toBe(true);
            });

            it('should support subqueryReadPreference argument', async () => {
              try {
                await prepareData();

                await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

                const databaseAdapter =
                  parseServer.config.databaseController.adapter;
                spyOn(
                  databaseAdapter.database.serverConfig,
                  'cursor'
                ).and.callThrough();

                await apolloClient.query({
                  query: gql`
                    query FindSomeObjects($where: GraphQLClassWhereInput) {
                      find: graphQLClasses(
                        where: $where
                        readPreference: SECONDARY
                        subqueryReadPreference: NEAREST
                      ) {
                        results {
                          id
                        }
                      }
                    }
                  `,
                  variables: {
                    where: {
                      pointerToUser: {
                        inQuery: { where: {}, className: '_User' },
                      },
                    },
                  },
                  context: {
                    headers: {
                      'X-Parse-Master-Key': 'test',
                    },
                  },
                });

                let foundGraphQLClassReadPreference = false;
                let foundUserClassReadPreference = false;
                databaseAdapter.database.serverConfig.cursor.calls
                  .all()
                  .forEach(call => {
                    if (
                      call.args[0].ns.collection.indexOf('GraphQLClass') >= 0
                    ) {
                      foundGraphQLClassReadPreference = true;
                      expect(call.args[0].options.readPreference.mode).toBe(
                        ReadPreference.SECONDARY
                      );
                    } else if (
                      call.args[0].ns.collection.indexOf('_User') >= 0
                    ) {
                      foundUserClassReadPreference = true;
                      expect(call.args[0].options.readPreference.mode).toBe(
                        ReadPreference.NEAREST
                      );
                    }
                  });

                expect(foundGraphQLClassReadPreference).toBe(true);
                expect(foundUserClassReadPreference).toBe(true);
              } catch (e) {
                handleError(e);
              }
            });
          });
        });
      });

      describe('Objects Mutations', () => {
        describe('Create', () => {
          it('should return specific type object using class specific mutation', async () => {
            const customerSchema = new Parse.Schema('Customer');
            customerSchema.addString('someField');
            await customerSchema.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation CreateCustomer($fields: CreateCustomerFieldsInput) {
                  createCustomer(fields: $fields) {
                    id
                    createdAt
                    someField
                  }
                }
              `,
              variables: {
                fields: {
                  someField: 'someValue',
                },
              },
            });

            expect(result.data.createCustomer.id).toBeDefined();
            expect(result.data.createCustomer.someField).toEqual('someValue');

            const customer = await new Parse.Query('Customer').get(
              result.data.createCustomer.id
            );

            expect(customer.createdAt).toEqual(
              new Date(result.data.createCustomer.createdAt)
            );
            expect(customer.get('someField')).toEqual('someValue');
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            async function createObject(className, headers) {
              const result = await apolloClient.mutate({
                mutation: gql`
                  mutation CreateSomeObject {
                    create${className} {
                      id
                      createdAt
                    }
                  }
                `,
                context: {
                  headers,
                },
              });

              const specificCreate = result.data[`create${className}`];
              expect(specificCreate.id).toBeDefined();
              expect(specificCreate.createdAt).toBeDefined();

              return result;
            }

            await expectAsync(createObject('GraphQLClass')).toBeRejectedWith(
              jasmine.stringMatching(
                'Permission denied for action create on class GraphQLClass'
              )
            );
            await expectAsync(createObject('PublicClass')).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', { 'X-Parse-Master-Key': 'test' })
            ).toBeResolved();
            await expectAsync(
              createObject('PublicClass', { 'X-Parse-Master-Key': 'test' })
            ).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('PublicClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('PublicClass', {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })
            ).toBeResolved();
            await expectAsync(
              createObject('GraphQLClass', {
                'X-Parse-Session-Token': user4.getSessionToken(),
              })
            ).toBeRejectedWith(
              jasmine.stringMatching(
                'Permission denied for action create on class GraphQLClass'
              )
            );
            await expectAsync(
              createObject('PublicClass', {
                'X-Parse-Session-Token': user4.getSessionToken(),
              })
            ).toBeResolved();
          });
        });

        describe('Update', () => {
          it('should return specific type object using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCustomer(
                  $id: ID!
                  $fields: UpdateCustomerFieldsInput
                ) {
                  updateCustomer(id: $id, fields: $fields) {
                    updatedAt
                    someField1
                    someField2
                  }
                }
              `,
              variables: {
                id: obj.id,
                fields: {
                  someField1: 'someField1Value2',
                },
              },
            });

            expect(result.data.updateCustomer.updatedAt).toBeDefined();
            expect(result.data.updateCustomer.someField1).toEqual(
              'someField1Value2'
            );
            expect(result.data.updateCustomer.someField2).toEqual(
              'someField2Value1'
            );

            await obj.fetch();

            expect(obj.get('someField1')).toEqual('someField1Value2');
            expect(obj.get('someField2')).toEqual('someField2Value1');
          });

          it('should return only id using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCustomer(
                  $id: ID!
                  $fields: UpdateCustomerFieldsInput
                ) {
                  updateCustomer(id: $id, fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                id: obj.id,
                fields: {
                  someField1: 'someField1Value2',
                },
              },
            });

            expect(result.data.updateCustomer.id).toEqual(obj.id);

            await obj.fetch();

            expect(obj.get('someField1')).toEqual('someField1Value2');
            expect(obj.get('someField2')).toEqual('someField2Value1');
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            async function updateObject(className, id, fields, headers) {
              return await apolloClient.mutate({
                mutation: gql`
                  mutation UpdateSomeObject(
                    $id: ID!
                    $fields: Update${className}FieldsInput
                  ) {
                    update: update${className}(
                      id: $id
                      fields: $fields
                    ) {
                      updatedAt
                    }
                  }
                `,
                variables: {
                  id,
                  fields,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(obj.className, obj.id, {
                    someField: 'changedValue1',
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await updateObject(object4.className, object4.id, {
                someField: 'changedValue1',
              })).data.update.updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue1');
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue2' },
                    { 'X-Parse-Master-Key': 'test' }
                  )).data.update.updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue2');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue3' },
                    { 'X-Parse-Session-Token': user1.getSessionToken() }
                  )).data.update.updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue3');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue4' },
                    { 'X-Parse-Session-Token': user2.getSessionToken() }
                  )).data.update.updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue4');
              })
            );
            await Promise.all(
              [object1, object3, object4].map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue5' },
                    { 'X-Parse-Session-Token': user3.getSessionToken() }
                  )).data.update.updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue5');
              })
            );
            const originalFieldValue = object2.get('someField');
            await expectAsync(
              updateObject(
                object2.className,
                object2.id,
                { someField: 'changedValue5' },
                { 'X-Parse-Session-Token': user3.getSessionToken() }
              )
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            await object2.fetch({ useMasterKey: true });
            expect(object2.get('someField')).toEqual(originalFieldValue);
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue6' },
                    { 'X-Parse-Session-Token': user4.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await updateObject(
                object4.className,
                object4.id,
                { someField: 'changedValue6' },
                { 'X-Parse-Session-Token': user4.getSessionToken() }
              )).data.update.updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue6');
            await Promise.all(
              objects.slice(0, 2).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue7' },
                    { 'X-Parse-Session-Token': user5.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await updateObject(
                object3.className,
                object3.id,
                { someField: 'changedValue7' },
                { 'X-Parse-Session-Token': user5.getSessionToken() }
              )).data.update.updatedAt
            ).toBeDefined();
            await object3.fetch({ useMasterKey: true });
            expect(object3.get('someField')).toEqual('changedValue7');
            expect(
              (await updateObject(
                object4.className,
                object4.id,
                { someField: 'changedValue7' },
                { 'X-Parse-Session-Token': user5.getSessionToken() }
              )).data.update.updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue7');
          });

          it('should respect level permissions with specific class mutation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            function updateObject(className, id, fields, headers) {
              return apolloClient.mutate({
                mutation: gql`
                  mutation UpdateSomeObject(
                    $id: ID!
                    $fields: Update${className}FieldsInput
                  ) {
                    update${className}(
                      id: $id
                      fields: $fields
                    ) {
                      updatedAt
                    }
                  }
                `,
                variables: {
                  id,
                  fields,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(obj.className, obj.id, {
                    someField: 'changedValue1',
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await updateObject(object4.className, object4.id, {
                someField: 'changedValue1',
              })).data[`update${object4.className}`].updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue1');
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue2' },
                    { 'X-Parse-Master-Key': 'test' }
                  )).data[`update${obj.className}`].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue2');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue3' },
                    { 'X-Parse-Session-Token': user1.getSessionToken() }
                  )).data[`update${obj.className}`].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue3');
              })
            );
            await Promise.all(
              objects.map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue4' },
                    { 'X-Parse-Session-Token': user2.getSessionToken() }
                  )).data[`update${obj.className}`].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue4');
              })
            );
            await Promise.all(
              [object1, object3, object4].map(async obj => {
                expect(
                  (await updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue5' },
                    { 'X-Parse-Session-Token': user3.getSessionToken() }
                  )).data[`update${obj.className}`].updatedAt
                ).toBeDefined();
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual('changedValue5');
              })
            );
            const originalFieldValue = object2.get('someField');
            await expectAsync(
              updateObject(
                object2.className,
                object2.id,
                { someField: 'changedValue5' },
                { 'X-Parse-Session-Token': user3.getSessionToken() }
              )
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            await object2.fetch({ useMasterKey: true });
            expect(object2.get('someField')).toEqual(originalFieldValue);
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue6' },
                    { 'X-Parse-Session-Token': user4.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await updateObject(
                object4.className,
                object4.id,
                { someField: 'changedValue6' },
                { 'X-Parse-Session-Token': user4.getSessionToken() }
              )).data[`update${object4.className}`].updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue6');
            await Promise.all(
              objects.slice(0, 2).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  updateObject(
                    obj.className,
                    obj.id,
                    { someField: 'changedValue7' },
                    { 'X-Parse-Session-Token': user5.getSessionToken() }
                  )
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await updateObject(
                object3.className,
                object3.id,
                { someField: 'changedValue7' },
                { 'X-Parse-Session-Token': user5.getSessionToken() }
              )).data[`update${object3.className}`].updatedAt
            ).toBeDefined();
            await object3.fetch({ useMasterKey: true });
            expect(object3.get('someField')).toEqual('changedValue7');
            expect(
              (await updateObject(
                object4.className,
                object4.id,
                { someField: 'changedValue7' },
                { 'X-Parse-Session-Token': user5.getSessionToken() }
              )).data[`update${object4.className}`].updatedAt
            ).toBeDefined();
            await object4.fetch({ useMasterKey: true });
            expect(object4.get('someField')).toEqual('changedValue7');
          });
        });

        describe('Delete', () => {
          it('should return a specific type using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation DeleteCustomer($id: ID!) {
                  deleteCustomer(id: $id) {
                    id
                    someField1
                    someField2
                  }
                }
              `,
              variables: {
                id: obj.id,
              },
            });

            expect(result.data.deleteCustomer.id).toEqual(obj.id);
            expect(result.data.deleteCustomer.someField1).toEqual(
              'someField1Value1'
            );
            expect(result.data.deleteCustomer.someField2).toEqual(
              'someField2Value1'
            );

            await expectAsync(
              obj.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            function deleteObject(className, id, headers) {
              return apolloClient.mutate({
                mutation: gql`
                  mutation DeleteSomeObject(
                    $id: ID!
                  ) {
                    delete: delete${className}(id: $id) {
                      id
                    }
                  }
                `,
                variables: {
                  id,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  deleteObject(obj.className, obj.id)
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  deleteObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user4.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await deleteObject(object4.className, object4.id)).data.delete
            ).toEqual({ id: object4.id, __typename: 'PublicClass' });
            await expectAsync(
              object4.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object1.className, object1.id, {
                'X-Parse-Master-Key': 'test',
              })).data.delete
            ).toEqual({ id: object1.id, __typename: 'GraphQLClass' });
            await expectAsync(
              object1.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data.delete
            ).toEqual({ id: object2.id, __typename: 'GraphQLClass' });
            await expectAsync(
              object2.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object3.className, object3.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.delete
            ).toEqual({ id: object3.id, __typename: 'GraphQLClass' });
            await expectAsync(
              object3.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
          });

          it('should respect level permissions with specific class mutation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            function deleteObject(className, id, headers) {
              return apolloClient.mutate({
                mutation: gql`
                  mutation DeleteSomeObject(
                    $id: ID!
                  ) {
                    delete${className}(id: $id) {
                      id
                    }
                  }
                `,
                variables: {
                  id,
                },
                context: {
                  headers,
                },
              });
            }

            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  deleteObject(obj.className, obj.id)
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            await Promise.all(
              objects.slice(0, 3).map(async obj => {
                const originalFieldValue = obj.get('someField');
                await expectAsync(
                  deleteObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user4.getSessionToken(),
                  })
                ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
                await obj.fetch({ useMasterKey: true });
                expect(obj.get('someField')).toEqual(originalFieldValue);
              })
            );
            expect(
              (await deleteObject(object4.className, object4.id)).data[
                `delete${object4.className}`
              ].id
            ).toEqual(object4.id);
            await expectAsync(
              object4.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object1.className, object1.id, {
                'X-Parse-Master-Key': 'test',
              })).data[`delete${object1.className}`].id
            ).toEqual(object1.id);
            await expectAsync(
              object1.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data[`delete${object2.className}`].id
            ).toEqual(object2.id);
            await expectAsync(
              object2.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object3.className, object3.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data[`delete${object3.className}`].id
            ).toEqual(object3.id);
            await expectAsync(
              object3.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
          });
        });
      });

      describe('Files Mutations', () => {
        describe('Create', () => {
          it('should return File object', async () => {
            parseServer = await global.reconfigureServer({
              publicServerURL: 'http://localhost:13377/parse',
            });

            const body = new FormData();
            body.append(
              'operations',
              JSON.stringify({
                query: `
                  mutation CreateFile($upload: Upload!) {
                    createFile(upload: $upload) {
                      name
                      url
                    }
                  }
                `,
                variables: {
                  upload: null,
                },
              })
            );
            body.append('map', JSON.stringify({ 1: ['variables.upload'] }));
            body.append('1', 'My File Content', {
              filename: 'myFileName.txt',
              contentType: 'text/plain',
            });

            let res = await fetch('http://localhost:13377/graphql', {
              method: 'POST',
              headers,
              body,
            });

            expect(res.status).toEqual(200);

            const result = JSON.parse(await res.text());

            expect(result.data.createFile.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result.data.createFile.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );

            res = await fetch(result.data.createFile.url);

            expect(res.status).toEqual(200);
            expect(await res.text()).toEqual('My File Content');
          });
        });
      });

      describe('Users Queries', () => {
        it('should return current logged user', async () => {
          const userName = 'user1',
            password = 'user1',
            email = 'emailUser1@parse.com';

          const user = new Parse.User();
          user.setUsername(userName);
          user.setPassword(password);
          user.setEmail(email);
          await user.signUp();

          const session = await Parse.Session.current();
          const result = await apolloClient.query({
            query: gql`
              query GetCurrentUser {
                viewer {
                  id
                  username
                  email
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          const {
            id,
            username: resultUserName,
            email: resultEmail,
          } = result.data.viewer;
          expect(id).toBeDefined();
          expect(resultUserName).toEqual(userName);
          expect(resultEmail).toEqual(email);
        });

        it('should return logged user including pointer', async () => {
          const foo = new Parse.Object('Foo');
          foo.set('bar', 'hello');

          const userName = 'user1',
            password = 'user1',
            email = 'emailUser1@parse.com';

          const user = new Parse.User();
          user.setUsername(userName);
          user.setPassword(password);
          user.setEmail(email);
          user.set('userFoo', foo);
          await user.signUp();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const session = await Parse.Session.current();
          const result = await apolloClient.query({
            query: gql`
              query GetCurrentUser {
                viewer {
                  id
                  sessionToken
                  userFoo {
                    bar
                  }
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          const { id, sessionToken, userFoo: resultFoo } = result.data.viewer;
          expect(id).toEqual(user.id);
          expect(sessionToken).toBeDefined();
          expect(resultFoo).toBeDefined();
          expect(resultFoo.bar).toEqual('hello');
        });
      });

      describe('Users Mutations', () => {
        it('should sign user up', async () => {
          const userSchema = new Parse.Schema('_User');
          userSchema.addString('someField');
          await userSchema.update();
          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation SignUp($fields: SignUpFieldsInput) {
                signUp(fields: $fields) {
                  sessionToken
                  someField
                }
              }
            `,
            variables: {
              fields: {
                username: 'user1',
                password: 'user1',
                someField: 'someValue',
              },
            },
          });

          expect(result.data.signUp.sessionToken).toBeDefined();
          expect(result.data.signUp.someField).toEqual('someValue');
          expect(typeof result.data.signUp.sessionToken).toBe('string');
        });

        it('should log the user in', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          user.set('someField', 'someValue');
          await user.signUp();
          await Parse.User.logOut();
          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation LogInUser($fields: LogInFieldsInput) {
                logIn(fields: $fields) {
                  sessionToken
                  someField
                }
              }
            `,
            variables: {
              fields: {
                username: 'user1',
                password: 'user1',
              },
            },
          });

          expect(result.data.logIn.sessionToken).toBeDefined();
          expect(result.data.logIn.someField).toEqual('someValue');
          expect(typeof result.data.logIn.sessionToken).toBe('string');
        });

        it('should log the user out', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();
          await Parse.User.logOut();

          const logIn = await apolloClient.mutate({
            mutation: gql`
              mutation LogInUser($fields: LogInFieldsInput) {
                logIn(fields: $fields) {
                  sessionToken
                }
              }
            `,
            variables: {
              fields: {
                username: 'user1',
                password: 'user1',
              },
            },
          });

          const sessionToken = logIn.data.logIn.sessionToken;

          const logOut = await apolloClient.mutate({
            mutation: gql`
              mutation LogOutUser {
                logOut {
                  sessionToken
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': sessionToken,
              },
            },
          });
          expect(logOut.data.logOut).toBeDefined();

          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  me {
                    username
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': sessionToken,
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { statusCode, result } = err.networkError;
            expect(statusCode).toBe(400);
            expect(result).toEqual({
              code: 209,
              error: 'Invalid session token',
            });
          }
        });
      });

      describe('Session Token', () => {
        it('should fail due to invalid session token', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  me {
                    username
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': 'foo',
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { statusCode, result } = err.networkError;
            expect(statusCode).toBe(400);
            expect(result).toEqual({
              code: 209,
              error: 'Invalid session token',
            });
          }
        });

        it('should fail due to empty session token', async () => {
          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  viewer {
                    username
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': '',
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { graphQLErrors } = err;
            expect(graphQLErrors.length).toBe(1);
            expect(graphQLErrors[0].message).toBe('Invalid session token');
          }
        });

        it('should find a user and fail due to empty session token', async () => {
          const car = new Parse.Object('Car');
          await car.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          try {
            await apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  viewer {
                    username
                  }
                  cars {
                    results {
                      id
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': '',
                },
              },
            });
            fail('should not retrieve current user due to session token');
          } catch (err) {
            const { graphQLErrors } = err;
            expect(graphQLErrors.length).toBe(1);
            expect(graphQLErrors[0].message).toBe('Invalid session token');
          }
        });
      });

      describe('Functions Mutations', () => {
        it('can be called', async () => {
          Parse.Cloud.define('hello', async () => {
            return 'Hello world!';
          });

          const result = await apolloClient.mutate({
            mutation: gql`
              mutation CallFunction {
                callCloudCode(functionName: "hello")
              }
            `,
          });

          expect(result.data.callCloudCode).toEqual('Hello world!');
        });

        it('can throw errors', async () => {
          Parse.Cloud.define('hello', async () => {
            throw new Error('Some error message.');
          });

          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation CallFunction {
                  callCloudCode(functionName: "hello")
                }
              `,
            });
            fail('Should throw an error');
          } catch (e) {
            const { graphQLErrors } = e;
            expect(graphQLErrors.length).toBe(1);
            expect(graphQLErrors[0].message).toBe('Some error message.');
          }
        });

        it('should accept different params', done => {
          Parse.Cloud.define('hello', async req => {
            expect(req.params.date instanceof Date).toBe(true);
            expect(req.params.date.getTime()).toBe(1463907600000);
            expect(req.params.dateList[0] instanceof Date).toBe(true);
            expect(req.params.dateList[0].getTime()).toBe(1463907600000);
            expect(req.params.complexStructure.date[0] instanceof Date).toBe(
              true
            );
            expect(req.params.complexStructure.date[0].getTime()).toBe(
              1463907600000
            );
            expect(
              req.params.complexStructure.deepDate.date[0] instanceof Date
            ).toBe(true);
            expect(req.params.complexStructure.deepDate.date[0].getTime()).toBe(
              1463907600000
            );
            expect(
              req.params.complexStructure.deepDate2[0].date instanceof Date
            ).toBe(true);
            expect(
              req.params.complexStructure.deepDate2[0].date.getTime()
            ).toBe(1463907600000);
            // Regression for #2294
            expect(req.params.file instanceof Parse.File).toBe(true);
            expect(req.params.file.url()).toEqual('https://some.url');
            // Regression for #2204
            expect(req.params.array).toEqual(['a', 'b', 'c']);
            expect(Array.isArray(req.params.array)).toBe(true);
            expect(req.params.arrayOfArray).toEqual([
              ['a', 'b', 'c'],
              ['d', 'e', 'f'],
            ]);
            expect(Array.isArray(req.params.arrayOfArray)).toBe(true);
            expect(Array.isArray(req.params.arrayOfArray[0])).toBe(true);
            expect(Array.isArray(req.params.arrayOfArray[1])).toBe(true);

            done();
          });

          const params = {
            date: {
              __type: 'Date',
              iso: '2016-05-22T09:00:00.000Z',
            },
            dateList: [
              {
                __type: 'Date',
                iso: '2016-05-22T09:00:00.000Z',
              },
            ],
            lol: 'hello',
            complexStructure: {
              date: [
                {
                  __type: 'Date',
                  iso: '2016-05-22T09:00:00.000Z',
                },
              ],
              deepDate: {
                date: [
                  {
                    __type: 'Date',
                    iso: '2016-05-22T09:00:00.000Z',
                  },
                ],
              },
              deepDate2: [
                {
                  date: {
                    __type: 'Date',
                    iso: '2016-05-22T09:00:00.000Z',
                  },
                },
              ],
            },
            file: Parse.File.fromJSON({
              __type: 'File',
              name: 'name',
              url: 'https://some.url',
            }),
            array: ['a', 'b', 'c'],
            arrayOfArray: [['a', 'b', 'c'], ['d', 'e', 'f']],
          };

          apolloClient.mutate({
            mutation: gql`
              mutation CallFunction($params: Object) {
                callCloudCode(functionName: "hello", params: $params)
              }
            `,
            variables: {
              params,
            },
          });
        });
      });

      describe('Data Types', () => {
        it('should support String', async () => {
          try {
            const someFieldValue = 'some string';

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addStrings: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('String');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: String) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(
                    where: { someField: { equalTo: $someFieldValue } }
                  ) {
                    results {
                      someField
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('string');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Int numbers', async () => {
          try {
            const someFieldValue = 123;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addNumbers: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Number');

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: Float) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(
                    where: { someField: { equalTo: $someFieldValue } }
                  ) {
                    results {
                      someField
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('number');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Float numbers', async () => {
          try {
            const someFieldValue = 123.4;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addNumbers: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Number');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: Float) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(
                    where: { someField: { equalTo: $someFieldValue } }
                  ) {
                    results {
                      someField
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('number');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Boolean', async () => {
          try {
            const someFieldValueTrue = true;
            const someFieldValueFalse = false;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addBooleans: [
                    { name: 'someFieldTrue' },
                    { name: 'someFieldFalse' },
                  ],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someFieldTrue.type).toEqual('Boolean');
            expect(schema.fields.someFieldFalse.type).toEqual('Boolean');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someFieldTrue: someFieldValueTrue,
                  someFieldFalse: someFieldValueFalse,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject(
                  $id: ID!
                  $someFieldValueTrue: Boolean
                  $someFieldValueFalse: Boolean
                ) {
                  someClass(id: $id) {
                    someFieldTrue
                    someFieldFalse
                  }
                  someClasses(
                    where: {
                      someFieldTrue: { equalTo: $someFieldValueTrue }
                      someFieldFalse: { equalTo: $someFieldValueFalse }
                    }
                  ) {
                    results {
                      id
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
                someFieldValueTrue,
                someFieldValueFalse,
              },
            });

            expect(typeof getResult.data.someClass.someFieldTrue).toEqual(
              'boolean'
            );
            expect(typeof getResult.data.someClass.someFieldFalse).toEqual(
              'boolean'
            );
            expect(getResult.data.someClass.someFieldTrue).toEqual(true);
            expect(getResult.data.someClass.someFieldFalse).toEqual(false);
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Date', async () => {
          try {
            const someFieldValue = new Date();

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addDates: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Date');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(where: { someField: { exists: true } }) {
                    results {
                      id
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
              },
            });

            expect(new Date(getResult.data.someClass.someField)).toEqual(
              someFieldValue
            );
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support createdAt and updatedAt', async () => {
          await apolloClient.mutate({
            mutation: gql`
              mutation CreateClass {
                createClass(name: "SomeClass") {
                  name
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.createdAt.type).toEqual('Date');
          expect(schema.fields.updatedAt.type).toEqual('Date');
        });

        it('should support pointer on create', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          await company2.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const {
            data: { createCountry: result },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Create($fields: CreateCountryFieldsInput) {
                createCountry(fields: $fields) {
                  id
                  company {
                    id
                    name
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imCountry2',
                company: { link: company2.id },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.id).toEqual(company2.id);
          expect(result.company.name).toEqual('imACompany2');
        });

        it('should support nested pointer on create', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const {
            data: { createCountry: result },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Create($fields: CreateCountryFieldsInput) {
                createCountry(fields: $fields) {
                  id
                  company {
                    id
                    name
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imCountry2',
                company: {
                  createAndLink: {
                    name: 'imACompany2',
                  },
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.id).toBeDefined();
          expect(result.company.name).toEqual('imACompany2');
        });

        it('should support pointer on update', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          await company2.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const {
            data: { updateCountry: result },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Update($id: ID!, $fields: UpdateCountryFieldsInput) {
                updateCountry(id: $id, fields: $fields) {
                  id
                  company {
                    id
                    name
                  }
                }
              }
            `,
            variables: {
              id: country.id,
              fields: {
                company: { link: company2.id },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.id).toEqual(company2.id);
          expect(result.company.name).toEqual('imACompany2');
        });

        it('should support nested pointer on update', async () => {
          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.set('company', company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const {
            data: { updateCountry: result },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation Update($id: ID!, $fields: UpdateCountryFieldsInput) {
                updateCountry(id: $id, fields: $fields) {
                  id
                  company {
                    id
                    name
                  }
                }
              }
            `,
            variables: {
              id: country.id,
              fields: {
                company: {
                  createAndLink: {
                    name: 'imACompany2',
                  },
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.company.id).toBeDefined();
          expect(result.company.name).toEqual('imACompany2');
        });

        it_only_db('mongo')(
          'should support relation and nested relation on create',
          async () => {
            const company = new Parse.Object('Company');
            company.set('name', 'imACompany1');
            await company.save();

            const country = new Parse.Object('Country');
            country.set('name', 'imACountry');
            country.relation('companies').add(company);
            await country.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const {
              data: { createCountry: result },
            } = await apolloClient.mutate({
              mutation: gql`
                mutation CreateCountry($fields: CreateCountryFieldsInput) {
                  createCountry(fields: $fields) {
                    id
                    name
                    companies {
                      results {
                        id
                        name
                      }
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  name: 'imACountry2',
                  companies: {
                    add: [company.id],
                    createAndAdd: [
                      {
                        name: 'imACompany2',
                      },
                      {
                        name: 'imACompany3',
                      },
                    ],
                  },
                },
              },
            });

            expect(result.id).toBeDefined();
            expect(result.name).toEqual('imACountry2');
            expect(result.companies.results.length).toEqual(3);
            expect(
              result.companies.results.some(o => o.id === company.id)
            ).toBeTruthy();
            expect(
              result.companies.results.some(o => o.name === 'imACompany2')
            ).toBeTruthy();
            expect(
              result.companies.results.some(o => o.name === 'imACompany3')
            ).toBeTruthy();
          }
        );

        it_only_db('mongo')('should support deep nested creation', async () => {
          const team = new Parse.Object('Team');
          team.set('name', 'imATeam1');
          await team.save();

          const company = new Parse.Object('Company');
          company.set('name', 'imACompany1');
          company.relation('teams').add(team);
          await company.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add(company);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const {
            data: { createCountry: result },
          } = await apolloClient.mutate({
            mutation: gql`
              mutation CreateCountry($fields: CreateCountryFieldsInput) {
                createCountry(fields: $fields) {
                  id
                  name
                  companies {
                    results {
                      id
                      name
                      teams {
                        results {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imACountry2',
                companies: {
                  createAndAdd: [
                    {
                      name: 'imACompany2',
                      teams: {
                        createAndAdd: {
                          name: 'imATeam2',
                        },
                      },
                    },
                    {
                      name: 'imACompany3',
                      teams: {
                        createAndAdd: {
                          name: 'imATeam3',
                        },
                      },
                    },
                  ],
                },
              },
            },
          });

          expect(result.id).toBeDefined();
          expect(result.name).toEqual('imACountry2');
          expect(result.companies.results.length).toEqual(2);
          expect(
            result.companies.results.some(
              c =>
                c.name === 'imACompany2' &&
                c.teams.results.some(t => t.name === 'imATeam2')
            )
          ).toBeTruthy();
          expect(
            result.companies.results.some(
              c =>
                c.name === 'imACompany3' &&
                c.teams.results.some(t => t.name === 'imATeam3')
            )
          ).toBeTruthy();
        });

        it_only_db('mongo')(
          'should support relation and nested relation on update',
          async () => {
            const company1 = new Parse.Object('Company');
            company1.set('name', 'imACompany1');
            await company1.save();

            const company2 = new Parse.Object('Company');
            company2.set('name', 'imACompany2');
            await company2.save();

            const country = new Parse.Object('Country');
            country.set('name', 'imACountry');
            country.relation('companies').add(company1);
            await country.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const {
              data: { updateCountry: result },
            } = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCountry(
                  $id: ID!
                  $fields: UpdateCountryFieldsInput
                ) {
                  updateCountry(id: $id, fields: $fields) {
                    id
                    companies {
                      results {
                        id
                        name
                      }
                    }
                  }
                }
              `,
              variables: {
                id: country.id,
                fields: {
                  companies: {
                    add: [company2.id],
                    remove: [company1.id],
                    createAndAdd: [
                      {
                        name: 'imACompany3',
                      },
                    ],
                  },
                },
              },
            });

            expect(result.id).toEqual(country.id);
            expect(result.companies.results.length).toEqual(2);
            expect(
              result.companies.results.some(o => o.id === company2.id)
            ).toBeTruthy();
            expect(
              result.companies.results.some(o => o.name === 'imACompany3')
            ).toBeTruthy();
            expect(
              result.companies.results.some(o => o.id === company1.id)
            ).toBeFalsy();
          }
        );

        it_only_db('mongo')(
          'should support nested relation on create with filter',
          async () => {
            const company = new Parse.Object('Company');
            company.set('name', 'imACompany1');
            await company.save();

            const country = new Parse.Object('Country');
            country.set('name', 'imACountry');
            country.relation('companies').add(company);
            await country.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const {
              data: { createCountry: result },
            } = await apolloClient.mutate({
              mutation: gql`
                mutation CreateCountry(
                  $fields: CreateCountryFieldsInput
                  $where: CompanyWhereInput
                ) {
                  createCountry(fields: $fields) {
                    id
                    name
                    companies(where: $where) {
                      results {
                        id
                        name
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  name: {
                    equalTo: 'imACompany2',
                  },
                },
                fields: {
                  name: 'imACountry2',
                  companies: {
                    add: [company.id],
                    createAndAdd: [
                      {
                        name: 'imACompany2',
                      },
                      {
                        name: 'imACompany3',
                      },
                    ],
                  },
                },
              },
            });

            expect(result.id).toBeDefined();
            expect(result.name).toEqual('imACountry2');
            expect(result.companies.results.length).toEqual(1);
            expect(
              result.companies.results.some(o => o.name === 'imACompany2')
            ).toBeTruthy();
          }
        );

        it_only_db('mongo')('should support relation on query', async () => {
          const company1 = new Parse.Object('Company');
          company1.set('name', 'imACompany1');
          await company1.save();

          const company2 = new Parse.Object('Company');
          company2.set('name', 'imACompany2');
          await company2.save();

          const country = new Parse.Object('Country');
          country.set('name', 'imACountry');
          country.relation('companies').add([company1, company2]);
          await country.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          // Without where
          const {
            data: { country: result1 },
          } = await apolloClient.query({
            query: gql`
              query getCountry($id: ID!) {
                country(id: $id) {
                  id
                  companies {
                    results {
                      id
                      name
                    }
                    count
                  }
                }
              }
            `,
            variables: {
              id: country.id,
            },
          });

          expect(result1.id).toEqual(country.id);
          expect(result1.companies.results.length).toEqual(2);
          expect(
            result1.companies.results.some(o => o.id === company1.id)
          ).toBeTruthy();
          expect(
            result1.companies.results.some(o => o.id === company2.id)
          ).toBeTruthy();

          // With where
          const {
            data: { country: result2 },
          } = await apolloClient.query({
            query: gql`
              query getCountry($id: ID!, $where: CompanyWhereInput) {
                country(id: $id) {
                  id
                  companies(where: $where) {
                    results {
                      id
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              id: country.id,
              where: {
                name: { equalTo: 'imACompany1' },
              },
            },
          });
          expect(result2.id).toEqual(country.id);
          expect(result2.companies.results.length).toEqual(1);
          expect(result2.companies.results[0].id).toEqual(company1.id);
        });

        it('should support files', async () => {
          try {
            parseServer = await global.reconfigureServer({
              publicServerURL: 'http://localhost:13377/parse',
            });

            const body = new FormData();
            body.append(
              'operations',
              JSON.stringify({
                query: `
                  mutation CreateFile($upload: Upload!) {
                    createFile(upload: $upload) {
                      name
                      url
                    }
                  }
                `,
                variables: {
                  upload: null,
                },
              })
            );
            body.append('map', JSON.stringify({ 1: ['variables.upload'] }));
            body.append('1', 'My File Content', {
              filename: 'myFileName.txt',
              contentType: 'text/plain',
            });

            let res = await fetch('http://localhost:13377/graphql', {
              method: 'POST',
              headers,
              body,
            });

            expect(res.status).toEqual(200);

            const result = JSON.parse(await res.text());

            expect(result.data.createFile.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result.data.createFile.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );

            const someFieldValue = result.data.createFile.name;

            await apolloClient.mutate({
              mutation: gql`
                mutation CreaClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addFiles: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject(
                  $fields1: CreateSomeClassFieldsInput
                  $fields2: CreateSomeClassFieldsInput
                ) {
                  createSomeClass1: createSomeClass(fields: $fields1) {
                    id
                  }
                  createSomeClass2: createSomeClass(fields: $fields2) {
                    id
                  }
                }
              `,
              variables: {
                fields1: {
                  someField: someFieldValue,
                },
                fields2: {
                  someField: someFieldValue.name,
                },
              },
            });

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('File');

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someField {
                      name
                      url
                    }
                  }
                  findSomeClass1: someClasses(
                    where: { someField: { exists: true } }
                  ) {
                    results {
                      someField {
                        name
                        url
                      }
                    }
                  }
                  findSomeClass2: someClasses(
                    where: { someField: { exists: true } }
                  ) {
                    results {
                      someField {
                        name
                        url
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass1.id,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('object');
            expect(getResult.data.someClass.someField.name).toEqual(
              result.data.createFile.name
            );
            expect(getResult.data.someClass.someField.url).toEqual(
              result.data.createFile.url
            );
            expect(getResult.data.findSomeClass1.results.length).toEqual(1);
            expect(getResult.data.findSomeClass2.results.length).toEqual(1);

            res = await fetch(getResult.data.someClass.someField.url);

            expect(res.status).toEqual(200);
            expect(await res.text()).toEqual('My File Content');
          } catch (e) {
            handleError(e);
          }
        });

        it('should support object values', async () => {
          try {
            const someFieldValue = {
              foo: { bar: 'baz' },
              number: 10,
            };

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addObjects: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Object');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const where = {
              someField: {
                equalTo: { key: 'foo.bar', value: 'baz' },
                notEqualTo: { key: 'foo.bar', value: 'bat' },
                greaterThan: { key: 'number', value: 9 },
                lessThan: { key: 'number', value: 11 },
              },
            };
            const queryResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $where: SomeClassWhereInput) {
                  someClass(id: $id) {
                    id
                    someField
                  }
                  someClasses(where: $where) {
                    results {
                      id
                      someField
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
                where,
              },
            });

            const { someClass: getResult, someClasses } = queryResult.data;

            const { someField } = getResult;
            expect(typeof someField).toEqual('object');
            expect(someField).toEqual(someFieldValue);

            // Checks class query results
            expect(someClasses.results.length).toEqual(1);
            expect(someClasses.results[0].someField).toEqual(someFieldValue);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support object composed queries', async () => {
          try {
            const someFieldValue = {
              lorem: 'ipsum',
              number: 10,
            };
            const someFieldValue2 = {
              foo: {
                test: 'bar',
              },
              number: 10,
            };

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass {
                  createClass(
                    name: "SomeClass"
                    schemaFields: { addObjects: [{ name: "someField" }] }
                  ) {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject(
                  $fields1: CreateSomeClassFieldsInput
                  $fields2: CreateSomeClassFieldsInput
                ) {
                  create1: createSomeClass(fields: $fields1) {
                    id
                  }
                  create2: createSomeClass(fields: $fields2) {
                    id
                  }
                }
              `,
              variables: {
                fields1: {
                  someField: someFieldValue,
                },
                fields2: {
                  someField: someFieldValue2,
                },
              },
            });

            const where = {
              AND: [
                {
                  someField: {
                    greaterThan: { key: 'number', value: 9 },
                  },
                },
                {
                  someField: {
                    lessThan: { key: 'number', value: 11 },
                  },
                },
                {
                  OR: [
                    {
                      someField: {
                        equalTo: { key: 'lorem', value: 'ipsum' },
                      },
                    },
                    {
                      someField: {
                        equalTo: { key: 'foo.test', value: 'bar' },
                      },
                    },
                  ],
                },
              ],
            };
            const findResult = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: SomeClassWhereInput) {
                  someClasses(where: $where) {
                    results {
                      id
                      someField
                    }
                  }
                }
              `,
              variables: {
                where,
              },
            });

            const { create1, create2 } = createResult.data;
            const { someClasses } = findResult.data;

            // Checks class query results
            const { results } = someClasses;
            expect(results.length).toEqual(2);
            expect(
              results.find(result => result.id === create1.id).someField
            ).toEqual(someFieldValue);
            expect(
              results.find(result => result.id === create2.id).someField
            ).toEqual(someFieldValue2);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support array values', async () => {
          try {
            const someFieldValue = [
              1,
              'foo',
              ['bar'],
              { lorem: 'ipsum' },
              true,
            ];

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addArrays: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Array');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someField {
                      ... on Element {
                        value
                      }
                    }
                  }
                  someClasses(where: { someField: { exists: true } }) {
                    results {
                      id
                      someField {
                        ... on Element {
                          value
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
              },
            });

            const { someField } = getResult.data.someClass;
            expect(Array.isArray(someField)).toBeTruthy();
            expect(someField.map(element => element.value)).toEqual(
              someFieldValue
            );
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support undefined array', async () => {
          const schema = await new Parse.Schema('SomeClass');
          schema.addArray('someArray');
          await schema.save();

          const obj = new Parse.Object('SomeClass');
          await obj.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                someClass(id: $id) {
                  id
                  someArray {
                    ... on Element {
                      value
                    }
                  }
                }
              }
            `,
            variables: {
              id: obj.id,
            },
          });
          expect(getResult.data.someClass.someArray).toEqual(null);
        });

        it('should support null values', async () => {
          try {
            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass {
                  createClass(
                    name: "SomeClass"
                    schemaFields: {
                      addStrings: [
                        { name: "someStringField" }
                        { name: "someNullField" }
                      ]
                      addNumbers: [{ name: "someNumberField" }]
                      addBooleans: [{ name: "someBooleanField" }]
                      addObjects: [{ name: "someObjectField" }]
                    }
                  ) {
                    name
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someStringField: 'some string',
                  someNumberField: 123,
                  someBooleanField: true,
                  someObjectField: { someField: 'some value' },
                  someNullField: null,
                },
              },
            });

            await apolloClient.mutate({
              mutation: gql`
                mutation UpdateSomeObject(
                  $id: ID!
                  $fields: UpdateSomeClassFieldsInput
                ) {
                  updateSomeClass(id: $id, fields: $fields) {
                    updatedAt
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
                fields: {
                  someStringField: null,
                  someNumberField: null,
                  someBooleanField: null,
                  someObjectField: null,
                  someNullField: 'now it has a string',
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someStringField
                    someNumberField
                    someBooleanField
                    someObjectField
                    someNullField
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
              },
            });

            expect(getResult.data.someClass.someStringField).toBeFalsy();
            expect(getResult.data.someClass.someNumberField).toBeFalsy();
            expect(getResult.data.someClass.someBooleanField).toBeFalsy();
            expect(getResult.data.someClass.someObjectField).toBeFalsy();
            expect(getResult.data.someClass.someNullField).toEqual(
              'now it has a string'
            );
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Bytes', async () => {
          try {
            const someFieldValue = 'aGVsbG8gd29ybGQ=';

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addBytes: [{ name: 'someField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('Bytes');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject(
                  $fields1: CreateSomeClassFieldsInput
                  $fields2: CreateSomeClassFieldsInput
                ) {
                  createSomeClass1: createSomeClass(fields: $fields1) {
                    id
                  }
                  createSomeClass2: createSomeClass(fields: $fields2) {
                    id
                  }
                }
              `,
              variables: {
                fields1: {
                  someField: someFieldValue,
                },
                fields2: {
                  someField: someFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!, $someFieldValue: Bytes) {
                  someClass(id: $id) {
                    someField
                  }
                  someClasses(
                    where: { someField: { equalTo: $someFieldValue } }
                  ) {
                    results {
                      id
                      someField
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass1.id,
                someFieldValue,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('string');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.results.length).toEqual(2);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Geo Points', async () => {
          try {
            const someFieldValue = {
              __typename: 'GeoPoint',
              latitude: 45,
              longitude: 45,
            };

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addGeoPoint: { name: 'someField' },
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.someField.type).toEqual('GeoPoint');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  someField: {
                    latitude: someFieldValue.latitude,
                    longitude: someFieldValue.longitude,
                  },
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    someField {
                      latitude
                      longitude
                    }
                  }
                  someClasses(where: { someField: { exists: true } }) {
                    results {
                      id
                      someField {
                        latitude
                        longitude
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
              },
            });

            expect(typeof getResult.data.someClass.someField).toEqual('object');
            expect(getResult.data.someClass.someField).toEqual(someFieldValue);
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it('should support Polygons', async () => {
          try {
            const somePolygonFieldValue = [
              [44, 45],
              [46, 47],
              [48, 49],
              [44, 45],
            ].map(point => ({
              latitude: point[0],
              longitude: point[1],
            }));

            await apolloClient.mutate({
              mutation: gql`
                mutation CreateClass($schemaFields: SchemaFieldsInput) {
                  createClass(name: "SomeClass", schemaFields: $schemaFields) {
                    name
                  }
                }
              `,
              variables: {
                schemaFields: {
                  addPolygons: [{ name: 'somePolygonField' }],
                },
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const schema = await new Parse.Schema('SomeClass').get();
            expect(schema.fields.somePolygonField.type).toEqual('Polygon');

            const createResult = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                  createSomeClass(fields: $fields) {
                    id
                  }
                }
              `,
              variables: {
                fields: {
                  somePolygonField: somePolygonFieldValue,
                },
              },
            });

            const getResult = await apolloClient.query({
              query: gql`
                query GetSomeObject($id: ID!) {
                  someClass(id: $id) {
                    somePolygonField {
                      latitude
                      longitude
                    }
                  }
                  someClasses(where: { somePolygonField: { exists: true } }) {
                    results {
                      id
                      somePolygonField {
                        latitude
                        longitude
                      }
                    }
                  }
                }
              `,
              variables: {
                id: createResult.data.createSomeClass.id,
              },
            });

            expect(typeof getResult.data.someClass.somePolygonField).toEqual(
              'object'
            );
            expect(getResult.data.someClass.somePolygonField).toEqual(
              somePolygonFieldValue.map(geoPoint => ({
                ...geoPoint,
                __typename: 'GeoPoint',
              }))
            );
            expect(getResult.data.someClasses.results.length).toEqual(1);
          } catch (e) {
            handleError(e);
          }
        });

        it_only_db('mongo')('should support bytes values', async () => {
          const SomeClass = Parse.Object.extend('SomeClass');
          const someClass = new SomeClass();
          someClass.set('someField', {
            __type: 'Bytes',
            base64: 'foo',
          });
          await someClass.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();
          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('Bytes');

          const someFieldValue = {
            __type: 'Bytes',
            base64: 'bytesContent',
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  id
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                someClass(id: $id) {
                  someField
                }
              }
            `,
            variables: {
              id: createResult.data.createSomeClass.id,
            },
          });

          expect(getResult.data.someClass.someField).toEqual(
            someFieldValue.base64
          );

          const updatedSomeFieldValue = {
            __type: 'Bytes',
            base64: 'newBytesContent',
          };

          const updatedResult = await apolloClient.mutate({
            mutation: gql`
              mutation UpdateSomeObject(
                $id: ID!
                $fields: UpdateSomeClassFieldsInput
              ) {
                updateSomeClass(id: $id, fields: $fields) {
                  updatedAt
                }
              }
            `,
            variables: {
              id: createResult.data.createSomeClass.id,
              fields: {
                someField: updatedSomeFieldValue,
              },
            },
          });

          const { updatedAt } = updatedResult.data.updateSomeClass;
          expect(updatedAt).toBeDefined();

          const findResult = await apolloClient.query({
            query: gql`
              query FindSomeObject($where: SomeClassWhereInput!) {
                someClasses(where: $where) {
                  results {
                    id
                  }
                }
              }
            `,
            variables: {
              where: {
                someField: {
                  equalTo: updatedSomeFieldValue.base64,
                },
              },
            },
          });
          const findResults = findResult.data.someClasses.results;
          expect(findResults.length).toBe(1);
          expect(findResults[0].id).toBe(createResult.data.createSomeClass.id);
        });
      });

      describe('Special Classes', () => {
        it('should support User class', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: user(id: $id) {
                  id
                }
              }
            `,
            variables: {
              id: user.id,
            },
          });

          expect(getResult.data.get.id).toEqual(user.id);
        });

        it('should support Installation class', async () => {
          const installation = new Parse.Installation();
          await installation.save({
            deviceType: 'foo',
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: installation(id: $id) {
                  id
                }
              }
            `,
            variables: {
              id: installation.id,
            },
          });

          expect(getResult.data.get.id).toEqual(installation.id);
        });

        it('should support Role class', async () => {
          const roleACL = new Parse.ACL();
          roleACL.setPublicReadAccess(true);
          const role = new Parse.Role('MyRole', roleACL);
          await role.save();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: role(id: $id) {
                  id
                }
              }
            `,
            variables: {
              id: role.id,
            },
          });

          expect(getResult.data.get.id).toEqual(role.id);
        });

        it('should support Session class', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const session = await Parse.Session.current();
          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: session(id: $id) {
                  id
                }
              }
            `,
            variables: {
              id: session.id,
            },
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          expect(getResult.data.get.id).toEqual(session.id);
        });

        it('should support Product class', async () => {
          const Product = Parse.Object.extend('_Product');
          const product = new Product();
          await product.save(
            {
              productIdentifier: 'foo',
              icon: new Parse.File('icon', ['foo']),
              order: 1,
              title: 'Foo',
              subtitle: 'My product',
            },
            { useMasterKey: true }
          );

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($id: ID!) {
                get: product(id: $id) {
                  id
                }
              }
            `,
            variables: {
              id: product.id,
            },
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          expect(getResult.data.get.id).toEqual(product.id);
        });
      });
    });
  });

  describe('Custom API', () => {
    let httpServer;
    const headers = {
      'X-Parse-Application-Id': 'test',
      'X-Parse-Javascript-Key': 'test',
    };
    let apolloClient;

    beforeAll(async () => {
      const expressApp = express();
      httpServer = http.createServer(expressApp);
      parseGraphQLServer = new ParseGraphQLServer(parseServer, {
        graphQLPath: '/graphql',
        graphQLCustomTypeDefs: gql`
          extend type Query {
            hello: String @resolve
            hello2: String @resolve(to: "hello")
            userEcho(user: CreateUserFieldsInput!): User! @resolve
            hello3: String! @mock(with: "Hello world!")
            hello4: User! @mock(with: { username: "somefolk" })
          }
        `,
      });
      parseGraphQLServer.applyGraphQL(expressApp);
      await new Promise(resolve => httpServer.listen({ port: 13377 }, resolve));
      const httpLink = createUploadLink({
        uri: 'http://localhost:13377/graphql',
        fetch,
        headers,
      });
      apolloClient = new ApolloClient({
        link: httpLink,
        cache: new InMemoryCache(),
        defaultOptions: {
          query: {
            fetchPolicy: 'no-cache',
          },
        },
      });
    });

    afterAll(async () => {
      await httpServer.close();
    });

    it('can resolve a custom query using default function name', async () => {
      Parse.Cloud.define('hello', async () => {
        return 'Hello world!';
      });

      const result = await apolloClient.query({
        query: gql`
          query Hello {
            hello
          }
        `,
      });

      expect(result.data.hello).toEqual('Hello world!');
    });

    it('can resolve a custom query using function name set by "to" argument', async () => {
      Parse.Cloud.define('hello', async () => {
        return 'Hello world!';
      });

      const result = await apolloClient.query({
        query: gql`
          query Hello {
            hello2
          }
        `,
      });

      expect(result.data.hello2).toEqual('Hello world!');
    });

    it('should resolve auto types', async () => {
      Parse.Cloud.define('userEcho', async req => {
        return req.params.user;
      });

      const result = await apolloClient.query({
        query: gql`
          query UserEcho($user: CreateUserFieldsInput!) {
            userEcho(user: $user) {
              username
            }
          }
        `,
        variables: {
          user: {
            username: 'somefolk',
          },
        },
      });

      expect(result.data.userEcho.username).toEqual('somefolk');
    });

    it('can mock a custom query with string', async () => {
      const result = await apolloClient.query({
        query: gql`
          query Hello {
            hello3
          }
        `,
      });

      expect(result.data.hello3).toEqual('Hello world!');
    });

    it('can mock a custom query with auto type', async () => {
      const result = await apolloClient.query({
        query: gql`
          query Hello {
            hello4 {
              username
            }
          }
        `,
      });

      expect(result.data.hello4.username).toEqual('somefolk');
    });
  });
});
