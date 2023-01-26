############################################################
# Build stage
############################################################
FROM node:lts-alpine as build

RUN apk update; \
  apk add git;
WORKDIR /tmp

# Copy package.json first to benefit from layer caching
COPY package*.json ./

# Copy src to have config files for install
COPY . .

# Clean npm cache; added to fix an issue with the install process
RUN npm cache clean --force

# Install all dependencies
RUN npm ci

# Run build steps
RUN npm run build

############################################################
# Release stage
############################################################
FROM node:lts-alpine as release

RUN apk update; \
  apk add git;

VOLUME /parse-server/cloud /parse-server/config

WORKDIR /parse-server

COPY package*.json ./

# Clean npm cache; added to fix an issue with the install process
RUN npm cache clean --force
RUN npm ci --production --ignore-scripts

COPY bin bin
COPY public_html public_html
COPY views views
COPY --from=build /tmp/lib lib
RUN mkdir -p logs && chown -R node: logs

ENV PORT=1337
USER node
EXPOSE $PORT

ENTRYPOINT ["node", "./bin/parse-server"]
