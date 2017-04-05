import {
  ParseObject,
  loadClass,
} from './ParseClass';

import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLID,
} from 'graphql'

// import {
//   GraphQLJSONObject
// } from './types';

import rest from '../rest';
/* eslint-disable */

export class GraphQLParseSchema {
  schema;
  types;
  constructor(schema) {
    this.schema = schema;
    this.types = {};
  }

  Schema() {
    return new GraphQLSchema({
      query: this.Query(),
      mutation: this.Mutation(),
    });
  }

  Query() {
    const MainSchemaOptions = {
      name: 'ParseSchema',
      description: `The full parse schema`,
      fields: {}
    }
    Object.keys(this.schema).forEach((className) => {
      const {
        queryType, objectType
      } = loadClass(className, this.schema);

      MainSchemaOptions.fields[className] = {
        type: new GraphQLList(objectType),
        args: {
          id: { type: GraphQLID, name: 'objectId' },
          where: { type: queryType }
        },
        resolve: (root, args, context, info) => {
          // console.log(className, info.fieldNodes);
          // console.log(info.fieldName);
          // console.log(info.fieldASTs);

          // function getSelections(info) {
          //   const fieldName = info.fieldName;
          //   const fieldNodes = info.fieldNodes;
          //   for(const i in fieldNodes) {
          //     const node = fieldNodes[i];
          //     if (node.name.value == fieldName) {
          //       return node.selectionSet.selections;
          //     }
          //   }
          // }

          // const selections = getSelections(info);
          // console.log(selections);
          // var all = [];
          // selections.forEach((node) => {
          //   const key = node.name.value;
          //   if (node.selectionSet && node.selectionSet.selections) {
          //     node.selectionSet.selections.map((node) => {
          //       return node.name.value;
          //     }).forEach((subKey) => {
          //       all.push(key + '.' + subKey);
          //     });
          //   } else {
          //     all.push(key);
          //   }
          // });

          // console.log(all);
          console.log(args);

          // console.log(info);
          // function flattenSelectionSets(nodes) {
          //   return nodes.reduce((node) => {
          //     const name = node.name.value;
          //     if (node.selectionSet && node.selectionSet.selections) {
          //       const descendants = flattenSelectionSets(node.selectionSet.selections);
          //       console.log(name, descendants);
          //       const results = [];
          //       descendants.forEach(descendant => {
          //         results.push()
          //       });
          //       return results;
          //     }
          //     return name;
          //   }, []);
          // }
          // const selectedNodes = flattenSelectionSets(info.fieldNodes);
          // console.log(selectedNodes);
          // console.log(JSON.stringify(selectedNodes));
         // console.log(root, args, context, info);
          // console.log(info.fieldNodes);
          // console.log(info.operation.selectionSet.selections);
          // info.fieldNodes.forEach((node) => {
          //   console.log(node.selectionSet.selections);
          // });
          return rest.find(context.config, context.auth, className, args.where).then((restResponse) => {
            //console.log(restResponse);
            return restResponse.results;
          });
          // return [{
          //   className,
          //   foo: 'Hello',
          //   bar: true
          // }, {
          //   className,
          //   foo: 'Hello',
          //   bar: false
          // }]
        }
      };
    });
    MainSchemaOptions.fields['ParseObject'] = { type: ParseObject };
    return new GraphQLObjectType(MainSchemaOptions);
  }

  Mutation()  {
    const MainSchemaMutationOptions = {
      name: 'ParseSchemaMutation',
      fields: {}
    }
    Object.keys(this.schema).forEach((className) => {
      const {
        inputType, objectType, updateType
      } = loadClass(className, this.schema);
      MainSchemaMutationOptions.fields['create' + className] = {
        type: objectType,
        fields: objectType.fields,
        args: { input: { type: inputType }},
        name: 'create',
        resolve: (a,data,context) => {
          console.log('Create resolve ' + className);
          //console.log(a,b,context);
          return rest.create(context.config, context.auth, className, data).then((res) => {
            console.log(res);
            return Object.assign({className}, data, res.response);
          });
        }
      }
      MainSchemaMutationOptions.fields['update' + className] = {
        type: objectType,
        args: {
          objectId: { type: new GraphQLNonNull(GraphQLID), name: 'objectId' },
          input: { type: updateType }
        },
        name: 'update',
        resolve: (a, data, context) => {
          console.log(a,data);
          console.log('update resolve');
          const objectId = data.objectId;
          delete data.objectId;
          if (data.incrementKey) {
            data[data.incrementKey.key] = {"__op":"Increment","amount":data.incrementKey.value};
            delete data.incrementKey;
          }
          return rest.update(context.config, context.auth, className, objectId, data).then((res) => {
            console.log(res);
            const response = Object.assign({className, objectId}, data, res.response);
            console.log(response);
            return response;
          });
        }
      }
      MainSchemaMutationOptions.fields['destroy' + className] = {
        type: objectType,
        args: {
          id: { type: new GraphQLNonNull(GraphQLID), name: 'objectId' }
        },
        name: 'destroy',
        resolve: (a,b,c) => {
          console.log('destroy resolve')
          console.log(a,b,c);
          return a;
        }
      }
      MainSchemaMutationOptions.fields['destroyAll' + className] =  {
        type: objectType,
        args: {
          ids: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLID))), name: 'objectIds' }
        },
        name: 'destroyAll',
        resolve: (a,b,c) => {
          console.log('destroyAll resolve')
          console.log(a,b,c);
          return a;
        }
      }
    });
    return new GraphQLObjectType(MainSchemaMutationOptions);
  }

  Root() {
    return Object.keys(this.schema).reduce((memo, className) => {
      memo[className] = {}
      return memo;
    }, {});
  }
}
