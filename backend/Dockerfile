# Built by docker-compose.yml with two extra build contexts, so the API uses
# the same validator (shared/) and question files as the tag:
#   docker build --build-context shared=../shared \
#                --build-context questions=../frontend/public/questions backend
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY --from=shared . /app/shared
COPY --from=questions . /app/frontend/public/questions
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
