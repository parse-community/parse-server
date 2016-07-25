class Id {
  className: string;
  objectId: string;

  constructor(className: string, objectId: string) {
    this.className = className;
    this.objectId = objectId;
  }
  toString(): string {
    return this.className + ':' + this.objectId;
  }

  static fromString(str: string) {
    var split = str.split(':');
    if (split.length !== 2) {
      throw new TypeError('Cannot create Id object from this string');
    }
    return new Id(split[0], split[1]);
  }
}

module.exports = Id;
