# Start with a node image
FROM node

# Install MongoDB
RUN apt-get update
RUN apt-get -y install mongodb
CMD ["/usr/bin/mongod", "--config", "/etc/mongodb.conf"] 

# Setup project directory
RUN mkdir -p /usr/app
COPY . /usr/app
WORKDIR /usr/app

# Install all node_modules
RUN npm install

# Setup env variables passed along with `docker run`
ENV APP_ID myAppId
ENV MASTER_KEY mySecretMasterKey
ENV FILE_KEY optionalFileKey

# Expose the ports from Docker container to the VM
EXPOSE 8080 27017 

# We run index.js, but you should update this to the main
# file defined in `main` in package.json
CMD node index.js
