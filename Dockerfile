# https://blog.hasura.io/an-exhaustive-guide-to-writing-dockerfiles-for-node-js-web-apps-bbee6bd2f3c4
# https://codefresh.io/docker-tutorial/node_docker_multistage/


# ------- Stage 1 - Base ---------
FROM node:carbon-alpine as base
# apk - https://www.cyberciti.biz/faq/10-alpine-linux-apk-command-examples/
# RUN apk update && apk upgrade && \
#     apk add --no-cache git bash
# python make and g++  - add this for bcrypt 3.x 

# ENV, WORKDIR & COPY commands run as USER root
# to change ownership run chown (e.g. chown USER node /parse_server) after every command

# after this refer to workdir using ./
WORKDIR /parse-server

# specify multiple volumes in one line - reuse layers during build
VOLUME ["parse-server/config", "parse-server/cloud"]

# copy all package.json-related files
COPY package.json ./


# ------- Stage 2 - Dependencies ---------
# base image for release stage with only prod dependencies
FROM base AS dependencies
# set npm configs 
RUN npm set progress=false && npm config set depth 0
# install production packages only
RUN npm install --production 


# ------- Stage 3 - Build ---------
FROM dependencies AS build
# install all npm required for build (and testing) - saves build time since prod dependencies are already installed
RUN npm install 
# copy all context into WORKDIR (/parse-server) excluding items in .dockerignore
COPY . .
# Need to run build explicitly as npm will not auto run scripts as ROOT
# https://stackoverflow.com/questions/47748075/npm-postinstall-not-running-in-docker
# https://docs.npmjs.com/misc/scripts#user
RUN npm run prepare && npm run postinstall
# list all dir/files  - for debugging purposes
# RUN ls -al

# UNIT TESTS
# if you want to perform unit testing, do it in the build stage (tests won't be cached, since the build stage cache is invalidated when files change)
# do not run flow through npm - https://github.com/facebook/flow/issues/3649
# RUN npm test

# ------- Stage 4 - Release ---------
FROM dependencies AS release
# lib is the output from babel in the build step
COPY --from=build /parse-server/lib ./lib
# copy required files listed in package.json -> files
COPY /bin ./bin
COPY /public_html ./public_html
COPY /views ./views
# COPY postinstall.js ./
# COPY PATENTS LICENSE *.md ./
# list all dir/files  - for debugging purposes
# RUN ls -al

# capture git_commit in label
# This is used in the script in /hooks/build.sh which is a trigger used in dockerhub builds
# ARG SOURCE_COMMIT
# LABEL SOURCE_COMMIT=$SOURCE_COMMIT

# run as non-root. USER node is provided with node images
# https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#non-root-user
USER node

#EXPOSE - informational ony
EXPOSE 1337

# https://www.ctl.io/developers/blog/post/dockerfile-entrypoint-vs-cmd/
# start with node, not npm
ENTRYPOINT ["node", "./bin/parse-server", "--"]

# BUILD: docker build -t parse-platform/parse-server:test --build-arg SOURCE_COMMIT=$(git log -1 --format=%H) .
# docker build -t local/parse-server:local --build-arg GIT_COMMIT=$(git log -1 --format=%H) .
# RUN (entrypoint sh): sudo docker run --name parse-server --rm -it --entrypoint sh barakbd/parse-server:test
# to stop at a specific steps add --target flag
# sudo docker build --target release -t barakbd/parse-server:test .
