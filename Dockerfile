# Debian (glibc) base: onnxruntime-node and sharp ship glibc native binaries
# that fail to load on Alpine's musl. Node 24 also matches the dev toolchain.
FROM node:24-slim

WORKDIR /app

COPY package*.json ./
# npm install (not ci): the lockfile is generated on Windows, which omits
# Linux-only optional deps (@emnapi) and makes strict npm ci fail in the container
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "src/server.js"]