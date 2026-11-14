# Build context is the repo root (see docker-compose.yml) so the API can use
# the shared validator and the same question files the tag uses.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY shared /app/shared
COPY frontend/public/questions /app/frontend/public/questions
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
