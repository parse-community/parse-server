############################################################
# Build stage
############################################################
# Runs on the platform of the build machine, also when building the image for
# another platform, so that no code runs under emulation; Node.js running under
# QEMU emulation can crash with an illegal instruction. Builders that don't set
# BUILDPLATFORM, like the legacy Docker builder, run it on their own platform.
FROM --platform=${BUILDPLATFORM:-linux} node:20.19.0-alpine3.20 AS build

RUN apk --no-cache add \
   build-base \
   git \
   python3

WORKDIR /tmp

# Copy package.json first to benefit from layer caching
COPY package*.json ./

# Copy src to have config files for install
COPY . .

# Increase npm network timeout and retries to tolerate network errors
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_retry_mintimeout=60000
ENV npm_config_fetch_retry_maxtimeout=300000

# Architecture of the image to build, set by BuildKit; builders that don't set
# it build the image for their own platform
ARG TARGETARCH

# Install production dependencies for the image platform without scripts
RUN arch="${TARGETARCH:-$(uname -m)}" \
 && case "$arch" in \
      amd64|x86_64) cpu=x64 ;; \
      arm64|aarch64) cpu=arm64 ;; \
      arm|armv6l|armv7l) cpu=arm ;; \
      ppc64le) cpu=ppc64 ;; \
      s390x) cpu=s390x ;; \
      *) echo "Unsupported target architecture: '$arch'" >&2; exit 1 ;; \
    esac \
 && npm ci --omit=dev --ignore-scripts --os=linux --cpu="$cpu" --libc=musl \
    # Copy production node_modules aside for later
 && cp -R node_modules prod_node_modules \
    # Install all dependencies
 && npm ci \
    # Run build steps
 && npm run build \
    # Create empty logs folder for the release stage
 && mkdir /logs

############################################################
# Release stage
############################################################
# Must not contain RUN instructions, because building the image for another
# platform than the one of the build machine would then require emulation.
FROM node:20.19.0-alpine3.20 AS release

VOLUME /parse-server/cloud /parse-server/config

WORKDIR /parse-server

# Copy build stage folders
COPY --from=build /tmp/prod_node_modules /parse-server/node_modules
COPY --from=build /tmp/lib lib

COPY package*.json ./
COPY bin bin
COPY public public
COPY views views
COPY --from=build --chown=node:node /logs logs

ENV PORT=1337
USER node
EXPOSE $PORT

ENTRYPOINT ["node", "./bin/parse-server"]
