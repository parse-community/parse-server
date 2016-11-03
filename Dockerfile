FROM node:boron

RUN mkdir -p /parse-server
COPY ./ /parse-server/

RUN mkdir -p /parse-server/config
VOLUME /parse-server/config

RUN mkdir -p /parse-server/cloud
VOLUME /parse-server/cloud

WORKDIR /parse-server

RUN npm install && \
    npm run build

ENV PORT=1337

EXPOSE $PORT

ENTRYPOINT ["npm", "start", "--"]
