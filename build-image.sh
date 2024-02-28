#!/bin/bash

# Read the version from package.json
VERSION=1.5.0
IMAGE=kristobalus/nitter-proxy
echo "building image $IMAGE using buildx..."

docker buildx create --use --name buildx_instance --driver docker-container --bootstrap
docker buildx build -f ./Dockerfile \
		--progress=plain \
		--build-arg VERSION="$VERSION" \
		--label "build-tag=build-artifact" \
		--platform linux/amd64 \
		-t $IMAGE:$VERSION \
		-t $IMAGE:latest \
		--push . || { echo "failed to build docker image"; exit 1; }

# commented out to keep cached layers
# docker buildx rm buildx_instance
docker image prune -f --filter label=build-tag=build-artifact
