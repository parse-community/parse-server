export default options => {
  if (!options) {
    return undefined;
  }

  if (typeof options === 'string') {
    //Configuring via module name with no options
    return require(options)();
  }

  if (!options.module && !options.class) {
    //Configuring via object
    return options;
  }

  if (options.module) {
    //Configuring via module name + options
    return require(options.module)(options.options)
  }

  if (options.class) {
    //Configuring via class + options
    return options.class(options.options);
  }
}
