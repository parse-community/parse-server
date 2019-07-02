const http = require('http');
const express = require('express');
const req = require('../lib/request');
const fetch = require('node-fetch');
const FormData = require('form-data');
const ws = require('ws');
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

  describe('API', () => {
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
      const httpServer = http.createServer(expressApp);
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
            'File',
            'FilesMutation',
            'FindResult',
            'ObjectsMutation',
            'ObjectsQuery',
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
            '_RoleClass',
            '_RoleConstraints',
            '_RoleFields',
            '_RoleFindResult',
            '_UserClass',
            '_UserConstraints',
            '_UserFindResult',
            '_UserFields',
          ];
          expect(
            expectedTypes.every(type => schemaTypes.indexOf(type) !== -1)
          ).toBeTruthy(JSON.stringify(schemaTypes));
        });

        it('should update schema when it changes', async () => {
          const schemaController = await parseServer.config.databaseController.loadSchema();
          await schemaController.updateClass('_User', {
            foo: { type: 'String' },
          });

          const userFields = (await apolloClient.query({
            query: gql`
              query UserType {
                __type(name: "_UserClass") {
                  fields {
                    name
                  }
                }
              }
            `,
          })).data['__type'].fields.map(field => field.name);
          expect(userFields.indexOf('foo') !== -1).toBeTruthy();
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
                  objects {
                    get(className: "SomeClass", objectId: $objectId)
                  }
                }
              `,
              variables: {
                objectId: obj.id,
              },
            })).data.objects.get;

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
                  objects {
                    getCustomer(objectId: $objectId) {
                      objectId
                      someField
                      createdAt
                      updatedAt
                    }
                  }
                }
              `,
              variables: {
                objectId: obj.id,
              },
            })).data.objects.getCustomer;

            expect(result.objectId).toEqual(obj.id);
            expect(result.someField).toEqual('someValue');
            expect(new Date(result.createdAt)).toEqual(obj.createdAt);
            expect(new Date(result.updatedAt)).toEqual(obj.updatedAt);
          });

          it('should respect level permissions', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            async function getObject(className, objectId, headers) {
              const specificQueryResult = await apolloClient.query({
                query: gql`
                  query GetSomeObject($objectId: ID!) {
                    objects {
                      get${className}(objectId: $objectId) {
                        objectId
                        createdAt
                      }
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
                    objects {
                      get(className: $className, objectId: $objectId)
                    }
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
              (await getObject(object4.className, object4.id)).data.objects.get
                .someField
            ).toEqual('someValue4');
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (await getObject(obj.className, obj.id, {
                    'X-Parse-Master-Key': 'test',
                  })).data.objects.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (await getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user1.getSessionToken(),
                  })).data.objects.get.someField
                ).toEqual(obj.get('someField'))
              )
            );
            await Promise.all(
              objects.map(async obj =>
                expect(
                  (await getObject(obj.className, obj.id, {
                    'X-Parse-Session-Token': user2.getSessionToken(),
                  })).data.objects.get.someField
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
                  })).data.objects.get.someField
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
              })).data.objects.get.someField
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
              })).data.objects.get.someField
            ).toEqual('someValue3');
            expect(
              (await getObject(object4.className, object4.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.objects.get.someField
            ).toEqual('someValue4');
          });

          it('should not bring session token of another user', async () => {
            await prepareData();

            const result = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  objects {
                    get(className: "_User", objectId: $objectId)
                  }
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
            expect(result.data.objects.get.sessionToken).toBeUndefined();
          });

          it('should not bring session token of current user', async () => {
            await prepareData();

            const result = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  objects {
                    get(className: "_User", objectId: $objectId)
                  }
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
            expect(result.data.objects.get.sessionToken).toBeUndefined();
          });

          it('should support keys argument', async () => {
            await prepareData();

            const result1 = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  objects {
                    get(
                      className: "GraphQLClass"
                      objectId: $objectId
                      keys: "someField"
                    )
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

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  objects {
                    get(
                      className: "GraphQLClass"
                      objectId: $objectId
                      keys: "someField,pointerToUser"
                    )
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

            expect(result1.data.objects.get.someField).toBeDefined();
            expect(result1.data.objects.get.pointerToUser).toBeUndefined();
            expect(result2.data.objects.get.someField).toBeDefined();
            expect(result2.data.objects.get.pointerToUser).toBeDefined();
          });

          it('should support include argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  objects {
                    get(className: "GraphQLClass", objectId: $objectId)
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

            const result2 = await apolloClient.query({
              query: gql`
                query GetSomeObject($objectId: ID!) {
                  objects {
                    get(
                      className: "GraphQLClass"
                      objectId: $objectId
                      include: "pointerToUser"
                    )
                    getGraphQLClass(objectId: $objectId) {
                      pointerToUser {
                        username
                      }
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

            expect(
              result1.data.objects.get.pointerToUser.username
            ).toBeUndefined();
            expect(
              result2.data.objects.get.pointerToUser.username
            ).toBeDefined();
            expect(
              result2.data.objects.getGraphQLClass.pointerToUser.username
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
                    objects {
                      get(
                        className: "GraphQLClass"
                        objectId: $objectId
                        include: "pointerToUser"
                      )
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

              let foundGraphQLClassReadPreference = false;
              let foundUserClassReadPreference = false;
              databaseAdapter.database.serverConfig.cursor.calls
                .all()
                .forEach(call => {
                  if (call.args[0].indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[2].readPreference).toBe(null);
                  } else if (call.args[0].indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[2].readPreference).toBe(null);
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
                    objects {
                      get(
                        className: "GraphQLClass"
                        objectId: $objectId
                        include: "pointerToUser"
                        readPreference: SECONDARY
                      )
                    }
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
                  if (call.args[0].indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
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
                    objects {
                      get(
                        className: "GraphQLClass"
                        objectId: $objectId
                        include: "pointerToUser"
                        readPreference: SECONDARY
                        includeReadPreference: NEAREST
                      )
                    }
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
                  if (call.args[0].indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
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
                  objects {
                    find(className: "SomeClass") {
                      results
                    }
                  }
                }
              `,
            });

            expect(result.data.objects.find.results.length).toEqual(2);

            result.data.objects.find.results.forEach(resultObj => {
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
                  objects {
                    findCustomer {
                      results {
                        objectId
                        someField
                        createdAt
                        updatedAt
                      }
                    }
                  }
                }
              `,
            });

            expect(result.data.objects.findCustomer.results.length).toEqual(2);

            result.data.objects.findCustomer.results.forEach(resultObj => {
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
              const result = await apolloClient.query({
                query: gql`
                  query FindSomeObjects($className: String!) {
                    objects {
                      find(className: $className) {
                        results
                      }
                      find${className} {
                        results {
                          objectId
                          someField
                        }
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

              const genericFindResults = result.data.objects.find.results;
              const specificFindResults =
                result.data.objects[`find${className}`].results;
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
              (await findObjects('GraphQLClass')).data.objects.find.results.map(
                object => object.someField
              )
            ).toEqual([]);
            expect(
              (await findObjects('PublicClass')).data.objects.find.results.map(
                object => object.someField
              )
            ).toEqual(['someValue4']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Master-Key': 'test',
              })).data.objects.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (await findObjects('PublicClass', {
                'X-Parse-Master-Key': 'test',
              })).data.objects.find.results.map(object => object.someField)
            ).toEqual(['someValue4']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })).data.objects.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (await findObjects('PublicClass', {
                'X-Parse-Session-Token': user1.getSessionToken(),
              })).data.objects.find.results.map(object => object.someField)
            ).toEqual(['someValue4']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data.objects.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue2', 'someValue3']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user3.getSessionToken(),
              })).data.objects.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue3']);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user4.getSessionToken(),
              })).data.objects.find.results.map(object => object.someField)
            ).toEqual([]);
            expect(
              (await findObjects('GraphQLClass', {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.objects.find.results.map(object => object.someField)
            ).toEqual(['someValue3']);
          });

          it('should support where argument using generic query', async () => {
            await prepareData();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: Object) {
                  objects {
                    find(className: "GraphQLClass", where: $where) {
                      results
                    }
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
              result.data.objects.find.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue3']);
          });

          it('should support where argument using class specific query', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.query({
              query: gql`
                query FindSomeObjects($where: GraphQLClassConstraints) {
                  objects {
                    findGraphQLClass(where: $where) {
                      results {
                        someField
                      }
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
              result.data.objects.findGraphQLClass.results
                .map(object => object.someField)
                .sort()
            ).toEqual(['someValue1', 'someValue3']);
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
                  $whereCustom: SomeClassConstraints
                  $order: String
                  $orderCustom: [SomeClassOrder!]
                  $skip: Int
                  $limit: Int
                ) {
                  objects {
                    find(
                      className: $className
                      where: $where
                      order: $order
                      skip: $skip
                      limit: $limit
                    ) {
                      results
                    }
                    findSomeClass(
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

            expect(
              result.data.objects.find.results.map(obj => obj.someField)
            ).toEqual(['someValue14', 'someValue17']);
            expect(
              result.data.objects.findSomeClass.results.map(
                obj => obj.someField
              )
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
                  $where2: GraphQLClassConstraints
                  $limit: Int
                ) {
                  objects {
                    find(
                      className: "GraphQLClass"
                      where: $where1
                      limit: $limit
                    ) {
                      results
                      count
                    }
                    findGraphQLClass(where: $where2, limit: $limit) {
                      results {
                        objectId
                      }
                      count
                    }
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

            expect(result.data.objects.find.results).toEqual([]);
            expect(result.data.objects.find.count).toEqual(2);
            expect(result.data.objects.findGraphQLClass.results).toEqual([]);
            expect(result.data.objects.findGraphQLClass.count).toEqual(2);
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
                  $where2: GraphQLClassConstraints
                ) {
                  objects {
                    find(className: "GraphQLClass", where: $where1) {
                      count
                    }
                    findGraphQLClass(where: $where2) {
                      count
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
                  'X-Parse-Master-Key': 'test',
                },
              },
            });

            expect(result.data.objects.find.results).toBeUndefined();
            expect(result.data.objects.find.count).toEqual(2);
            expect(
              result.data.objects.findGraphQLClass.results
            ).toBeUndefined();
            expect(result.data.objects.findGraphQLClass.count).toEqual(2);
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
                  objects {
                    find(
                      className: "SomeClass"
                      where: { objectId: { _exists: true } }
                      limit: $limit
                    ) {
                      results
                      count
                    }
                    findSomeClass(
                      where: { objectId: { _exists: true } }
                      limit: $limit
                    ) {
                      results {
                        objectId
                      }
                      count
                    }
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

            expect(result.data.objects.find.results.length).toEqual(10);
            expect(result.data.objects.find.count).toEqual(100);
            expect(result.data.objects.findSomeClass.results.length).toEqual(
              10
            );
            expect(result.data.objects.findSomeClass.count).toEqual(100);
          });

          it('should support keys argument', async () => {
            await prepareData();

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: Object) {
                  objects {
                    find(
                      className: "GraphQLClass"
                      where: $where
                      keys: "someField"
                    ) {
                      results
                    }
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
                  objects {
                    find(
                      className: "GraphQLClass"
                      where: $where
                      keys: "someField,pointerToUser"
                    ) {
                      results
                    }
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

            expect(
              result1.data.objects.find.results[0].someField
            ).toBeDefined();
            expect(
              result1.data.objects.find.results[0].pointerToUser
            ).toBeUndefined();
            expect(
              result2.data.objects.find.results[0].someField
            ).toBeDefined();
            expect(
              result2.data.objects.find.results[0].pointerToUser
            ).toBeDefined();
          });

          it('should support include argument', async () => {
            await prepareData();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result1 = await apolloClient.query({
              query: gql`
                query FindSomeObject($where: Object) {
                  objects {
                    find(className: "GraphQLClass", where: $where) {
                      results
                    }
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
                  $where2: GraphQLClassConstraints
                ) {
                  objects {
                    find(
                      className: "GraphQLClass"
                      where: $where1
                      include: "pointerToUser"
                    ) {
                      results
                    }
                    findGraphQLClass(where: $where2) {
                      results {
                        pointerToUser {
                          username
                        }
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
              result1.data.objects.find.results[0].pointerToUser.username
            ).toBeUndefined();
            expect(
              result2.data.objects.find.results[0].pointerToUser.username
            ).toBeDefined();
            expect(
              result2.data.objects.findGraphQLClass.results[0].pointerToUser
                .username
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
                  objects {
                    find(className: "SomeClass3") {
                      results
                    }
                  }
                }
              `,
            });

            const result2 = await apolloClient.query({
              query: gql`
                query FindSomeObject {
                  objects {
                    find(className: "SomeClass3", includeAll: true) {
                      results
                    }
                  }
                }
              `,
            });

            expect(
              result1.data.objects.find.results[0].obj1.someField1
            ).toBeUndefined();
            expect(
              result1.data.objects.find.results[0].obj2.someField2
            ).toBeUndefined();
            expect(
              result2.data.objects.find.results[0].obj1.someField1
            ).toEqual('someValue1');
            expect(
              result2.data.objects.find.results[0].obj2.someField2
            ).toEqual('someValue2');
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
                    objects {
                      find(
                        className: "GraphQLClass"
                        include: "pointerToUser"
                      ) {
                        results
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
                  if (call.args[0].indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[2].readPreference).toBe(null);
                  } else if (call.args[0].indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[2].readPreference).toBe(null);
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
                    objects {
                      find(
                        className: "GraphQLClass"
                        include: "pointerToUser"
                        readPreference: SECONDARY
                      ) {
                        results
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
                  if (call.args[0].indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
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
                    objects {
                      find(
                        className: "GraphQLClass"
                        include: "pointerToUser"
                        readPreference: SECONDARY
                        includeReadPreference: NEAREST
                      ) {
                        results
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
                  if (call.args[0].indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
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
                    objects {
                      find(
                        className: "GraphQLClass"
                        where: $where
                        readPreference: SECONDARY
                        subqueryReadPreference: NEAREST
                      ) {
                        count
                      }
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
                  if (call.args[0].indexOf('GraphQLClass') >= 0) {
                    foundGraphQLClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
                      ReadPreference.SECONDARY
                    );
                  } else if (call.args[0].indexOf('_User') >= 0) {
                    foundUserClassReadPreference = true;
                    expect(call.args[2].readPreference.preference).toBe(
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
                  objects {
                    create(className: "SomeClass", fields: $fields) {
                      objectId
                      createdAt
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someField: 'someValue',
                },
              },
            });

            expect(result.data.objects.create.objectId).toBeDefined();

            const obj = await new Parse.Query('SomeClass').get(
              result.data.objects.create.objectId
            );

            expect(obj.createdAt).toEqual(
              new Date(result.data.objects.create.createdAt)
            );
            expect(obj.get('someField')).toEqual('someValue');
          });

          it('should return CreateResult object using class specific mutation', async () => {
            const customerSchema = new Parse.Schema('Customer');
            customerSchema.addString('someField');
            await customerSchema.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation CreateCustomer($fields: CustomerFields) {
                  objects {
                    createCustomer(fields: $fields) {
                      objectId
                      createdAt
                    }
                  }
                }
              `,
              variables: {
                fields: {
                  someField: 'someValue',
                },
              },
            });

            expect(result.data.objects.createCustomer.objectId).toBeDefined();

            const customer = await new Parse.Query('Customer').get(
              result.data.objects.createCustomer.objectId
            );

            expect(customer.createdAt).toEqual(
              new Date(result.data.objects.createCustomer.createdAt)
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
                    objects {
                      create(className: $className) {
                        objectId
                        createdAt
                      }
                      create${className} {
                        objectId
                        createdAt
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

              const { create } = result.data.objects;
              expect(create.objectId).toBeDefined();
              expect(create.createdAt).toBeDefined();

              const specificCreate = result.data.objects[`create${className}`];
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
                  objects {
                    update(
                      className: "SomeClass"
                      objectId: $objectId
                      fields: $fields
                    ) {
                      updatedAt
                    }
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

            expect(result.data.objects.update.updatedAt).toBeDefined();

            await obj.fetch();

            expect(obj.get('someField1')).toEqual('someField1Value2');
            expect(obj.get('someField2')).toEqual('someField2Value1');
          });

          it('should return UpdateResult object using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            obj.set('someField1', 'someField1Value1');
            obj.set('someField2', 'someField2Value1');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation UpdateCustomer(
                  $objectId: ID!
                  $fields: CustomerFields
                ) {
                  objects {
                    updateCustomer(objectId: $objectId, fields: $fields) {
                      updatedAt
                    }
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

            expect(result.data.objects.updateCustomer.updatedAt).toBeDefined();

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
                    objects {
                      update(
                        className: $className
                        objectId: $objectId
                        fields: $fields
                      ) {
                        updatedAt
                      }
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
              })).data.objects.update.updatedAt
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
                  )).data.objects.update.updatedAt
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
                  )).data.objects.update.updatedAt
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
                  )).data.objects.update.updatedAt
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
                  )).data.objects.update.updatedAt
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
              )).data.objects.update.updatedAt
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
              )).data.objects.update.updatedAt
            ).toBeDefined();
            await object3.fetch({ useMasterKey: true });
            expect(object3.get('someField')).toEqual('changedValue7');
            expect(
              (await updateObject(
                object4.className,
                object4.id,
                { someField: 'changedValue7' },
                { 'X-Parse-Session-Token': user5.getSessionToken() }
              )).data.objects.update.updatedAt
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
                    $fields: ${className}Fields
                  ) {
                    objects {
                      update${className}(
                        objectId: $objectId
                        fields: $fields
                      ) {
                        updatedAt
                      }
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
              })).data.objects[`update${object4.className}`].updatedAt
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
                  )).data.objects[`update${obj.className}`].updatedAt
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
                  )).data.objects[`update${obj.className}`].updatedAt
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
                  )).data.objects[`update${obj.className}`].updatedAt
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
                  )).data.objects[`update${obj.className}`].updatedAt
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
              )).data.objects[`update${object4.className}`].updatedAt
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
              )).data.objects[`update${object3.className}`].updatedAt
            ).toBeDefined();
            await object3.fetch({ useMasterKey: true });
            expect(object3.get('someField')).toEqual('changedValue7');
            expect(
              (await updateObject(
                object4.className,
                object4.id,
                { someField: 'changedValue7' },
                { 'X-Parse-Session-Token': user5.getSessionToken() }
              )).data.objects[`update${object4.className}`].updatedAt
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
                  objects {
                    delete(className: "SomeClass", objectId: $objectId)
                  }
                }
              `,
              variables: {
                objectId: obj.id,
              },
            });

            expect(result.data.objects.delete).toEqual(true);

            await expectAsync(
              obj.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
          });

          it('should return a boolean confirmation using class specific mutation', async () => {
            const obj = new Parse.Object('Customer');
            await obj.save();

            await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

            const result = await apolloClient.mutate({
              mutation: gql`
                mutation DeleteCustomer($objectId: ID!) {
                  objects {
                    deleteCustomer(objectId: $objectId)
                  }
                }
              `,
              variables: {
                objectId: obj.id,
              },
            });

            expect(result.data.objects.deleteCustomer).toEqual(true);

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
                    objects {
                      delete(className: $className, objectId: $objectId)
                    }
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
              (await deleteObject(object4.className, object4.id)).data.objects
                .delete
            ).toEqual(true);
            await expectAsync(
              object4.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object1.className, object1.id, {
                'X-Parse-Master-Key': 'test',
              })).data.objects.delete
            ).toEqual(true);
            await expectAsync(
              object1.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data.objects.delete
            ).toEqual(true);
            await expectAsync(
              object2.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object3.className, object3.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.objects.delete
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
                    objects {
                      delete${className}(objectId: $objectId)
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
              (await deleteObject(object4.className, object4.id)).data.objects[
                `delete${object4.className}`
              ]
            ).toEqual(true);
            await expectAsync(
              object4.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object1.className, object1.id, {
                'X-Parse-Master-Key': 'test',
              })).data.objects[`delete${object1.className}`]
            ).toEqual(true);
            await expectAsync(
              object1.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object2.className, object2.id, {
                'X-Parse-Session-Token': user2.getSessionToken(),
              })).data.objects[`delete${object2.className}`]
            ).toEqual(true);
            await expectAsync(
              object2.fetch({ useMasterKey: true })
            ).toBeRejectedWith(jasmine.stringMatching('Object not found'));
            expect(
              (await deleteObject(object3.className, object3.id, {
                'X-Parse-Session-Token': user5.getSessionToken(),
              })).data.objects[`delete${object3.className}`]
            ).toEqual(true);
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
                  mutation CreateFile($file: Upload!) {
                    files {
                      create(file: $file) {
                        name
                        url
                      }
                    }
                  }
                `,
                variables: {
                  file: null,
                },
              })
            );
            body.append('map', JSON.stringify({ 1: ['variables.file'] }));
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

            expect(result.data.files.create.name).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );
            expect(result.data.files.create.url).toEqual(
              jasmine.stringMatching(/_myFileName.txt$/)
            );

            res = await fetch(result.data.files.create.url);

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
                users {
                  me {
                    objectId
                    username
                    email
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
            username: resultUserName,
            email: resultEmail,
          } = result.data.users.me;
          expect(objectId).toBeDefined();
          expect(resultUserName).toEqual(userName);
          expect(resultEmail).toEqual(email);
        });
      });

      describe('Users Mutations', () => {
        it('should sign user up', async () => {
          const result = await apolloClient.mutate({
            mutation: gql`
              mutation SignUp($fields: _UserSignUpFields) {
                users {
                  signUp(fields: $fields) {
                    sessionToken
                  }
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

          expect(result.data.users.signUp.sessionToken).toBeDefined();
          expect(typeof result.data.users.signUp.sessionToken).toBe('string');
        });

        it('should log the user in', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();
          await Parse.User.logOut();

          const result = await apolloClient.mutate({
            mutation: gql`
              mutation LogInUser($username: String!, $password: String!) {
                users {
                  logIn(username: $username, password: $password) {
                    sessionToken
                  }
                }
              }
            `,
            variables: {
              username: 'user1',
              password: 'user1',
            },
          });

          expect(result.data.users.logIn.sessionToken).toBeDefined();
          expect(typeof result.data.users.logIn.sessionToken).toBe('string');
        });

        it('should log the user out', async () => {
          const user = new Parse.User();
          user.setUsername('user1');
          user.setPassword('user1');
          await user.signUp();
          await Parse.User.logOut();

          const logIn = await apolloClient.mutate({
            mutation: gql`
              mutation LogInUser($username: String!, $password: String!) {
                users {
                  logIn(username: $username, password: $password) {
                    sessionToken
                  }
                }
              }
            `,
            variables: {
              username: 'user1',
              password: 'user1',
            },
          });

          const sessionToken = logIn.data.users.logIn.sessionToken;

          const logOut = await apolloClient.mutate({
            mutation: gql`
              mutation LogOutUser {
                users {
                  logOut
                }
              }
            `,
            context: {
              headers: {
                'X-Parse-Session-Token': sessionToken,
              },
            },
          });
          expect(logOut.data.users.logOut).toBeTruthy();

          await expectAsync(
            apolloClient.query({
              query: gql`
                query GetCurrentUser {
                  users {
                    me {
                      username
                    }
                  }
                }
              `,
              context: {
                headers: {
                  'X-Parse-Session-Token': sessionToken,
                },
              },
            })
          ).toBeRejected();
        });
      });

      describe('Data Types', () => {
        it('should support String', async () => {
          const someFieldValue = 'some string';

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(
                    where: { someField: { _eq: $someFieldValue } }
                  ) {
                    results {
                      someField
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.objects.get.someField).toEqual('string');
          expect(getResult.data.objects.get.someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support Int numbers', async () => {
          const someFieldValue = 123;

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(
                    where: { someField: { _eq: $someFieldValue } }
                  ) {
                    results {
                      someField
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.objects.get.someField).toEqual('number');
          expect(getResult.data.objects.get.someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support Float numbers', async () => {
          const someFieldValue = 123.4;

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(
                    where: { someField: { _eq: $someFieldValue } }
                  ) {
                    results {
                      someField
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.objects.get.someField).toEqual('number');
          expect(getResult.data.objects.get.someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support Boolean', async () => {
          const someFieldValueTrue = true;
          const someFieldValueFalse = false;

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(
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
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
              someFieldValueTrue,
              someFieldValueFalse,
            },
          });

          expect(typeof getResult.data.objects.get.someFieldTrue).toEqual(
            'boolean'
          );
          expect(typeof getResult.data.objects.get.someFieldFalse).toEqual(
            'boolean'
          );
          expect(getResult.data.objects.get.someFieldTrue).toEqual(true);
          expect(getResult.data.objects.get.someFieldFalse).toEqual(false);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support Date', async () => {
          const someFieldValue = {
            __type: 'Date',
            iso: new Date().toISOString(),
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(where: { someField: { _exists: true } }) {
                    results {
                      objectId
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          expect(typeof getResult.data.objects.get.someField).toEqual('object');
          expect(getResult.data.objects.get.someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support createdAt', async () => {
          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    createdAt
                  }
                }
              }
            `,
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.createdAt.type).toEqual('Date');

          const { createdAt } = createResult.data.objects.create;
          expect(Date.parse(createdAt)).not.toEqual(NaN);
        });

        it('should support updatedAt', async () => {
          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
                }
              }
            `,
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.updatedAt.type).toEqual('Date');

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          expect(typeof getResult.data.objects.get.updatedAt).toEqual('string');
          expect(Date.parse(getResult.data.objects.get.updatedAt)).not.toEqual(
            NaN
          );
        });

        it('should support pointer values', async () => {
          const parent = new Parse.Object('ParentClass');
          await parent.save();

          const pointerFieldValue = {
            __type: 'Pointer',
            className: 'ParentClass',
            objectId: parent.id,
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateChildObject($fields: Object) {
                objects {
                  create(className: "ChildClass", fields: $fields) {
                    objectId
                  }
                }
              }
            `,
            variables: {
              fields: {
                pointerField: pointerFieldValue,
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('ChildClass').get();
          expect(schema.fields.pointerField.type).toEqual('Pointer');
          expect(schema.fields.pointerField.targetClass).toEqual('ParentClass');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateChildObject(
                $fields1: ChildClassFields
                $fields2: ChildClassFields
              ) {
                objects {
                  createChildClass1: createChildClass(fields: $fields1) {
                    objectId
                  }
                  createChildClass2: createChildClass(fields: $fields2) {
                    objectId
                  }
                }
              }
            `,
            variables: {
              fields1: {
                pointerField: pointerFieldValue,
              },
              fields2: {
                pointerField: pointerFieldValue.objectId,
              },
            },
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetChildObject(
                $objectId: ID!
                $pointerFieldValue1: ParentClassPointer
                $pointerFieldValue2: ParentClassPointer
              ) {
                objects {
                  get(className: "ChildClass", objectId: $objectId)
                  findChildClass1: findChildClass(
                    where: { pointerField: { _eq: $pointerFieldValue1 } }
                  ) {
                    results {
                      pointerField {
                        objectId
                        createdAt
                      }
                    }
                  }
                  findChildClass2: findChildClass(
                    where: { pointerField: { _eq: $pointerFieldValue2 } }
                  ) {
                    results {
                      pointerField {
                        objectId
                        createdAt
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
              pointerFieldValue1: pointerFieldValue,
              pointerFieldValue2: pointerFieldValue.objectId,
            },
          });

          expect(typeof getResult.data.objects.get.pointerField).toEqual(
            'object'
          );
          expect(getResult.data.objects.get.pointerField).toEqual(
            pointerFieldValue
          );
          expect(getResult.data.objects.findChildClass1.results.length).toEqual(
            3
          );
          expect(getResult.data.objects.findChildClass2.results.length).toEqual(
            3
          );
        });

        it_only_db('mongo')('should support relation', async () => {
          const someObject1 = new Parse.Object('SomeClass');
          await someObject1.save();
          const someObject2 = new Parse.Object('SomeClass');
          await someObject2.save();

          const pointerValue1 = {
            __type: 'Pointer',
            className: 'SomeClass',
            objectId: someObject1.id,
          };
          const pointerValue2 = {
            __type: 'Pointer',
            className: 'SomeClass',
            objectId: someObject2.id,
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateMainObject($fields: Object) {
                objects {
                  create(className: "MainClass", fields: $fields) {
                    objectId
                  }
                }
              }
            `,
            variables: {
              fields: {
                relationField: {
                  __op: 'Batch',
                  ops: [
                    {
                      __op: 'AddRelation',
                      objects: [pointerValue1],
                    },
                    {
                      __op: 'AddRelation',
                      objects: [pointerValue2],
                    },
                  ],
                },
              },
            },
          });

          await parseGraphQLServer.parseGraphQLSchema.databaseController.schemaCache.clear();

          const schema = await new Parse.Schema('MainClass').get();
          expect(schema.fields.relationField.type).toEqual('Relation');
          expect(schema.fields.relationField.targetClass).toEqual('SomeClass');

          await apolloClient.mutate({
            mutation: gql`
              mutation CreateMainObject($fields: MainClassFields) {
                objects {
                  createMainClass(fields: $fields) {
                    objectId
                  }
                }
              }
            `,
            variables: {
              fields: {
                relationField: {
                  _op: 'Batch',
                  ops: [
                    {
                      _op: 'AddRelation',
                      objects: [pointerValue1],
                    },
                    {
                      _op: 'RemoveRelation',
                      objects: [pointerValue1],
                    },
                    {
                      _op: 'AddRelation',
                      objects: [pointerValue2],
                    },
                  ],
                },
              },
            },
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetMainObject($objectId: ID!) {
                objects {
                  get(className: "MainClass", objectId: $objectId)
                  getMainClass(objectId: $objectId) {
                    relationField {
                      results {
                        objectId
                        createdAt
                      }
                      count
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          expect(typeof getResult.data.objects.get.relationField).toEqual(
            'object'
          );
          expect(getResult.data.objects.get.relationField).toEqual({
            __type: 'Relation',
            className: 'SomeClass',
          });
          expect(
            getResult.data.objects.getMainClass.relationField.results.length
          ).toEqual(2);
          expect(
            getResult.data.objects.getMainClass.relationField.count
          ).toEqual(2);

          const findResult = await apolloClient.query({
            query: gql`
              query FindSomeObjects($where: Object) {
                objects {
                  find(className: "SomeClass", where: $where) {
                    results
                  }
                }
              }
            `,
            variables: {
              where: {
                $relatedTo: {
                  object: {
                    __type: 'Pointer',
                    className: 'MainClass',
                    objectId: createResult.data.objects.create.objectId,
                  },
                  key: 'relationField',
                },
              },
            },
          });

          const compare = (obj1, obj2) =>
            obj1.createdAt > obj2.createdAt ? 1 : -1;

          expect(findResult.data.objects.find.results).toEqual(
            jasmine.any(Array)
          );
          expect(findResult.data.objects.find.results.sort(compare)).toEqual(
            [
              {
                objectId: someObject1.id,
                createdAt: someObject1.createdAt.toISOString(),
                updatedAt: someObject1.updatedAt.toISOString(),
              },
              {
                objectId: someObject2.id,
                createdAt: someObject2.createdAt.toISOString(),
                updatedAt: someObject2.updatedAt.toISOString(),
              },
            ].sort(compare)
          );
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
                mutation CreateFile($file: Upload!) {
                  files {
                    create(file: $file) {
                      name
                      url
                    }
                  }
                }
              `,
              variables: {
                file: null,
              },
            })
          );
          body.append('map', JSON.stringify({ 1: ['variables.file'] }));
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

          expect(result.data.files.create.name).toEqual(
            jasmine.stringMatching(/_myFileName.txt$/)
          );
          expect(result.data.files.create.url).toEqual(
            jasmine.stringMatching(/_myFileName.txt$/)
          );

          const someFieldValue = {
            __type: 'File',
            name: result.data.files.create.name,
            url: result.data.files.create.url,
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
                $fields1: SomeClassFields
                $fields2: SomeClassFields
              ) {
                objects {
                  createSomeClass1: createSomeClass(fields: $fields1) {
                    objectId
                  }
                  createSomeClass2: createSomeClass(fields: $fields2) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass1: findSomeClass(
                    where: { someField: { _exists: true } }
                  ) {
                    results {
                      someField {
                        name
                        url
                      }
                    }
                  }
                  findSomeClass2: findSomeClass(
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
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          expect(typeof getResult.data.objects.get.someField).toEqual('object');
          expect(getResult.data.objects.get.someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass1.results.length).toEqual(
            3
          );
          expect(getResult.data.objects.findSomeClass2.results.length).toEqual(
            3
          );

          res = await fetch(getResult.data.objects.get.someField.url);

          expect(res.status).toEqual(200);
          expect(await res.text()).toEqual('My File Content');
        });

        it('should support object values', async () => {
          const someFieldValue = { foo: 'bar' };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(where: { someField: { _exists: true } }) {
                    results {
                      objectId
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          const { someField } = getResult.data.objects.get;
          expect(typeof someField).toEqual('object');
          expect(someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support array values', async () => {
          const someFieldValue = [1, 'foo', ['bar'], { lorem: 'ipsum' }, true];

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(where: { someField: { _exists: true } }) {
                    results {
                      objectId
                      someField
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          const { someField } = getResult.data.objects.get;
          expect(Array.isArray(someField)).toBeTruthy();
          expect(someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support null values', async () => {
          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
                objects {
                  update(
                    className: "SomeClass"
                    objectId: $objectId
                    fields: $fields
                  ) {
                    updatedAt
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          expect(getResult.data.objects.get.someStringField).toBeFalsy();
          expect(getResult.data.objects.get.someNumberField).toBeFalsy();
          expect(getResult.data.objects.get.someBooleanField).toBeFalsy();
          expect(getResult.data.objects.get.someObjectField).toBeFalsy();
          expect(getResult.data.objects.get.someNullField).toEqual(
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
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
                $fields1: SomeClassFields
                $fields2: SomeClassFields
              ) {
                objects {
                  createSomeClass1: createSomeClass(fields: $fields1) {
                    objectId
                  }
                  createSomeClass2: createSomeClass(fields: $fields2) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(
                    where: { someField: { _eq: $someFieldValue } }
                  ) {
                    results {
                      objectId
                      someField
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
              someFieldValue,
            },
          });

          expect(typeof getResult.data.objects.get.someField).toEqual('object');
          expect(getResult.data.objects.get.someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            3
          );
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
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(where: { someField: { _exists: true } }) {
                    results {
                      objectId
                      someField {
                        latitude
                        longitude
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          expect(typeof getResult.data.objects.get.someField).toEqual('object');
          expect(getResult.data.objects.get.someField).toEqual(someFieldValue);
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support Polygons', async () => {
          const someFieldValue = {
            __type: 'Polygon',
            coordinates: [[44, 45], [46, 47], [48, 49], [44, 45]],
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  get(className: "SomeClass", objectId: $objectId)
                  findSomeClass(
                    where: { somePolygonField: { _exists: true } }
                  ) {
                    results {
                      objectId
                      somePolygonField {
                        latitude
                        longitude
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          expect(typeof getResult.data.objects.get.somePolygonField).toEqual(
            'object'
          );
          expect(getResult.data.objects.get.somePolygonField).toEqual(
            someFieldValue
          );
          expect(getResult.data.objects.findSomeClass.results.length).toEqual(
            2
          );
        });

        it('should support polygon values', async () => {
          const someFieldValue = {
            __type: 'Polygon',
            coordinates: [[1.0, 2.1], [3.2, 4.3], [5.4, 6.5], [1.0, 2.1]],
          };

          const createResult = await apolloClient.mutate({
            mutation: gql`
              mutation CreateSomeObject($fields: Object) {
                objects {
                  create(className: "SomeClass", fields: $fields) {
                    objectId
                  }
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
                objects {
                  getSomeClass(objectId: $objectId) {
                    somePolygonField {
                      latitude
                      longitude
                    }
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.create.objectId,
            },
          });

          const schema = await new Parse.Schema('SomeClass').get();
          expect(schema.fields.somePolygonField.type).toEqual('Polygon');

          const { somePolygonField } = getResult.data.objects.getSomeClass;
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
              mutation CreateSomeObject($fields: SomeClassFields) {
                objects {
                  createSomeClass(fields: $fields) {
                    objectId
                  }
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
                objects {
                  getSomeClass(objectId: $objectId) {
                    someField
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.createSomeClass.objectId,
            },
          });

          expect(getResult.data.objects.getSomeClass.someField).toEqual(
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
                $fields: SomeClassFields
              ) {
                objects {
                  updateSomeClass(objectId: $objectId, fields: $fields) {
                    updatedAt
                  }
                }
              }
            `,
            variables: {
              objectId: createResult.data.objects.createSomeClass.objectId,
              fields: {
                someField: updatedSomeFieldValue,
              },
            },
          });

          const { updatedAt } = updatedResult.data.objects.updateSomeClass;
          expect(updatedAt).toBeDefined();

          const findResult = await apolloClient.query({
            query: gql`
              query FindSomeObject($where: SomeClassConstraints!) {
                objects {
                  findSomeClass(where: $where) {
                    results {
                      objectId
                    }
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
          const findResults = findResult.data.objects.findSomeClass.results;
          expect(findResults.length).toBe(1);
          expect(findResults[0].objectId).toBe(
            createResult.data.objects.createSomeClass.objectId
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
                objects {
                  get(className: "_User", objectId: $objectId)
                }
              }
            `,
            variables: {
              objectId: user.id,
            },
          });

          expect(getResult.data.objects.get.objectId).toEqual(user.id);
        });

        it('should support Installation class', async () => {
          const installation = new Parse.Installation();
          await installation.save({
            deviceType: 'foo',
          });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                objects {
                  get(className: "_Installation", objectId: $objectId)
                }
              }
            `,
            variables: {
              objectId: installation.id,
            },
          });

          expect(getResult.data.objects.get.objectId).toEqual(installation.id);
        });

        it('should support Role class', async () => {
          const roleACL = new Parse.ACL();
          roleACL.setPublicReadAccess(true);
          const role = new Parse.Role('MyRole', roleACL);
          await role.save();

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                objects {
                  get(className: "_Role", objectId: $objectId)
                }
              }
            `,
            variables: {
              objectId: role.id,
            },
          });

          expect(getResult.data.objects.get.objectId).toEqual(role.id);
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
                objects {
                  get(className: "_Session", objectId: $objectId)
                }
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

          expect(getResult.data.objects.get.objectId).toEqual(session.id);
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
                objects {
                  get(className: "_Product", objectId: $objectId)
                }
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

          expect(getResult.data.objects.get.objectId).toEqual(product.id);
        });

        it('should support PushStatus class', async () => {
          const PushStatus = Parse.Object.extend('_PushStatus');
          const pushStatus = new PushStatus();
          await pushStatus.save(undefined, { useMasterKey: true });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                objects {
                  get(className: "_PushStatus", objectId: $objectId)
                }
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

          expect(getResult.data.objects.get.objectId).toEqual(pushStatus.id);
        });

        it('should support JobStatus class', async () => {
          const JobStatus = Parse.Object.extend('_JobStatus');
          const jobStatus = new JobStatus();
          await jobStatus.save(undefined, { useMasterKey: true });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                objects {
                  get(className: "_JobStatus", objectId: $objectId)
                }
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

          expect(getResult.data.objects.get.objectId).toEqual(jobStatus.id);
        });

        it('should support JobSchedule class', async () => {
          const JobSchedule = Parse.Object.extend('_JobSchedule');
          const jobSchedule = new JobSchedule();
          await jobSchedule.save(undefined, { useMasterKey: true });

          const getResult = await apolloClient.query({
            query: gql`
              query GetSomeObject($objectId: ID!) {
                objects {
                  get(className: "_JobSchedule", objectId: $objectId)
                }
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

          expect(getResult.data.objects.get.objectId).toEqual(jobSchedule.id);
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
                objects {
                  find(className: "_Hooks") {
                    results
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

          const { results } = getResult.data.objects.find;
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
                objects {
                  get(className: "_Audience", objectId: $objectId)
                }
              }
            `,
            variables: {
              objectId: audience.id,
            },
          });

          expect(getResult.data.objects.get.objectId).toEqual(audience.id);
        });
      });
    });
  });
});
