#!/bin/bash

# Read package exclusion list from arguments
exclusionList=("$@")

# Convert exclusion list to grep pattern
exclusionPattern=$(printf "|%s" "${exclusionList[@]}")
exclusionPattern=${exclusionPattern:1}

# Get list of all dev dependencies
devDeps=$(jq -r '.devDependencies | keys | .[]' package.json)

# Filter out exclusion list
depsToUninstall=$(echo "$devDeps" | grep -Ev "$exclusionPattern")

# If there are dependencies to uninstall then uninstall them
if [ -n "$depsToUninstall" ]; then
  echo "Uninstalling dev dependencies: $depsToUninstall"
  npm uninstall $depsToUninstall
else
  echo "No dev dependencies to uninstall"
fi
