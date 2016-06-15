import { destroyAllDataPermanently } from './DatabaseAdapter';

let unsupported = function() {
  throw 'Only supported in test environment';
};

let _destroyAllDataPermanently;
if (process.env.TESTING) {
  _destroyAllDataPermanently = destroyAllDataPermanently;
} else {
  _destroyAllDataPermanently = unsupported;
}

export default {
    destroyAllDataPermanently: _destroyAllDataPermanently};
