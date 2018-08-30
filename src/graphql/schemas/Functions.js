import { getAllFunctions } from '../../triggers';
import { FunctionsRouter } from '../../Routers/FunctionsRouter';
import { GraphQLBoolean } from 'graphql';
import { getGloballyUniqueId } from '../execute';

function getFunctions() {
  const functions = getAllFunctions();
  const fields = {};
  Object.keys(functions).forEach((name) => {
    const options = functions[name].options || {};
    let type = GraphQLBoolean;
    let inputType;
    let useDefaultType = true;
    if (options && options.type) {
      type = options.type;
      useDefaultType = false;
    }

    if (options && options.inputType) {
      inputType = options.inputType;
    }
    let args;
    if (inputType) {
      args = { input: { type: inputType }};
    }
    const description = options.description || 'Calling this mutation will run the cloud function';
    fields[name] =  {
      type,
      description,
      args,
      resolve: async (root, args, req) => {
        const results = await FunctionsRouter.runFunction(name, args.input, req);
        const result = results.response.result;
        injectIdsInResults(result);
        if (useDefaultType) {
          return true;
        }
        return result;
      }
    }
  });
  return fields;
}

function injectIdsInResults(result) {
  if (Array.isArray(result)) {
    result.forEach(injectIdsInResults);
  } else if (typeof result === 'object') {
    if (result.objectId && result.className) {
      result.id = getGloballyUniqueId(result.className, result.objectId);
    }
    Object.keys(result).forEach((key) => {
      injectIdsInResults(result[key]);
    });
  }

}

export default {
  Mutation: getFunctions
}
