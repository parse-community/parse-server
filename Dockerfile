FROM node:lts-alpine as build

RUN apk update; \
  apk add git;

WORKDIR /tmp
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:lts-alpine as release

WORKDIR /parse-server
VOLUME ['/parse-server/cloud', '/parse-server/config']

COPY package*.json ./
RUN npm ci --production

COPY bin bin
COPY public_html public_html
COPY views views
COPY --from=build /tmp/lib lib

ENV PORT=1337

RUN mkdir -p logs
RUN chown -R node: logs

USER node

EXPOSE $PORT

ENTRYPOINT ["node", "./bin/parse-server"]

