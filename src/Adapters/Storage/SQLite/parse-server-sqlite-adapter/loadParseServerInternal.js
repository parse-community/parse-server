"use strict";

const path = require("path");

function isMissingModuleError(error, request) {
  return (
    error &&
    error.code === "MODULE_NOT_FOUND" &&
    typeof error.message === "string" &&
    error.message.includes(`'${request}'`)
  );
}

// Prefer the host app's installed parse-server package.
// Fall back to this repo layout so the package can be exercised in-tree.
function loadParseServerInternal(modulePath) {
  const packageRequest = `parse-server/${modulePath}`;
  try {
    return require(packageRequest);
  } catch (error) {
    if (!isMissingModuleError(error, packageRequest)) {
      throw error;
    }
  }

  const localRequest = path.join(__dirname, "../../../../..", modulePath);
  try {
    return require(localRequest);
  } catch (error) {
    if (!isMissingModuleError(error, localRequest)) {
      throw error;
    }
    error.message = `Failed to load ${packageRequest}. Install this adapter next to a compatible parse-server package. Original error: ${error.message}`;
    throw error;
  }
}

module.exports = {
  loadParseServerInternal,
};
