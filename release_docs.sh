#!/bin/sh -e
set -x
# GITHUB_ACTIONS=true SOURCE_TAG=test ./release_docs.sh

if [ "${GITHUB_ACTIONS}" = "" ];
then
  echo "Cannot release docs without GITHUB_ACTIONS set"
  exit 0;
fi
if [ "${SOURCE_TAG}" = "" ];
then
  echo "Cannot release docs without SOURCE_TAG set"
  exit 0;
fi
REPO="https://github.com/parse-community/parse-server"

rm -rf docs
git clone -b gh-pages --single-branch $REPO ./docs
cd docs
git pull origin gh-pages
cd ..

RELEASE="release"
VERSION="${SOURCE_TAG}"

# change the default page to the latest
echo "<meta http-equiv='refresh' content='0; url=/parse-server/api/${VERSION}'>" > "docs/api/index.html"

npm run definitions
npm run docs

mkdir -p "docs/api/${RELEASE}"
cp -R out/* "docs/api/${RELEASE}"

mkdir -p "docs/api/${VERSION}"
cp -R out/* "docs/api/${VERSION}"

# Copy other resources
RESOURCE_DIR=".github"
mkdir -p "docs/${RESOURCE_DIR}"
cp "./.github/parse-server-logo.png" "docs/${RESOURCE_DIR}/"
