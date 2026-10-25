FROM node:22-alpine
WORKDIR /app
COPY package.json core.mjs server.mjs monitor.mjs feeds.mjs integrations.mjs funds.mjs jewellers.mjs news-policy.mjs mint-prices.mjs telegram-test.mjs ./
COPY dist ./dist
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]
