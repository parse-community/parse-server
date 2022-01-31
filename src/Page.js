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

    this._id = id;
    this._defaultFile = defaultFile;
  }

  get id() {
    return this._id;
  }
  get defaultFile() {
    return this._defaultFile;
  }
  set id(v) {
    this._id = v;
  }
  set defaultFile(v) {
    this._defaultFile = v;
  }
}

export default Page;
