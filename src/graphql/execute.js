import rest from '../rest';

// Flatten all graphQL selections to the dot notation.
function reduceSelections(selections, topKey) {
  return selections.reduce((memo, selection) => {
    const value = selection.name.value;
    if (selection.selectionSet === null || selection.selectionSet === undefined) {
      if (value === 'id') {
        memo.push('objectId');
      } else {
        memo.push(value);
      }
    } else {
      // Get the sub seletions and add on current key
      const subSelections = reduceSelections(selection.selectionSet.selections, topKey);
      memo = memo.concat(subSelections.map((key) => {
        return value + '.' + key;
      }));
    }
    return memo;
  }, []);
}

// Get the selections for the 1st node in a array of . separated keys
function getSelections(node, topKey) {
  return reduceSelections(node.selectionSet.selections, topKey);
}

function getFirstNode(node, matching) {
  if (!node || !node.selectionSet || !node.selectionSet.selections) {
    return;
  }
  let found;
  for(const child of node.selectionSet.selections) {
    found = matching(child, node);
    getFirstNode(child, matching);
  }
  if (found) {
    return;
  }
}

function flattenSelectionSet(nodes) {
  const allSelections = nodes.map(getSelections).reduce((memo, keys) => {
    return memo.concat(keys);
  }, []);
  return [...new Set(allSelections)].join(',');
}

function getKeysForFind(info/*, schema, className*/) {
  const node = info.fieldNodes[0];
  const nodes = [];
  getFirstNode(node, (child, node) => {
    if (child.name.value === 'nodes') {
      nodes.push(child);
      return true;
    }
    if (child.name.value === 'node' && node.name.value === 'edges') {
      nodes.push(child);
      return true;
    }
  });
  const keys = flattenSelectionSet(nodes);
  return {
    keys,
    include: keys
  }
}

function getQueryOptions(info, parentNodeName) {
  const node = info.fieldNodes[0];
  const selections = node.selectionSet.selections;
  let nodes = selections.filter((selection) => {
    return selection.name.value == parentNodeName;
  });
  if (nodes.length == 0) {
    nodes = [node];
  }
  const keys = flattenSelectionSet(nodes);
  return {
    keys,
    include: keys
  }
}

function transformResult(className, result, schema) {
  if (Array.isArray(result)) {
    return result.map((res) => transformResult(className, res, schema));
  }
  const { fields } = schema[className];
  if (result.objectId) {
    result.id = result.objectId;
  }
  Object.keys(result).forEach((key) => {
    if (fields[key] && fields[key].type === 'Pointer') {
      result[key] = transformResult(fields[key].targetClass, result[key], schema);
    }
  });
  return Object.assign({className}, result);
}

function toGraphQLResult(className, singleResult, schema) {
  return (restResult) => {
    const results = restResult.results;
    if (results.length == 0) {
      return [];
    }
    if (singleResult) {
      return transformResult(className, results[0], schema);
    }
    return transformResult(className, results, schema);
  }
}

function transform(constraintKey, currentValue) {
  let value = currentValue;
  if (constraintKey === 'nearSphere') {
    value = {
      latitude: currentValue.point.latitude,
      longitude: currentValue.point.longitude,
    }
  }
  const key = `$${constraintKey}`;

  return {
    key,
    value,
  }
}

function transformQuery(query) {
  Object.keys(query).forEach((key) => {
    Object.keys(query[key]).forEach((constraintKey) => {
      const constraint = query[key][constraintKey];
      delete query[key][constraintKey];
      const result = transform(constraintKey, constraint);
      query[key][result.key] = result.value;
    });
  });
  return query;
}

// Runs a find against the rest API
export function runFind(context, info, className, args, schema, restQuery) {
  let query = {};
  if (!restQuery) {
    if (args.where) {
      query = Object.assign(query, args.where);
    }
    if (args.objectId) {
      query = Object.assign(query, { objectId: args.objectId });
    }
    query = transformQuery(query, schema);
  } else {
    query = restQuery;
  }
  const options = getKeysForFind(info, schema, className);
  if (Object.prototype.hasOwnProperty.call(args, 'limit')) {
    options.limit = args.limit;
  }
  if (Object.prototype.hasOwnProperty.call(args, 'skip')) {
    options.skip = args.skip;
  }
  if (Object.prototype.hasOwnProperty.call(args, 'redirectClassNameForKey')) {
    options.redirectClassNameForKey = args.redirectClassNameForKey;
  }
  return rest.find(context.config, context.auth, className, query, options)
    .then(toGraphQLResult(className, false, schema));
}

// runs a get against the rest API
export function runGet(context, info, className, objectId, schema) {
  const options = getQueryOptions(info, 'object');
  return rest.get(context.config, context.auth, className, objectId, options)
    .then(toGraphQLResult(className, true, schema));
}
