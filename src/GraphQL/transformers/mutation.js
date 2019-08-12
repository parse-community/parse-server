const parseMap = {
  _op: '__op',
};

const transformMutationInputToParse = fields => {
  if (!fields || typeof fields !== 'object') {
    return;
  }
  Object.keys(fields).forEach(fieldName => {
    const fieldValue = fields[fieldName];
    if (parseMap[fieldName]) {
      delete fields[fieldName];
      fields[parseMap[fieldName]] = fieldValue;
    }
    if (typeof fieldValue === 'object') {
      transformMutationInputToParse(fieldValue);
    }
  });
};

export { transformMutationInputToParse };
