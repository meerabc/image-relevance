# Debian (glibc) base: onnxruntime-node and sharp ship glibc native binaries
# that fail to load on Alpine's musl. Node 24 also matches the dev toolchain.
FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

# the corpus of images is expected to be volume-mounted or baked in
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "src/server.js"]
