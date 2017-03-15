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
#Temporyary work around: Remove once 
# A. optionsFromArguments gets pulled into the repo

WORKDIR /parse-server/node_modules/parse-server-s3-adapter/lib/

RUN rm optionsFromArguments.js && \
    wget https://raw.githubusercontent.com/mrmarcsmith/parse-server-s3-adapter/master/lib/optionsFromArguments.js

#return to where we were
WORKDIR /parse-server
#end Temp work araound

ENV PORT=1337

EXPOSE $PORT

ENTRYPOINT ["npm", "start", "--"]
