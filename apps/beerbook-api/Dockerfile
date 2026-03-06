# beerbook-api — Node 20 Alpine, explicit tag for rollback
FROM node:20-alpine3.19
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY routes ./routes
COPY public ./public
EXPOSE 3001
RUN mkdir -p /data/uploads && chmod 777 /data/uploads
USER node
CMD ["node", "server.js"]
