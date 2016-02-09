import { default as BaseProvider } from './BaseProvider';

/**
* Abstract class the provides a reference to an adapter instance (a caching implementation)
*
* @class
* @extends {BaseProvider}
* @param {Object} adapter - A cache adapter
*/
export class CacheProvider extends BaseProvider {}

export default new CacheProvider();