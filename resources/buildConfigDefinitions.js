/**
 * Parse Server Configuration Builder
 *
 * This module builds the definitions file (src/Options/Definitions.js)
 * from the src/Options/index.js options interfaces.
 * The Definitions.js module is responsible for the default values as well
 * as the mappings for the CLI.
 *
 * To rebuild the definitions file, run
 * `$ node resources/buildConfigDefinitions.js`
 */
const parsers = require('../src/Options/parsers');

function last(array) {
  return array[array.length - 1];
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
function toENV(key) {
  let str = '';
  let previousIsUpper = false;
  for(let i = 0; i < key.length; i++) {
    const char = key[i];
    if (letters.indexOf(char) >= 0) {
      if (!previousIsUpper) {
        str += '_';
        previousIsUpper = true;
      }
    } else {
      previousIsUpper = false;
    }
    str += char;
  }
  return str.toUpperCase();
}

function getCommentValue(comment) {
  if (!comment) { return }
  return comment.value.trim();
}

function getENVPrefix(iface) {
  if (iface.id.name === 'ParseServerOptions') {
    return 'PARSE_SERVER_';
  }
  if (iface.id.name === 'CustomPagesOptions') {
    return 'PARSE_SERVER_CUSTOM_PAGES_';
  }
  if (iface.id.name === 'LiveQueryServerOptions') {
    return 'PARSE_LIVE_QUERY_SERVER_';
  }
  if (iface.id.name === 'LiveQueryOptions') {
    return 'PARSE_SERVER_LIVEQUERY_';
  }
}

function processProperty(property, iface) {
  const firstComment = getCommentValue(last(property.leadingComments || []));
  const lastComment = getCommentValue((property.trailingComments || [])[0]);
  const name = property.key.name;
  const prefix = getENVPrefix(iface);

  if (!firstComment) {
    return;
  }
  const components = firstComment.split(':ENV:').map((elt) => {
    return elt.trim();
  });
  let defaultValue;
  if (lastComment && lastComment.indexOf('=') >= 0) {
    const slice = lastComment.slice(lastComment.indexOf('=') + 1, lastComment.length).trim();
    defaultValue = slice;
  }
  const help = components[0];
  const env = components[1] || (prefix + toENV(name));
  let type = property.value.type;
  let isRequired = true;
  if (type == 'NullableTypeAnnotation') {
    isRequired = false;
    type = property.value.typeAnnotation.type;
  }
  return {
    name,
    env,
    help,
    type,
    defaultValue,
    types: property.value.types,
    typeAnnotation: property.value.typeAnnotation,
    required: isRequired
  };
}


function doInterface(iface) {
  return iface.body.properties
    .map((prop) => processProperty(prop, iface))
    .filter((e) => e !== undefined);
}

function mapperFor(elt, t) {
  const p = t.identifier('parsers');
  const wrap = (identifier) => t.memberExpression(p, identifier);

  if (t.isNumberTypeAnnotation(elt)) {
    return t.callExpression(wrap(t.identifier('numberParser')), [t.stringLiteral(elt.name)]);
  } else if (t.isArrayTypeAnnotation(elt)) {
    return wrap(t.identifier('arrayParser'));
  } else if (t.isAnyTypeAnnotation(elt)) {
    return wrap(t.identifier('objectParser'));
  } else if (t.isBooleanTypeAnnotation(elt)) {
    return wrap(t.identifier('booleanParser'));
  } else if (t.isGenericTypeAnnotation(elt)) {
    const type = elt.typeAnnotation.id.name;
    if (type == 'Adapter') {
      return wrap(t.identifier('moduleOrObjectParser'));
    }
    if (type == 'NumberOrBoolean') {
      return wrap(t.identifier('numberOrBooleanParser'));
    }
    return wrap(t.identifier('objectParser'));
  }
}

function parseDefaultValue(elt, value, t) {
  let litteralValue;
  if (t.isStringTypeAnnotation(elt)) {
    if (value == '""' || value == "''") {
      litteralValue = t.stringLiteral('');
    } else {
      litteralValue = t.stringLiteral(value);
    }
  } else if (t.isNumberTypeAnnotation(elt)) {
    litteralValue = t.numericLiteral(parsers.numberOrBoolParser('')(value));
  } else if (t.isArrayTypeAnnotation(elt)) {
    const array = parsers.objectParser(value);
    litteralValue = t.arrayExpression(array.map((value) => {
      if (typeof value == 'string') {
        return t.stringLiteral(value);
      } else {
        throw new Error('Unable to parse array');
      }
    }));
  } else if (t.isAnyTypeAnnotation(elt)) {
    litteralValue = t.arrayExpression([]);
  } else if (t.isBooleanTypeAnnotation(elt)) {
    litteralValue = t.booleanLiteral(parsers.booleanParser(value));
  } else if (t.isGenericTypeAnnotation(elt)) {
    const type = elt.typeAnnotation.id.name;
    if (type == 'NumberOrBoolean') {
      litteralValue = t.numericLiteral(parsers.numberOrBoolParser('')(value));
    }
    if (type == 'CustomPagesOptions') {
      const object = parsers.objectParser(value);
      const props = Object.keys(object).map((key) => {
        return t.objectProperty(key, object[value]);
      });
      litteralValue = t.objectExpression(props);
    }
  }
  return litteralValue;
}

function inject(t, list) {
  return list.map((elt) => {
    if (!elt.name) {
      return;
    }
    const props = ['env', 'help'].map((key) => {
      if (elt[key]) {
        return t.objectProperty(t.stringLiteral(key), t.stringLiteral(elt[key]));
      }
    }).filter((e) => e !== undefined);
    if (elt.required) {
      props.push(t.objectProperty(t.stringLiteral('required'), t.booleanLiteral(true)))
    }
    const action = mapperFor(elt, t);
    if (action) {
      props.push(t.objectProperty(t.stringLiteral('action'), action))
    }
    if (elt.defaultValue) {
      const parsedValue = parseDefaultValue(elt, elt.defaultValue, t);
      if (parsedValue) {
        props.push(t.objectProperty(t.stringLiteral('default'), parsedValue));
      } else {
        throw new Error(`Unable to parse value for ${elt.name} `);
      }
    }
    const obj = t.objectExpression(props);
    return t.objectProperty(t.stringLiteral(elt.name), obj);
  }).filter((elt) => {
    return elt != undefined;
  });
}

const makeRequire = function(variableName, module, t) {
  const decl = t.variableDeclarator(t.identifier(variableName),  t.callExpression(t.identifier('require'), [t.stringLiteral(module)]));
  return t.variableDeclaration('var', [decl])
}

const plugin = function (babel) {
  const t = babel.types;
  const moduleExports = t.memberExpression(t.identifier('module'), t.identifier('exports'));
  return {
    visitor: {
      Program: function(path) {
        // Inject the parser's loader
        path.unshiftContainer('body', makeRequire('parsers', './parsers', t));
      },
      ExportDeclaration: function(path) {
        // Export declaration on an interface
        if (path.node && path.node.declaration && path.node.declaration.type == 'InterfaceDeclaration') {
          const l = inject(t, doInterface(path.node.declaration));
          const id = path.node.declaration.id.name;
          const exports = t.memberExpression(moduleExports, t.identifier(id));
          path.replaceWith(
            t.assignmentExpression('=', exports, t.objectExpression(l))
          )
        }
      }
    }
  }
};

const auxiliaryCommentBefore = `
**** GENERATED CODE ****
This code has been generated by resources/buildConfigDefinitions.js
Do not edit manually, but update Options/index.js
`

const babel = require("babel-core");
const res = babel.transformFileSync('./src/Options/index.js', { plugins: [ plugin ], auxiliaryCommentBefore });
require('fs').writeFileSync('./src/Options/Definitions.js', res.code + '\n');
