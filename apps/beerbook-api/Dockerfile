# beerbook-api — Node 20 Alpine, explicit tag for rollback
FROM node:20-alpine3.19
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev
COPY server.js ./
EXPOSE 3001
USER node
CMD ["node", "server.js"]
