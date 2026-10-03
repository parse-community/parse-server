// Cache the dynamic imports so the ESM-only graphql-upload modules are
// resolved once and then reused by both schema loading and request handling.
let graphqlUploadModulesPromise;

const loadGraphQLUploadModules = async () => {
  if (!graphqlUploadModulesPromise) {
    graphqlUploadModulesPromise = Promise.all([
      import('graphql-upload/GraphQLUpload.mjs'),
      import('graphql-upload/processRequest.mjs'),
    ]).then(([{ default: GraphQLUpload }, { default: processRequest }]) => ({
      GraphQLUpload,
      processRequest,
    }));
  }

  return graphqlUploadModulesPromise;
};

// Expose the Upload scalar lazily so the rest of Parse Server can stay on the
// current module system while graphql-upload is now ESM-only.
const getGraphQLUpload = async () => {
  const { GraphQLUpload } = await loadGraphQLUploadModules();
  return GraphQLUpload;
};

const createGraphQLUploadMiddleware = options => {
  const uploadOptions = {
    ...options,
    // Decode multipart filename parameters as UTF-8 so filenames like
    // "cafe.txt" with accents don't arrive as mojibake.
    defParamCharset: 'utf8',
  };

  return async (req, res, next) => {
    if (!req.is || !req.is('multipart/form-data')) {
      return next();
    }

    try {
      const { processRequest } = await loadGraphQLUploadModules();
      // graphql-upload parses the multipart body and populates req.body with
      // Upload promises before Apollo handles the GraphQL operation.
      req.body = await processRequest(req, res, uploadOptions);
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export { createGraphQLUploadMiddleware, getGraphQLUpload };
