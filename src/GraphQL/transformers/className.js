const transformClassNameToGraphQL = className => {
  if (className[0] === '_') {
    className = className.slice(1);
  }
  return className[0].toUpperCase() + className.slice(1);
};

export { transformClassNameToGraphQL };
