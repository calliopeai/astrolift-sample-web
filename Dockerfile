# astrolift-sample-web — minimal stateless Node web service (R1).
#
# No dependencies, so no `npm install` step is needed; the source is the
# image. GIT_SHA is passed as a build-arg by .github/workflows/build.yml
# and baked in as an env var so /debug and /api/info report the commit
# the image was built from.
FROM node:20-bookworm-slim

# Build metadata (build-args -> baked env). Defaults keep `docker build`
# with no args working; CI passes the real values.
ARG GIT_SHA=dev
ARG IMAGE_REF=""
ARG BUILT_AT=""
ENV GIT_SHA=${GIT_SHA} \
    IMAGE_REF=${IMAGE_REF} \
    BUILT_AT=${BUILT_AT} \
    NODE_ENV=production \
    PORT=8080

WORKDIR /app

# Copy manifest first for layer-cache friendliness, then the source.
COPY package.json ./
COPY app/ ./app/

# Run as the unprivileged user shipped in the base image.
USER node

EXPOSE 8080

CMD ["node", "app/server.js"]
