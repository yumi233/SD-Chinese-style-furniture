FROM node:20-bookworm-slim AS codex-tools
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex@0.159.2 && codex --version && npm cache clean --force

FROM node:20-bookworm-slim AS production

ARG APP_REVISION=development
ENV MUSHENG_RELEASE=$APP_REVISION

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV HISTORY_DATA_DIR=/app/data/history
ENV MODEL_CONFIG_FILE=/app/data/config.local.json
ENV USER_DATA_FILE=/app/data/users/users.json
ENV CODEX_CLI_MODEL=gpt-6.2-sol

COPY --from=codex-tools /usr/local/lib/node_modules/@openai /usr/local/lib/node_modules/@openai
COPY --from=codex-tools /etc/ssl/certs /etc/ssl/certs
RUN ln -s ../lib/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex && codex --version

COPY package*.json ./
# The pinned application dependencies include the offline review script converter.
RUN npm ci --omit=dev

COPY --chown=node:node . .
# Ship the English locale, indexed parent-image edits, cancellation, quota and Studio together;
# app.js versions their entire asset directory with APP_REVISION.
# Private task files include uploaded reference images and share the history volume.
RUN mkdir -p /app/data/history/tasks /app/data/users \
    && chmod 700 /app/data/history/tasks && chown -R node:node /app

RUN node -e 'const rows = require("./src/lib/designCatalog.json"); if (!rows.length || rows.some(r => !r.source.startsWith("https://"))) process.exit(1)'

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http'); const port=process.env.PORT||3000; http.get('http://127.0.0.1:'+port+'/api/v1/live', r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1));"

CMD ["node", "server.js"]
