/**
 * Interface for service providers
 *
 * @interface
 */
export class ServiceProvider {
  /**
   * Get the adapter
   *
   * @returns {Object} An adapter instance
   */
  getAdapter() {
    throw new Error('A service provider must implement getAdapter!');
  }

  /**
   * Set the adapter
   *
   * @param {Object} An adapter
   */
  setAdapter() {
    throw new Error('A service provider must implement setAdapter!');
  }
  /**
   * Resolves the adapter from the first parameter
   *
   * @param {Any}
   */
  resolveAdapter() {
    throw new Error('A service provider must implement resolveAdapter!');
  }
  setup() {
    throw new Error('A service provider must implement setup!');
  }
}

export default ServiceProvider;