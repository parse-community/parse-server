function last(array) {
  return array[array.length - 1];
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
function toENV(key) {
  var str = '';
  let previousIsUpper = false;
  for(let i = 0; i < key.length; i++) {
    const char = key[i];
    if (letters.indexOf(char) >= 0) {
      if (!previousIsUpper) {
        str += "_"
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
  if (iface.id.name === 'ParseServerCLIOptions') {
    return 'PARSE_SERVER_';
  }
  if (iface.id.name === 'CustomPagesOptions') {
    return 'PARSE_SERVER_CUSTOM_PAGES_';
  }
}

function processProperty(property, iface) {
  const firstComment = getCommentValue(last(property.leadingComments || []));
  const name = property.key.name;
  const prefix = getENVPrefix(iface);

  if (!firstComment) {
    return;
  }
  const components = firstComment.split(':ENV:').map((elt) => {
    return elt.trim();
  });
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
    types: property.value.types,
    typeAnnotation: property.value.typeAnnotation,
    required: isRequired
  };
}


function doInterface(iface) {
  return iface.body.properties.map((prop) => {
    return processProperty(prop, iface);
  }).filter((e) => e !== undefined);
}

function mapperFor(elt, t) {
  const p = t.identifier('parsers');
  const wrap = function(identifier) {
    return t.memberExpression(p, identifier);
  }
  if (elt.type == 'StringTypeAnnotation') {
    return; // do not map strings
  }
  if (elt.type == 'NumberTypeAnnotation') {
    return t.callExpression(wrap(t.identifier('numberParser')), [t.stringLiteral(elt.name)]);
  }
  if (elt.type == 'TupleTypeAnnotation') {
    return wrap(t.identifier('arrayParser'));
  }

  if (elt.type == 'AnyTypeAnnotation') {
    return wrap(t.identifier('objectParser'));
  }

  if (elt.type == 'BooleanTypeAnnotation') {
    return wrap(t.identifier('booleanParser'));
  }
  if (elt.type == 'GenericTypeAnnotation') {
    const type = elt.typeAnnotation.id.name;
    if (type == 'Adapter') {
      return wrap(t.identifier('moduleOrObjectParser'));
    }
    if (type == 'NumberOrBoolean') {
      return wrap(t.identifier('numberOrBooleanParser'));
    }
    return wrap(t.identifier('objectParser'));
  }

  if (elt.type == 'FunctionTypeAnnotation') {
    return;
  }
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
    const obj = t.objectExpression(props);
    return t.objectProperty(t.stringLiteral(elt.name), obj);
  }).filter((elt) => {
    return elt != undefined;
  });
}


const plugin = function (babel) {
  const t = babel.types;
  const moduleExports = t.memberExpression(t.identifier('module'), t.identifier('exports'));
  return {
    visitor: {
      Program: function(path) {
        path.pushContainer("body", t.importDeclaration([t.importNamespaceSpecifier(t.identifier('parsers'))],
          t.stringLiteral('./cli/utils/parsers')));
      },
      ExportDeclaration: function(path) {
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

const babel = require("babel-core");
const res = babel.transformFileSync('./src/Options.js', { plugins: [ plugin ], auxiliaryCommentBefore: 'GENERATED CODE'});
require('fs').writeFileSync('./src/Definitions.js', res.code + '\n');
