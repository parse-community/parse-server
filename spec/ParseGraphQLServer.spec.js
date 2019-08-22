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
        const health = (await apolloClient.query({
          query: gql`
            query Health {
              health
            }
          `,
        })).data.health;
        expect(health).toBeTruthy();
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

        it('should have CreateResult object type', async () => {
          const createResultType = (await apolloClient.query({
            query: gql`
              query CreateResultType {
                __type(name: "CreateResult") {
                  kind
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          expect(createResultType.kind).toEqual('OBJECT');
          expect(
            createResultType.fields.map(field => field.name).sort()
          ).toEqual(['createdAt', 'objectId']);
        });

        it('should have UpdateResult object type', async () => {
          const updateResultType = (await apolloClient.query({
            query: gql`
              query UpdateResultType {
                __type(name: "UpdateResult") {
                  kind
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'];
          expect(updateResultType.kind).toEqual('OBJECT');
          expect(updateResultType.fields.map(field => field.name)).toEqual([
            'updatedAt',
          ]);
        });

        it('should have Class interface type', async () => {
          const classType = (await apolloClient.query({
            query: gql`
              query ClassType {
                __type(name: "Class") {
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
            'objectId',
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
            'Class',
            'CreateResult',
            'Date',
            'FileInfo',
            'FindResult',
            'ReadPreference',
            'UpdateResult',
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
                query GetSuperCar($objectId: ID!) {
                  superCar(objectId: $objectId) {
                    objectId
                  }
                }
              `,
              variables: {
                objectId: superCar.id,
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
                query GetSuperCar($objectId: ID!) {
                  superCar(objectId: $objectId) {
                    objectId
                  }
                }
              `,
              variables: {
                objectId: superCar.id,
              },
            })
          ).toBeRejected();
          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetCustomer($objectId: ID!) {
                  customer(objectId: $objectId) {
                    objectId
                  }
                }
              `,
              variables: {
                objectId: customer.id,
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
                mutation UpdateSuperCar($objectId: ID!, $foo: String!) {
                  updateSuperCar(objectId: $objectId, fields: { foo: $foo }) {
                    updatedAt
                  }
                }
              `,
              variables: {
                objectId: superCar1.id,
                foo: 'lah',
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteCustomer($objectId: ID!) {
                  deleteCustomer(objectId: $objectId) {
                    objectId
                  }
                }
              `,
              variables: {
                objectId: customer1.id,
              },
            })
          ).toBeResolved();

          const { data: customerData } = await apolloClient.query({
            query: gql`
              mutation CreateCustomer($foo: String!) {
                createCustomer(fields: { foo: $foo }) {
                  objectId
                }
              }
            `,
            variables: {
              foo: 'rah',
            },
          });
          expect(customerData.createCustomer).toBeTruthy();

          // used later
          const customer2Id = customerData.createCustomer.objectId;

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
                  objectId
                }
              }
            `,
            variables: {
              foo: 'mah',
            },
          });
          expect(superCarData.createSuperCar).toBeTruthy();
          const superCar3Id = superCarData.createSuperCar.objectId;

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation UpdateSupercar($objectId: ID!, $foo: String!) {
                  updateSuperCar(objectId: $objectId, fields: { foo: $foo }) {
                    updatedAt
                  }
                }
              `,
              variables: {
                objectId: superCar3Id,
              },
            })
          ).toBeRejected();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteSuperCar($objectId: ID!) {
                  deleteSuperCar(objectId: $objectId) {
                    objectId
                  }
                }
              `,
              variables: {
                objectId: superCar3Id,
              },
            })
          ).toBeResolved();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation CreateCustomer($foo: String!) {
                  createCustomer(fields: { foo: $foo }) {
                    objectId
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
                mutation UpdateCustomer($objectId: ID!, $foo: String!) {
                  updateCustomer(objectId: $objectId, fields: { foo: $foo }) {
                    updatedAt
                  }
                }
              `,
              variables: {
                objectId: customer2Id,
                foo: 'tah',
              },
            })
          ).toBeResolved();
          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation DeleteCustomer($objectId: ID!, $foo: String!) {
                  deleteCustomer(objectId: $objectId)
                }
              `,
              variables: {
                objectId: customer2Id,
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
                    objectId
                  }
                }
              `,
            })
          ).toBeRejected();
          const { objectId: superCarId } = (await apolloClient.query({
            query: gql`
              mutation ValidCreateSuperCar {
                createSuperCar(
                  fields: { engine: "diesel", doors: 5, price: "£10000" }
                ) {
                  objectId
                }
              }
            `,
          })).data.createSuperCar;

          expect(superCarId).toBeTruthy();

          await expectAsync(
            apolloClient.query({
              query: gql`
                mutation InvalidUpdateSuperCar($objectId: ID!) {
                  updateSuperCar(
                    objectId: $objectId
                    fields: { engine: "petrol" }
                  ) {
                    updatedAt
                  }
                }
              `,
              variables: {
                objectId: superCarId,
              },
            })
          ).toBeRejected();

          const updatedSuperCar = (await apolloClient.query({
            query: gql`
              mutation ValidUpdateSuperCar($objectId: ID!) {
                updateSuperCar(objectId: $objectId, fields: { mileage: 2000 }) {
                  updatedAt
                }
              }
            `,
            variables: {
              objectId: superCarId,
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
                query GetSuperCar($objectId: ID!) {
                  superCar(objectId: $objectId) {
                    objectId
                    engine
                    doors
                    price
                    mileage
                    insuranceCertificate
                  }
                }
              `,
              variables: {
                objectId: superCar.id,
              },
            })
          ).toBeRejected();
          let getSuperCar = (await apolloClient.query({
            query: gql`
              query GetSuperCar($objectId: ID!) {
                superCar(objectId: $objectId) {
                  objectId
                  engine
                  doors
                  price
                  mileage
                }
              }
            `,
            variables: {
              objectId: superCar.id,
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
                query GetSuperCar($objectId: ID!) {
                  superCar(objectId: $objectId) {
                    engine
                  }
                }
              `,
              variables: {
                objectId: superCar.id,
              },
            })
          ).toBeRejected();
          getSuperCar = (await apolloClient.query({
            query: gql`
              query GetSuperCar($objectId: ID!) {
                superCar(objectId: $objectId) {
                  objectId
                }
              }
            `,
            variables: {
              objectId: superCar.id,
            },
          })).data.superCar;
          expect(getSuperCar.objectId).toBe(superCar.id);
        });
        it('should only allow the supplied constraint fields for a class', async () => {
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
                    where: { insuranceCertificate: { _eq: "private-file.pdf" } }
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
                  superCars(where: { mileage: { _eq: 0 } }) {
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
                  superCars(where: { engine: { _eq: "petrol" } }) {
                    count
                  }
                }
              `,
            })
          ).toBeResolved();
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
                      objectId
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
                      objectId
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
                      objectId
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
                      objectId
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
                      objectId
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
                      objectId
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
                      objectId
                    }
                  }
                }
              `,
            })
          ).toBeResolved();
        });
      });

      describe('Objects Queries', () => {
        describe('Get', () => {
          it('should return a class object using generic query', async () => {
            const obj = new Parse.Object('SomeClass');
            obj.set('someField', 'someValue');
            await obj.save();

            const result = (await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  get(className: "SomeClass", objectId: $objectId)
                }
              `,
              variables: {
                objectId: obj.id,
              },
            })).data.get;

            expect(result.objectId).toEqual(obj.id);
            expect(result.someField).toEqual('someValue');
            expect(new Date(result.createdAt)).toEqual(obj.createdAt);
            expect(new Date(result.updatedAt)).toEqual(obj.updatedAt);
          });

          it('should return a class object using class specific query', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField', 'someValue');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = (await apolloClient.query({
              query: gql`
                query GetCustomer($objectId: ID!) {
                  customer(objectId: $objectId) {
                    objectId
                    someField
                    createdAt
                    updatedAt
                  }
                }
              `,
              variables: {
                objectId: obj.id,
              },
            })).data.customer;

            expect(result.objectId).toEqual(obj.id);
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
                  query GetCustomer($objectId: ID!) {
                    customer(objectId: $objectId) {
                      objectId
                      manyRelations {
                        ... on Customer {
                          objectId
                          someCustomerField
                          arrayField {
                            ... on Element {
                              value
                            }
                          }
                        }
                        ... on SomeClass {
                          objectId
                          someClassField
                        }
                      }
                      createdAt
                      updatedAt
                    }
                  }
                `,
                variables: {
                  objectId: obj3.id,
                },
              })).data.customer;

              expect(result.objectId).toEqual(obj3.id);
              expect(result.manyRelations.length).toEqual(2);

              const customerSubObject = result.manyRelations.find(
                o => o.objectId === obj1.id
              );
              const someClassSubObject = result.manyRelations.find(
                o => o.objectId === obj2.id
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
                  query DeepComplexGraphQLQuery($objectId: ID!) {
                    country(objectId: $objectId) {
                      objectId
                      name
                      companies {
                        ... on Company {
                          objectId
                          name
                          employees {
                            ... on Employee {
                              objectId
                              name
                            }
                          }
                          teams {
                            ... on Team {
                              objectId
                              name
                              employees {
                                ... on Employee {
                                  objectId
                                  name
                                  country {
                                    objectId
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
                  objectId: obj4.id,
                },
              })).data.country;

              const expectedResult = {
                objectId: obj4.id,
                name: 'imACountry',
                __typename: 'Country',
                companies: [
                  {
                    objectId: obj3.id,
                    name: 'imACompany',
                    __typename: 'Company',
                    employees: [
                      {
                        objectId: obj1.id,
                        name: 'imAnEmployee',
                        __typename: 'Employee',
                      },
                    ],
                    teams: [
                      {
                        objectId: obj2.id,
                        name: 'imATeam',
                        __typename: 'Team',
                        employees: [
                          {
                            objectId: obj1.id,
                            name: 'imAnEmployee',
                            __typename: 'Employee',
                            country: {
                              objectId: obj4.id,
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

            async function getObject(className, objectId, headers) {
              const specificQueryResult = await apolloClient.query({
                query: gql`
                  query GetSomeObject($objectId: ID!) {
                    ${className.charAt(0).toLowerCase() +
                      className.slice(1)}(objectId: $objectId) {
                      objectId
                      createdAt
                    }
                  }
                `,
                variables: {
                  objectId,
                },
                context: {
                  headers,
                },
              });

              const genericQueryResult = await apolloClient.query({
                query: gql`
                  query GetSomeObject($className: String!, $objectId: ID!) {
                    get(className: $className, objectId: $objectId)
                  }
                `,
                variables: {
                  className,
                  objectId,
                },
                context: {
                  headers,
                },
              });

              expect(genericQueryResult.objectId).toEqual(
                specificQueryResult.objectId
              );
              expect(genericQueryResult.createdAt).toEqual(
                specificQueryResult.createdAt
              );
              return genericQueryResult;
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

          it('should not bring session token of another user', async () => {
            await prepareData();

            const result = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  get(className: "_User", objectId: $objectId)
                }
              `,
              variables: {
                objectId: user2.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });
            expect(result.data.get.sessionToken).toBeUndefined();
          });

          it('should not bring session token of current user', async () => {
            await prepareData();

            const result = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  get(className: "_User", objectId: $objectId)
                }
              `,
              variables: {
                objectId: user1.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });
            expect(result.data.get.sessionToken).toBeUndefined();
          });

          it('should support keys argument', async () => {
            await prepareData();

            const result1 = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  get(
                    className: "GraphQLClass"
                    objectId: $objectId
                    keys: "someField"
                  )
                }
              `,
              variables: {
                objectId: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  get(
                    className: "GraphQLClass"
                    objectId: $objectId
                    keys: "someField,pointerToUser"
                  )
                }
              `,
              variables: {
                objectId: object3.id,
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
                query GetSomeObject($objectId: ID!) {
                  get(className: "GraphQLClass", objectId: $objectId)
                }
              `,
              variables: {
                objectId: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  get(
                    className: "GraphQLClass"
                    objectId: $objectId
                    include: "pointerToUser"
                  )
                  graphQLClass(objectId: $objectId) {
                    pointerToUser {
                      username
                    }
                  }
                }
              `,
              variables: {
                objectId: object3.id,
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            expect(result1.data.get.pointerToUser.username).toBeUndefined();
            expect(result2.data.get.pointerToUser.username).toBeDefined();
            expect(
              result2.data.graphQLClass.pointerToUser.username
            ).toBeDefined();
          });

          describe_only_db('mongo')('read preferences', () => {
            it('should read from primary by default', async () => {
              await prepareData();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($objectId: ID!) {
                    get(
                      className: "GraphQLClass"
                      objectId: $objectId
                      include: "pointerToUser"
                    )
                  }
                `,
                variables: {
                  objectId: object3.id,
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

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($objectId: ID!) {
                    get(
                      className: "GraphQLClass"
                      objectId: $objectId
                      include: "pointerToUser"
                      readPreference: SECONDARY
                    )
                  }
                `,
                variables: {
                  objectId: object3.id,
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

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query GetSomeObject($objectId: ID!) {
                    get(
                      className: "GraphQLClass"
                      objectId: $objectId
                      include: "pointerToUser"
                      readPreference: SECONDARY
                      includeReadPreference: NEAREST
                    )
                  }
                `,
                variables: {
                  objectId: object3.id,
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
          it('should return class objects using generic query', async () => {
            const obj1 = new Parse.Object('SomeClass');
            obj1.set('someField', 'someValue1');
            await obj1.save();
            const obj2 = new Parse.Object('SomeClass');
            obj2.set('someField', 'someValue1');
            await obj2.save();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects {
                  find(className: "SomeClass") {
                    results
                  }
                }
              `,
            });

            expect(result.data.find.results.length).toEqual(2);

            result.data.find.results.forEach(resultObj => {
              const obj = resultObj.objectId === obj1.id ? obj1 : obj2;
              expect(resultObj.objectId).toEqual(obj.id);
              expect(resultObj.someField).toEqual(obj.get('someField'));
              expect(new Date(resultObj.createdAt)).toEqual(obj.createdAt);
              expect(new Date(resultObj.updatedAt)).toEqual(obj.updatedAt);
            });
          });

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
                      objectId
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
              const obj = resultObj.objectId === obj1.id ? obj1 : obj2;
              expect(resultObj.objectId).toEqual(obj.id);
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
                  query FindSomeObjects($className: String!) {
                    find(className: $className) {
                      results
                    }
                    ${graphqlClassName} {
                      results {
                        objectId
                        someField
                      }
                    }
                  }
                `,
                variables: {
                  className,
                },
                context: {
                  headers,
                },
              });

              const genericFindResults = result.data.find.results;
              const specificFindResults = result.data[graphqlClassName].results;
              genericFindResults.forEach(({ objectId, someField }) => {
                expect(
                  specificFindResults.some(
                    ({
                      objectId: specificObjectId,
                      someField: specificSomeField,
                    }) =>
                      objectId === specificObjectId &&
                      someField === specificSomeField
                  )
                );
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

          it('should support where argument using generic query', async () => {
            await prepareData();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: Object) {
                  find(className: "GraphQLClass", where: $where) {
                    results
                  }
                }
              `,
              variables: {
                where: {
                  someField: {
                    $in: ['someValue1', 'someValue2', 'someValue3'],
                  },
                  $or: [
                    {
                      pointerToUser: {
                        __type: 'Pointer',
                        className: '_User',
                        objectId: user5.id,
                      },
                    },
                    {
                      objectId: object1.id,
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
              result.data.find.results.map(object => object.someField).sort()
            ).toEqual(['someValue1', 'someValue3']);
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
                    _in: ['someValue1', 'someValue2', 'someValue3'],
                  },
                  _or: [
                    {
                      pointerToUser: {
                        _eq: {
                          __type: 'Pointer',
                          className: '_User',
                          objectId: user5.id,
                        },
                      },
                    },
                    {
                      objectId: {
                        _eq: object1.id,
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

          it('should support _or operation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query {
                  graphQLClasses(
                    where: {
                      _or: [
                        { someField: { _eq: "someValue1" } }
                        { someField: { _eq: "someValue2" } }
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
                  $className: String!
                  $where: Object
                  $whereCustom: SomeClassWhereInput
                  $order: String
                  $orderCustom: [SomeClassOrder!]
                  $skip: Int
                  $limit: Int
                ) {
                  find(
                    className: $className
                    where: $where
                    order: $order
                    skip: $skip
                    limit: $limit
                  ) {
                    results
                  }
                  someClasses(
                    where: $whereCustom
                    order: $orderCustom
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
                className: 'SomeClass',
                where: {
                  someField: {
                    $regex: '^someValue',
                  },
                },
                whereCustom: {
                  someField: {
                    _regex: '^someValue',
                  },
                },
                order: '-numberField,someField',
                orderCustom: ['numberField_DESC', 'someField_ASC'],
                skip: 4,
                limit: 2,
              },
            });

            expect(result.data.find.results.map(obj => obj.someField)).toEqual([
              'someValue14',
              'someValue17',
            ]);
            expect(
              result.data.someClasses.results.map(obj => obj.someField)
            ).toEqual(['someValue14', 'someValue17']);
          });

          it('should support count', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const where = {
              someField: {
                _in: ['someValue1', 'someValue2', 'someValue3'],
              },
              _or: [
                {
                  pointerToUser: {
                    _eq: {
                      __type: 'Pointer',
                      className: '_User',
                      objectId: user5.id,
                    },
                  },
                },
                {
                  objectId: {
                    _eq: object1.id,
                  },
                },
              ],
            };

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects(
                  $where1: Object
                  $where2: GraphQLClassWhereInput
                  $limit: Int
                ) {
                  find(
                    className: "GraphQLClass"
                    where: $where1
                    limit: $limit
                  ) {
                    results
                    count
                  }
                  graphQLClasses(where: $where2, limit: $limit) {
                    results {
                      objectId
                    }
                    count
                  }
                }
              `,
              variables: {
                where1: where,
                where2: where,
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
            expect(result.data.graphQLClasses.results).toEqual([]);
            expect(result.data.graphQLClasses.count).toEqual(2);
          });

          it('should only count', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const where = {
              someField: {
                _in: ['someValue1', 'someValue2', 'someValue3'],
              },
              _or: [
                {
                  pointerToUser: {
                    _eq: {
                      __type: 'Pointer',
                      className: '_User',
                      objectId: user5.id,
                    },
                  },
                },
                {
                  objectId: {
                    _eq: object1.id,
                  },
                },
              ],
            };

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects(
                  $where1: Object
                  $where2: GraphQLClassWhereInput
                ) {
                  find(className: "GraphQLClass", where: $where1) {
                    count
                  }
                  graphQLClasses(where: $where2) {
                    count
                  }
                }
              `,
              variables: {
                where1: where,
                where2: where,
              },
              context: {
                headers: {
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.find.results).toBeUndefined();
            expect(result.data.find.count).toEqual(2);
            expect(result.data.graphQLClasses.results).toBeUndefined();
            expect(result.data.graphQLClasses.count).toEqual(2);
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
                  find(
                    className: "SomeClass"
                    where: { objectId: { _exists: true } }
                    limit: $limit
                  ) {
                    results
                    count
                  }
                  someClasses(
                    where: { objectId: { _exists: true } }
                    limit: $limit
                  ) {
                    results {
                      objectId
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
            expect(result.data.someClasses.results.length).toEqual(10);
            expect(result.data.someClasses.count).toEqual(100);
          });

          it('should support keys argument', async () => {
            await prepareData();

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: Object) {
                  find(
                    className: "GraphQLClass"
                    where: $where
                    keys: "someField"
                  ) {
                    results
                  }
                }
              `,
              variables: {
                where: {
                  objectId: object3.id,
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
                query FindSomeObject($where: Object) {
                  find(
                    className: "GraphQLClass"
                    where: $where
                    keys: "someField,pointerToUser"
                  ) {
                    results
                  }
                }
              `,
              variables: {
                where: {
                  objectId: object3.id,
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

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: Object) {
                  find(className: "GraphQLClass", where: $where) {
                    results
                  }
                }
              `,
              variables: {
                where: {
                  objectId: object3.id,
                },
              },
              context: {
                headers: {
                  'X-Parse-Session-Token': user1.getSessionToken(),
                },
              },
            });

            const where = {
              objectId: {
                _eq: object3.id,
              },
            };

            const result2 = await apolloClient.query({
              query: gql`
                query FindSomeObject(
                  $where1: Object
                  $where2: GraphQLClassWhereInput
                ) {
                  find(
                    className: "GraphQLClass"
                    where: $where1
                    include: "pointerToUser"
                  ) {
                    results
                  }
                  graphQLClasses(where: $where2) {
                    results {
                      pointerToUser {
                        username
                      }
                    }
                  }
                }
              `,
              variables: {
                where1: where,
                where2: where,
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
            expect(
              result2.data.graphQLClasses.results[0].pointerToUser.username
            ).toBeDefined();
          });

          it('should support includeAll argument', async () => {
            const obj1 = new Parse.Object('SomeClass1');
            obj1.set('someField1', 'someValue1');
            const obj2 = new Parse.Object('SomeClass2');
            obj2.set('someField2', 'someValue2');
            const obj3 = new Parse.Object('SomeClass3');
            obj3.set('obj1', obj1);
            obj3.set('obj2', obj2);
            await Promise.all([obj1.save(), obj2.save(), obj3.save()]);

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject {
                  find(className: "SomeClass3") {
                    results
                  }
                }
              `,
            });

            const result2 = await apolloClient.query({
              query: gql`
                query FindSomeObject {
                  find(className: "SomeClass3", includeAll: true) {
                    results
                  }
                }
              `,
            });

            expect(
              result1.data.find.results[0].obj1.someField1
            ).toBeUndefined();
            expect(
              result1.data.find.results[0].obj2.someField2
            ).toBeUndefined();
            expect(result2.data.find.results[0].obj1.someField1).toEqual(
              'someValue1'
            );
            expect(result2.data.find.results[0].obj2.someField2).toEqual(
              'someValue2'
            );
          });

          describe_only_db('mongo')('read preferences', () => {
            it('should read from primary by default', async () => {
              await prepareData();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find(className: "GraphQLClass", include: "pointerToUser") {
                      results
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

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find(
                      className: "GraphQLClass"
                      include: "pointerToUser"
                      readPreference: SECONDARY
                    ) {
                      results
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

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects {
                    find(
                      className: "GraphQLClass"
                      include: "pointerToUser"
                      readPreference: SECONDARY
                      includeReadPreference: NEAREST
                    ) {
                      results
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
              await prepareData();

              const databaseAdapter =
                parseServer.config.databaseController.adapter;
              spyOn(
                databaseAdapter.database.serverConfig,
                'cursor'
              ).and.callThrough();

              await apolloClient.query({
                query: gql`
                  query FindSomeObjects($where: Object) {
                    find(
                      className: "GraphQLClass"
                      where: $where
                      readPreference: SECONDARY
                      subqueryReadPreference: NEAREST
                    ) {
                      results
                    }
                  }
                `,
                variables: {
                  where: {
                    pointerToUser: {
                      $inQuery: { where: {}, className: '_User' },
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
      });

      describe('Objects Mutations', () => {
        describe('Create', () => {
          it('should return CreateResult object using generic mutation', async () => {
            const result = await apolloClient.mutate({
              mutation: gql`
                mutation CreateSomeObject($fields: Object) {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                    createdAt
                  }
                }
              `,
              variables: {
                fields: {
                  someField: 'someValue',
                },
              },
            });

            expect(result.data.create.objectId).toBeDefined();

            const obj = await new Parse.Query('SomeClass').get(
              result.data.create.objectId
            );

            expect(obj.createdAt).toEqual(
              new Date(result.data.create.createdAt)
            );
            expect(obj.get('someField')).toEqual('someValue');
          });

          it('should return specific type object using class specific mutation', async () => {
            const customerSchema = new Parse.Schema('Customer');
            customerSchema.addString('someField');
            await customerSchema.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation CreateCustomer($fields: CreateCustomerFieldsInput) {
                  createCustomer(fields: $fields) {
                    objectId
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

            expect(result.data.createCustomer.objectId).toBeDefined();
            expect(result.data.createCustomer.someField).toEqual('someValue');

            const customer = await new Parse.Query('Customer').get(
              result.data.createCustomer.objectId
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
                  mutation CreateSomeObject($className: String!) {
                    create(className: $className) {
                      objectId
                      createdAt
                    }
                    create${className} {
                      objectId
                      createdAt
                    }
                  }
                `,
                variables: {
                  className,
                },
                context: {
                  headers,
                },
              });

              const { create } = result.data;
              expect(create.objectId).toBeDefined();
              expect(create.createdAt).toBeDefined();

              const specificCreate = result.data[`create${className}`];
              expect(specificCreate.objectId).toBeDefined();
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
          it('should return UpdateResult object using generic mutation', async () => {
            const obj = new Parse.Object('SomeClass');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateSomeObject($objectId: ID!, $fields: Object) {
                  update(
                    className: "SomeClass"
                    objectId: $objectId
                    fields: $fields
                  ) {
                    updatedAt
                  }
                }
              `,
              variables: {
                objectId: obj.id,
                fields: {
                  someField1: 'someField1Value2',
                },
              },
            });

            expect(result.data.update.updatedAt).toBeDefined();

            await obj.fetch();

            expect(obj.get('someField1')).toEqual('someField1Value2');
            expect(obj.get('someField2')).toEqual('someField2Value1');
          });

          it('should return specific type object using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCustomer(
                  $objectId: ID!
                  $fields: UpdateCustomerFieldsInput
                ) {
                  updateCustomer(objectId: $objectId, fields: $fields) {
                    updatedAt
                    someField1
                    someField2
                  }
                }
              `,
              variables: {
                objectId: obj.id,
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

          it('should return only objectId using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCustomer(
                  $objectId: ID!
                  $fields: UpdateCustomerFieldsInput
                ) {
                  updateCustomer(objectId: $objectId, fields: $fields) {
                    objectId
                  }
                }
              `,
              variables: {
                objectId: obj.id,
                fields: {
                  someField1: 'someField1Value2',
                },
              },
            });

            expect(result.data.updateCustomer.objectId).toEqual(obj.id);

            await obj.fetch();

            expect(obj.get('someField1')).toEqual('someField1Value2');
            expect(obj.get('someField2')).toEqual('someField2Value1');
          });

          it('should respect level permissions', async () => {
            await prepareData();

            function updateObject(className, objectId, fields, headers) {
              return apolloClient.mutate({
                mutation: gql`
                  mutation UpdateSomeObject(
                    $className: String!
                    $objectId: ID!
                    $fields: Object
                  ) {
                    update(
                      className: $className
                      objectId: $objectId
                      fields: $fields
                    ) {
                      updatedAt
                    }
                  }
                `,
                variables: {
                  className,
                  objectId,
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

            function updateObject(className, objectId, fields, headers) {
              return apolloClient.mutate({
                mutation: gql`
                  mutation UpdateSomeObject(
                    $objectId: ID!
                    $fields: Update${className}FieldsInput
                  ) {
                    update${className}(
                      objectId: $objectId
                      fields: $fields
                    ) {
                      updatedAt
                    }
                  }
                `,
                variables: {
                  objectId,
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
          it('should return a boolean confirmation using generic mutation', async () => {
            const obj = new Parse.Object('SomeClass');
            await obj.save();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation DeleteSomeObject($objectId: ID!) {
                  delete(className: "SomeClass", objectId: $objectId)
                }
              `,
              variables: {
                objectId: obj.id,
              },
            });

            expect(result.data.delete).toEqual(true);

            await expectAsync(
              obj.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
          });

          it('should return a specific type using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation DeleteCustomer($objectId: ID!) {
                  deleteCustomer(objectId: $objectId) {
                    objectId
                    someField1
                    someField2
                  }
                }
              `,
              variables: {
                objectId: obj.id,
              },
            });

            expect(result.data.deleteCustomer.objectId).toEqual(obj.id);
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

            function deleteObject(className, objectId, headers) {
              return apolloClient.mutate({
                mutation: gql`
                  mutation DeleteSomeObject(
                    $className: String!
                    $objectId: ID!
                  ) {
                    delete(className: $className, objectId: $objectId)
                  }
                `,
                variables: {
                  className,
                  objectId,
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
            ).toEqual(true);
            await expectAsync(
              object4.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object1.className, object1.id, {
                'X-Parse-Master-Key': 'test',
              })).data.delete
            ).toEqual(true);
            await expectAsync(
              object1.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data.delete
            ).toEqual(true);
            await expectAsync(
              object2.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object3.className, object3.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.delete
            ).toEqual(true);
            await expectAsync(
              object3.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
          });

          it('should respect level permissions with specific class mutation', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            function deleteObject(className, objectId, headers) {
              return apolloClient.mutate({
                mutation: gql`
                  mutation DeleteSomeObject(
                    $objectId: ID!
                  ) {
                    delete${className}(objectId: $objectId) {
                      objectId
                    }
                  }
                `,
                variables: {
                  objectId,
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
              ].objectId
            ).toEqual(object4.id);
            await expectAsync(
              object4.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object1.className, object1.id, {
                'X-Parse-Master-Key': 'test',
              })).data[`delete${object1.className}`].objectId
            ).toEqual(object1.id);
            await expectAsync(
              object1.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data[`delete${object2.className}`].objectId
            ).toEqual(object2.id);
            await expectAsync(
              object2.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object3.className, object3.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data[`delete${object3.className}`].objectId
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
                  objectId
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
            objectId,
            username: resultUserName,
            email: resultEmail,
          } = result.data.viewer;
          expect(objectId).toBeDefined();
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
                  objectId
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

          const {
            objectId,
            sessionToken,
            userFoo: resultFoo,
          } = result.data.viewer;
          expect(objectId).toEqual(user.id);
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
                      objectId
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
          const someFieldValue = 'some string';

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('String');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
              query GetSomeObject($objectId: ID!, $someFieldValue: String) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { someField: { _eq: $someFieldValue } }) {
                  results {
                    someField
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.get.someField).toEqual('string');
          expect(getResult.data.get.someField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(2);
        });

        it('should support Int numbers', async () => {
          const someFieldValue = 123;

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
              query GetSomeObject($objectId: ID!, $someFieldValue: Float) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { someField: { _eq: $someFieldValue } }) {
                  results {
                    someField
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.get.someField).toEqual('number');
          expect(getResult.data.get.someField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(2);
        });

        it('should support Float numbers', async () => {
          const someFieldValue = 123.4;

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('Number');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
              query GetSomeObject($objectId: ID!, $someFieldValue: Float) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { someField: { _eq: $someFieldValue } }) {
                  results {
                    someField
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.get.someField).toEqual('number');
          expect(getResult.data.get.someField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(2);
        });

        it('should support Boolean', async () => {
          const someFieldValueTrue = true;
          const someFieldValueFalse = false;

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
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

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someFieldTrue.type).toEqual('Boolean');
          expect(schema.fields.someFieldFalse.type).toEqual('Boolean');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
                $objectId: ID!
                $someFieldValueTrue: Boolean
                $someFieldValueFalse: Boolean
              ) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(
                  where: {
                    someFieldTrue: { _eq: $someFieldValueTrue }
                    someFieldFalse: { _eq: $someFieldValueFalse }
                  }
                ) {
                  results {
                    objectId
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
              someFieldValueTrue,
              someFieldValueFalse,
            },
          });

          expect(typeof getResult.data.get.someFieldTrue).toEqual('boolean');
          expect(typeof getResult.data.get.someFieldFalse).toEqual('boolean');
          expect(getResult.data.get.someFieldTrue).toEqual(true);
          expect(getResult.data.get.someFieldFalse).toEqual(false);
          expect(getResult.data.someClasses.results.length).toEqual(2);
        });

        it('should support Date', async () => {
          const someFieldValue = {
            __type: 'Date',
            iso: new Date().toISOString(),
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('Date');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
              query GetSomeObject($objectId: ID!) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { someField: { _exists: true } }) {
                  results {
                    objectId
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
            },
          });

          expect(typeof getResult.data.get.someField).toEqual('object');
          expect(getResult.data.get.someField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(2);
        });

        it('should support createdAt', async () => {
          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  createdAt
                }
              }
            `,
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.createdAt.type).toEqual('Date');

          const { createdAt } = createResult.data.create;
          expect(Date.parse(createdAt)).not.toEqual(NaN);
        });

        it('should support updatedAt', async () => {
          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.updatedAt.type).toEqual('Date');

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "SomeClass", objectId: $objectId)
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
            },
          });

          expect(typeof getResult.data.get.updatedAt).toEqual('string');
          expect(Date.parse(getResult.data.get.updatedAt)).not.toEqual(NaN);
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
                  objectId
                  company {
                    objectId
                    name
                  }
                }
              }
            `,
            variables: {
              fields: {
                name: 'imCountry2',
                company: { link: { objectId: company2.id } },
              },
            },
          });

          expect(result.objectId).toBeDefined();
          expect(result.company.objectId).toEqual(company2.id);
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
                  objectId
                  company {
                    objectId
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

          expect(result.objectId).toBeDefined();
          expect(result.company.objectId).toBeDefined();
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
              mutation Update(
                $objectId: ID!
                $fields: UpdateCountryFieldsInput
              ) {
                updateCountry(objectId: $objectId, fields: $fields) {
                  objectId
                  company {
                    objectId
                    name
                  }
                }
              }
            `,
            variables: {
              objectId: country.id,
              fields: {
                company: { link: { objectId: company2.id } },
              },
            },
          });

          expect(result.objectId).toBeDefined();
          expect(result.company.objectId).toEqual(company2.id);
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
              mutation Update(
                $objectId: ID!
                $fields: UpdateCountryFieldsInput
              ) {
                updateCountry(objectId: $objectId, fields: $fields) {
                  objectId
                  company {
                    objectId
                    name
                  }
                }
              }
            `,
            variables: {
              objectId: country.id,
              fields: {
                company: {
                  createAndLink: {
                    name: 'imACompany2',
                  },
                },
              },
            },
          });

          expect(result.objectId).toBeDefined();
          expect(result.company.objectId).toBeDefined();
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
                    objectId
                    name
                    companies {
                      results {
                        objectId
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
                    add: [{ objectId: company.id }],
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

            expect(result.objectId).toBeDefined();
            expect(result.name).toEqual('imACountry2');
            expect(result.companies.results.length).toEqual(3);
            expect(
              result.companies.results.some(o => o.objectId === company.id)
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
                  objectId
                  name
                  companies {
                    results {
                      objectId
                      name
                      teams {
                        results {
                          objectId
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

          expect(result.objectId).toBeDefined();
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
                  $objectId: ID!
                  $fields: UpdateCountryFieldsInput
                ) {
                  updateCountry(objectId: $objectId, fields: $fields) {
                    objectId
                    companies {
                      results {
                        objectId
                        name
                      }
                    }
                  }
                }
              `,
              variables: {
                objectId: country.id,
                fields: {
                  companies: {
                    add: [{ objectId: company2.id }],
                    remove: [{ objectId: company1.id }],
                    createAndAdd: [
                      {
                        name: 'imACompany3',
                      },
                    ],
                  },
                },
              },
            });

            expect(result.objectId).toEqual(country.id);
            expect(result.companies.results.length).toEqual(2);
            expect(
              result.companies.results.some(o => o.objectId === company2.id)
            ).toBeTruthy();
            expect(
              result.companies.results.some(o => o.name === 'imACompany3')
            ).toBeTruthy();
            expect(
              result.companies.results.some(o => o.objectId === company1.id)
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
                    objectId
                    name
                    companies(where: $where) {
                      results {
                        objectId
                        name
                      }
                    }
                  }
                }
              `,
              variables: {
                where: {
                  name: {
                    _eq: 'imACompany2',
                  },
                },
                fields: {
                  name: 'imACountry2',
                  companies: {
                    add: [{ objectId: company.id }],
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

            expect(result.objectId).toBeDefined();
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
              query getCountry($objectId: ID!) {
                country(objectId: $objectId) {
                  objectId
                  companies {
                    results {
                      objectId
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: country.id,
            },
          });

          expect(result1.objectId).toEqual(country.id);
          expect(result1.companies.results.length).toEqual(2);
          expect(
            result1.companies.results.some(o => o.objectId === company1.id)
          ).toBeTruthy();
          expect(
            result1.companies.results.some(o => o.objectId === company2.id)
          ).toBeTruthy();

          // With where
          const {
            data: { country: result2 },
          } = await apolloClient.query({
            query: gql`
              query getCountry($objectId: ID!, $where: CompanyWhereInput) {
                country(objectId: $objectId) {
                  objectId
                  companies(where: $where) {
                    results {
                      objectId
                      name
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: country.id,
              where: {
                name: { _eq: 'imACompany1' },
              },
            },
          });
          expect(result2.objectId).toEqual(country.id);
          expect(result2.companies.results.length).toEqual(1);
          expect(result2.companies.results[0].objectId).toEqual(company1.id);
        });

        it('should support files', async () => {
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

          const someFieldValue = {
            __type: 'File',
            name: result.data.createFile.name,
            url: result.data.createFile.url,
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject(
                $fields1: CreateSomeClassFieldsInput
                $fields2: CreateSomeClassFieldsInput
              ) {
                createSomeClass1: createSomeClass(fields: $fields1) {
                  objectId
                }
                createSomeClass2: createSomeClass(fields: $fields2) {
                  objectId
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
              query GetSomeObject($objectId: ID!) {
                get(className: "SomeClass", objectId: $objectId)
                findSomeClass1: someClasses(
                  where: { someField: { _exists: true } }
                ) {
                  results {
                    someField {
                      name
                      url
                    }
                  }
                }
                findSomeClass2: someClasses(
                  where: { someField: { _exists: true } }
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
              objectId: createResult.data.create.objectId,
            },
          });

          expect(typeof getResult.data.get.someField).toEqual('object');
          expect(getResult.data.get.someField).toEqual(someFieldValue);
          expect(getResult.data.findSomeClass1.results.length).toEqual(3);
          expect(getResult.data.findSomeClass2.results.length).toEqual(3);

          res = await fetch(getResult.data.get.someField.url);

          expect(res.status).toEqual(200);
          expect(await res.text()).toEqual('My File Content');
        });

        it('should support object values', async () => {
          const someFieldValue = {
            foo: { bar: 'baz' },
            number: 10,
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('Object');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
              _eq: { _key: 'foo.bar', _value: 'baz' },
              _ne: { _key: 'foo.bar', _value: 'bat' },
              _gt: { _key: 'number', _value: 9 },
              _lt: { _key: 'number', _value: 11 },
            },
          };
          const queryResult = await apolloClient.query({
            query: gql`
              query GetSomeObject(
                $objectId: ID!
                $where: SomeClassWhereInput
                $genericWhere: Object
              ) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: $where) {
                  results {
                    objectId
                    someField
                  }
                }
                find(className: "SomeClass", where: $genericWhere) {
                  results
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
              where,
              genericWhere: where, // where and genericWhere types are different
            },
          });

          const { get: getResult, someClasses, find } = queryResult.data;

          const { someField } = getResult;
          expect(typeof someField).toEqual('object');
          expect(someField).toEqual(someFieldValue);

          // Checks class query results
          expect(someClasses.results.length).toEqual(2);
          expect(someClasses.results[0].someField).toEqual(someFieldValue);
          expect(someClasses.results[1].someField).toEqual(someFieldValue);

          // Checks generic query results
          expect(find.results.length).toEqual(2);
          expect(find.results[0].someField).toEqual(someFieldValue);
          expect(find.results[1].someField).toEqual(someFieldValue);
        });

        it('should support object composed queries', async () => {
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

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields1: Object, $fields2: Object) {
                create1: create(className: "SomeClass", fields: $fields1) {
                  objectId
                }
                create2: create(className: "SomeClass", fields: $fields2) {
                  objectId
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

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const where = {
            _and: [
              {
                someField: {
                  _gt: { _key: 'number', _value: 9 },
                },
              },
              {
                someField: {
                  _lt: { _key: 'number', _value: 11 },
                },
              },
              {
                _or: [
                  {
                    someField: {
                      _eq: { _key: 'lorem', _value: 'ipsum' },
                    },
                  },
                  {
                    someField: {
                      _eq: { _key: 'foo.test', _value: 'bar' },
                    },
                  },
                ],
              },
            ],
          };
          const findResult = await apolloClient.query({
            query: gql`
              query FindSomeObject(
                $where: SomeClassWhereInput
                $genericWhere: Object
              ) {
                someClasses(where: $where) {
                  results {
                    objectId
                    someField
                  }
                }
                find(className: "SomeClass", where: $genericWhere) {
                  results
                }
              }
            `,
            variables: {
              where,
              genericWhere: where, // where and genericWhere types are different
            },
          });

          const { create1, create2 } = createResult.data;
          const { someClasses, find } = findResult.data;

          // Checks class query results
          const { results } = someClasses;
          expect(results.length).toEqual(2);
          expect(
            results.find(result => result.objectId === create1.objectId)
              .someField
          ).toEqual(someFieldValue);
          expect(
            results.find(result => result.objectId === create2.objectId)
              .someField
          ).toEqual(someFieldValue2);

          // Checks generic query results
          const { results: genericResults } = find;
          expect(genericResults.length).toEqual(2);
          expect(
            genericResults.find(result => result.objectId === create1.objectId)
              .someField
          ).toEqual(someFieldValue);
          expect(
            genericResults.find(result => result.objectId === create2.objectId)
              .someField
          ).toEqual(someFieldValue2);
        });

        it('should support array values', async () => {
          const someFieldValue = [1, 'foo', ['bar'], { lorem: 'ipsum' }, true];

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('Array');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
              query GetSomeObject($objectId: ID!) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { someField: { _exists: true } }) {
                  results {
                    objectId
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
              objectId: createResult.data.create.objectId,
            },
          });

          const { someField } = getResult.data.get;
          expect(Array.isArray(someField)).toBeTruthy();
          expect(someField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(2);
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
              query GetSomeObject($objectId: ID!) {
                someClass(objectId: $objectId) {
                  objectId
                  someArray {
                    ... on Element {
                      value
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: obj.id,
            },
          });
          expect(getResult.data.someClass.someArray).toEqual(null);
        });

        it('should support null values', async () => {
          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
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
              mutation UpdateSomeObject($objectId: ID!, $fields: Object) {
                update(
                  className: "SomeClass"
                  objectId: $objectId
                  fields: $fields
                ) {
                  updatedAt
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
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
              query GetSomeObject($objectId: ID!) {
                get(className: "SomeClass", objectId: $objectId)
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
            },
          });

          expect(getResult.data.get.someStringField).toBeFalsy();
          expect(getResult.data.get.someNumberField).toBeFalsy();
          expect(getResult.data.get.someBooleanField).toBeFalsy();
          expect(getResult.data.get.someObjectField).toBeFalsy();
          expect(getResult.data.get.someNullField).toEqual(
            'now it has a string'
          );
        });

        it('should support Bytes', async () => {
          const someFieldValue = {
            __type: 'Bytes',
            base64: 'aGVsbG8gd29ybGQ=',
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('Bytes');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject(
                $fields1: CreateSomeClassFieldsInput
                $fields2: CreateSomeClassFieldsInput
              ) {
                createSomeClass1: createSomeClass(fields: $fields1) {
                  objectId
                }
                createSomeClass2: createSomeClass(fields: $fields2) {
                  objectId
                }
              }
            `,
            variables: {
              fields1: {
                someField: someFieldValue,
              },
              fields2: {
                someField: someFieldValue.base64,
              },
            },
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!, $someFieldValue: Bytes) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { someField: { _eq: $someFieldValue } }) {
                  results {
                    objectId
                    someField
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.get.someField).toEqual('object');
          expect(getResult.data.get.someField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(3);
        });

        it('should support Geo Points', async () => {
          const someFieldValue = {
            __type: 'GeoPoint',
            latitude: 45,
            longitude: 45,
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                someField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.someField.type).toEqual('GeoPoint');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
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
              query GetSomeObject($objectId: ID!) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { someField: { _exists: true } }) {
                  results {
                    objectId
                    someField {
                      latitude
                      longitude
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
            },
          });

          expect(typeof getResult.data.get.someField).toEqual('object');
          expect(getResult.data.get.someField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(2);
        });

        it('should support Polygons', async () => {
          const someFieldValue = {
            __type: 'Polygon',
            coordinates: [[44, 45], [46, 47], [48, 49], [44, 45]],
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                somePolygonField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.somePolygonField.type).toEqual('Polygon');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: CreateSomeClassFieldsInput) {
                createSomeClass(fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                somePolygonField: someFieldValue.coordinates.map(point => ({
                  latitude: point[0],
                  longitude: point[1],
                })),
              },
            },
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "SomeClass", objectId: $objectId)
                someClasses(where: { somePolygonField: { _exists: true } }) {
                  results {
                    objectId
                    somePolygonField {
                      latitude
                      longitude
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
            },
          });

          expect(typeof getResult.data.get.somePolygonField).toEqual('object');
          expect(getResult.data.get.somePolygonField).toEqual(someFieldValue);
          expect(getResult.data.someClasses.results.length).toEqual(2);
        });

        it('should support polygon values', async () => {
          const someFieldValue = {
            __type: 'Polygon',
            coordinates: [[1.0, 2.1], [3.2, 4.3], [5.4, 6.5], [1.0, 2.1]],
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                create(className: "SomeClass", fields: $fields) {
                  objectId
                }
              }
            `,
            variables: {
              fields: {
                somePolygonField: someFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                someClass(objectId: $objectId) {
                  somePolygonField {
                    latitude
                    longitude
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.create.objectId,
            },
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.somePolygonField.type).toEqual('Polygon');

          const { somePolygonField } = getResult.data.someClass;
          expect(Array.isArray(somePolygonField)).toBeTruthy();
          somePolygonField.forEach((coord, i) => {
            expect(coord.latitude).toEqual(someFieldValue.coordinates[i][0]);
            expect(coord.longitude).toEqual(someFieldValue.coordinates[i][1]);
          });
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
                  objectId
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
              query GetSomeObject($objectId: ID!) {
                someClass(objectId: $objectId) {
                  someField
                }
              }
            `,
            variables: {
              objectId: createResult.data.createSomeClass.objectId,
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
                $objectId: ID!
                $fields: UpdateSomeClassFieldsInput
              ) {
                updateSomeClass(objectId: $objectId, fields: $fields) {
                  updatedAt
                }
              }
            `,
            variables: {
              objectId: createResult.data.createSomeClass.objectId,
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
                    objectId
                  }
                }
              }
            `,
            variables: {
              where: {
                someField: {
                  _eq: updatedSomeFieldValue.base64,
                },
              },
            },
          });
          const findResults = findResult.data.someClasses.results;
          expect(findResults.length).toBe(1);
          expect(findResults[0].objectId).toBe(
            createResult.data.createSomeClass.objectId
          );
        });
      });

      describe('Special Classes', () => {
        it('should support User class', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_User", objectId: $objectId)
              }
            `,
            variables: {
              objectId: user.id,
            },
          });

          expect(getResult.data.get.objectId).toEqual(user.id);
        });

        it('should support Installation class', async () => {
          const installation = new Parse.Installation();
          await installation.save({
            deviceType: 'foo',
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_Installation", objectId: $objectId)
              }
            `,
            variables: {
              objectId: installation.id,
            },
          });

          expect(getResult.data.get.objectId).toEqual(installation.id);
        });

        it('should support Role class', async () => {
          const roleACL = new Parse.ACL();
          roleACL.setPublicReadAccess(true);
          const role = new Parse.Role('MyRole', roleACL);
          await role.save();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_Role", objectId: $objectId)
              }
            `,
            variables: {
              objectId: role.id,
            },
          });

          expect(getResult.data.get.objectId).toEqual(role.id);
        });

        it('should support Session class', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();

          const session = await Parse.Session.current();
          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_Session", objectId: $objectId)
              }
            `,
            variables: {
              objectId: session.id,
            },
            context: {
              headers: {
                'X-Parse-Session-Token': session.getSessionToken(),
              },
            },
          });

          expect(getResult.data.get.objectId).toEqual(session.id);
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

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_Product", objectId: $objectId)
              }
            `,
            variables: {
              objectId: product.id,
            },
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          expect(getResult.data.get.objectId).toEqual(product.id);
        });

        it('should support PushStatus class', async () => {
          const PushStatus = Parse.Object.extend('_PushStatus');
          const pushStatus = new PushStatus();
          await pushStatus.save(undefined, { useMasterKey: true });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_PushStatus", objectId: $objectId)
              }
            `,
            variables: {
              objectId: pushStatus.id,
            },
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          expect(getResult.data.get.objectId).toEqual(pushStatus.id);
        });

        it('should support JobStatus class', async () => {
          const JobStatus = Parse.Object.extend('_JobStatus');
          const jobStatus = new JobStatus();
          await jobStatus.save(undefined, { useMasterKey: true });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_JobStatus", objectId: $objectId)
              }
            `,
            variables: {
              objectId: jobStatus.id,
            },
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          expect(getResult.data.get.objectId).toEqual(jobStatus.id);
        });

        it('should support JobSchedule class', async () => {
          const JobSchedule = Parse.Object.extend('_JobSchedule');
          const jobSchedule = new JobSchedule();
          await jobSchedule.save(undefined, { useMasterKey: true });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_JobSchedule", objectId: $objectId)
              }
            `,
            variables: {
              objectId: jobSchedule.id,
            },
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          expect(getResult.data.get.objectId).toEqual(jobSchedule.id);
        });

        it('should support Hooks class', async () => {
          const functionName = 'fooHook';
          await parseServer.config.hooksController.saveHook({
            functionName,
            url: 'http://foo.bar',
          });

          const getResult = await apolloClient.query({
            query: gql`
              query FindSomeObject {
                find(className: "_Hooks") {
                  results
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Master-Key': 'test',
              },
            },
          });

          const { results } = getResult.data.find;
          expect(results.length).toEqual(1);
          expect(results[0].functionName).toEqual(functionName);
        });

        it('should support Audience class', async () => {
          const Audience = Parse.Object.extend('_Audience');
          const audience = new Audience();
          await audience.save();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                get(className: "_Audience", objectId: $objectId)
              }
            `,
            variables: {
              objectId: audience.id,
            },
          });

          expect(getResult.data.get.objectId).toEqual(audience.id);
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
