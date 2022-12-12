#!/bin/bash
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin 800116860238.dkr.ecr.us-west-2.amazonaws.com

docker build --platform linux/amd64 -t 800116860238.dkr.ecr.us-west-2.amazonaws.com/parse-server:0.30 .
docker push 800116860238.dkr.ecr.us-west-2.amazonaws.com/parse-server:0.30
docker rmi 800116860238.dkr.ecr.us-west-2.amazonaws.com/parse-server:0.30