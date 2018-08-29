export * from 'graphql';

import {
  loadClass
} from './schemas/ParseClass';

export function getObjectType(name) {
  return loadClass(name).objectType;
}

export function getCreateInputType(name) {
  return loadClass(name).inputType;
}

export function getUpdateInputType(name) {
  return loadClass(name).updateType;
}
