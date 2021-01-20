/*eslint no-unused-vars: "off"*/
/**
 * @interface Page
 * Page
 * Page content that is returned by PageRouter.
 */
export class Page {
  /**
   * @description Creates a page.
   * @param {Object} params The page parameters.
   * @param {String} params.id The page identifier.
   * @param {String} params.defaultFile The page file name.
   * @returns {Page} The page.
   */
  constructor(params = {}) {
    const { id, defaultFile } = params;

    this.id = id;
    this.defaultFile = defaultFile;
  }
}

export default Page;
