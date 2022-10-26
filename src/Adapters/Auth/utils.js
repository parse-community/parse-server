exports.isJSON = string => {
  try {
    JSON.parse(string);
  } catch (e) {
    return false;
  }
  return true;
};
