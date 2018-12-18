# https://medium.com/microscaling-systems/labelling-automated-builds-on-docker-hub-f3d073fb8e1
# https://docs.docker.com/docker-hub/builds/advanced/#environment-variables-for-building-and-testing

#!/bin/bash
echo "=> Building the binary with label"
docker build --label SOURCE_COMMIT=$SOURCE_COMMIT -f $DOCKERFILE_PATH -t $IMAGE_NAME .
