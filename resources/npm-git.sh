#!/bin/sh -e

# This script maintains a git branch which mirrors master but in a form that
# what will eventually be deployed to npm, allowing npm dependencies to use:
#
#     "parse-server": "parseplatform/parse-server#latest"
#

# From: https://github.com/graphql/graphql-js/blob/master/resources/npm-git.sh

BUILD_DIR=latest

npm run build

mkdir -p $BUILD_DIR

cp package.json $BUILD_DIR/
cp README.md $BUILD_DIR/
cp LICENSE $BUILD_DIR/
cp PATENTS $BUILD_DIR/
cp CHANGELOG.md $BUILD_DIR/
cp -R lib $BUILD_DIR
cp -R bin $BUILD_DIR
cp -R public_html $BUILD_DIR
cp -R views $BUILD_DIR

cd $BUILD_DIR
git init
git config user.name "Travis CI"
git config user.email "github@fb.com"
git add .
git commit -m "Deploy master to LATEST branch"
git push --force --quiet "https://${GH_TOKEN}@github.com/parse-community/parse-server.git" master:latest
