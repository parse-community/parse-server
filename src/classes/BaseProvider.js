import { default as ServiceProviderInterface } from '../interfaces/ServiceProvider';
/**
 * A base provider class that allows for an abstraction of adapter implementations
 *
 * @class
 * @implements {ServiceProvider}
 * @param {Object} adapter - An adapter
 */
export class BaseProvider {
  constructor(adapter){
    if (adapter) {
        this.adapter = adapter;
    }
  }

  /**
   * Get the adapter
   *
   * @returns {Object} An adapter instance
   */
  getAdapter() {
      return this.adapter;
  }

  /**
   * Set the adapter
   *
   * @param {Object} adapter - An adapter
   */
  setAdapter(adapter) {
      this.adapter = adapter;
  }

  /**
   * Resolves the adapter
   *
   * @param {Object|String|Function} adapter - [1] An object implementing the adapter interface, or [2] a function that returns [1], or [3] A string of either the name of an included npm module or a path to a local module that returns [1] or [2].
   * @param {Object} options - An object passed to the adapter on instantiation (if adapter is not already instantiated)
   * @returns {Object} An object implementing the adapter interface
   */
  resolveAdapter(adapter, options) {
      // Support passing in adapter paths
      if (typeof adapter === 'string') {
          adapter = require(adapter);

          // TODO: Figure out a better way to deal with this
          if (adapter && adapter.default)
            adapter = adapter.default;
      }

      // Instantiate the adapter if the class got passed instead of an instance
      if (typeof adapter === 'function') {
          adapter = new adapter(options);
      }

      return adapter;
  }

  setup (config = {}, defaultConfig = {}) {
    this.config = Object.assign(defaultConfig, config);
    const adapter = this.resolveAdapter(this.config.adapter || this.DEFAULT_ADAPTER, this.config.options);
    this.setAdapter(adapter);
  }
}


export default BaseProvider;