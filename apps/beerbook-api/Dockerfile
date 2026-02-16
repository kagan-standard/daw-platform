# beerbook-api — Node 20 Alpine, explicit tag for rollback
FROM node:20-alpine3.19
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.js ./
COPY routes ./routes
EXPOSE 3001
USER node
CMD ["node", "server.js"]
