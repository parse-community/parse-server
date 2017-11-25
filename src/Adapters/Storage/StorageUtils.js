// Various Storage utilities

const Parse = require('parse/node').Parse;

export class StorageUtils {

  static getEmptyCLPs() {
    return Object.freeze({
      find: {},
      get: {},
      create: {},
      update: {},
      delete: {},
      addField: {},
    });
  }

  static getDefaultCLPs() {
    return Object.freeze({
      find: {'*': true},
      get: {'*': true},
      create: {'*': true},
      update: {'*': true},
      delete: {'*': true},
      addField: {'*': true},
    });
  }

  /**
   * Verifies unique coordinates
   *
   * @param {Object} coords Coords to verify uniqueness of
   */
  static verifyCoordinatesUnique(coords) {
    const unique = coords.filter((item, index, ar) => {
      let foundIndex = -1;
      for (let i = 0; i < ar.length; i += 1) {
        const pt = ar[i];
        if (pt[0] === item[0] &&
          pt[1] === item[1]) {
          foundIndex = i;
          break;
        }
      }
      return foundIndex === index;
    });
    if (unique.length < 3) {
      throw new Parse.Error(
        Parse.Error.INTERNAL_SERVER_ERROR,
        'GeoJSON: Loop must have at least 3 different vertices'
      );
    }
  }

  static getLanguageFromSearch(search) {
    if (search.$language && typeof search.$language !== 'string') {
      throw new Parse.Error(
        Parse.Error.INVALID_JSON,
        `bad $text: $language, should be string`
      );
    } else if (search.$language) {
      return search.$language;
    }
    return 'english'; // default lang
  }

}

export default StorageUtils;
