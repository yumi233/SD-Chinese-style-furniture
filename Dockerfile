FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV HISTORY_DATA_DIR=/app/data/history
ENV MODEL_CONFIG_FILE=/app/data/config.local.json
ENV USER_DATA_FILE=/app/data/users/users.json

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
RUN mkdir -p /app/data/history /app/data/users && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http'); const port=process.env.PORT||3000; http.get('http://127.0.0.1:'+port+'/api/v1/live', r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1));"

CMD ["node", "server.js"]
