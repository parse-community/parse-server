#!/bin/bash
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin 967556865693.dkr.ecr.ap-southeast-1.amazonaws.com

docker build --platform linux/amd64 -t 967556865693.dkr.ecr.ap-southeast-1.amazonaws.com/parse-server:0.47 .
docker push 967556865693.dkr.ecr.ap-southeast-1.amazonaws.com/parse-server:0.47
docker rmi 967556865693.dkr.ecr.ap-southeast-1.amazonaws.com/parse-server:0.47