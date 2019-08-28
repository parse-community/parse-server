import Parse from 'parse/node';

const getClass = async (name, schema) => {
  try {
    return await schema.getOneSchema(name, true);
  } catch (e) {
    if (e === undefined) {
      throw new Parse.Error(
        Parse.Error.INVALID_CLASS_NAME,
        `Class ${name} does not exist.`
      );
    } else {
      throw new Parse.Error(
        Parse.Error.INTERNAL_SERVER_ERROR,
        'Database adapter error.'
      );
    }
  }
};

export { getClass };
