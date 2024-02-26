#!/bin/sh -e
set -x
if [ "${GITHUB_ACTIONS}" = "" ];
then
  echo "Cannot release docs without GITHUB_ACTIONS set"
  exit 0;
fi
REPO="https://github.com/parse-community/parse-server"

rm -rf docs
git clone -b gh-pages --single-branch $REPO ./docs
cd docs
git pull origin gh-pages
cd ..

DEST="master"

if [ "${SOURCE_TAG}" != "" ];
then
  DEST="${SOURCE_TAG}"
  # change the default page to the latest
  echo "<meta http-equiv='refresh' content='0; url=/parse-server/api/${DEST}'>" > "docs/api/index.html"
fi

npm run definitions
npm run docs

mkdir -p "docs/api/${DEST}"
cp -R out/* "docs/api/${DEST}"
