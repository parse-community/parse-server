############################################################
# Build stage
############################################################
FROM node:lts-alpine AS build

RUN apk --no-cache add git
WORKDIR /tmp

# Copy package.json first to benefit from layer caching
COPY package*.json ./

# Copy src to have config files for install
COPY . .

# Install without scripts
RUN npm ci --omit=dev --ignore-scripts \
    # Copy production node_modules aside for later
 && cp -R node_modules prod_node_modules \
    # Install all dependencies
 && npm ci \
    # Run build steps
 && npm run build

############################################################
# Release stage
############################################################
FROM node:lts-alpine AS release

VOLUME /parse-server/cloud /parse-server/config

WORKDIR /parse-server

# Copy build stage folders
COPY --from=build /tmp/prod_node_modules /parse-server/node_modules
COPY --from=build /tmp/lib lib

COPY package*.json ./
COPY bin bin
COPY public_html public_html
COPY views views
RUN mkdir -p logs && chown -R node: logs

ENV PORT=1337
USER node
EXPOSE $PORT

ENTRYPOINT ["node", "./bin/parse-server"]
