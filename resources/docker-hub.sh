docker login -e="$DOCKER_EMAIL" -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"
docker build -t parseplatform/parse-server:$TRAVIS_TAG .
docker push parseplatform/parse-server:$TRAVIS_TAG
