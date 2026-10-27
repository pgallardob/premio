FROM node:24.22.1-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data BACKUP_DIR=/app/backups
WORKDIR /app
RUN mkdir -p /app/data /app/backups && chown -R node:node /app
COPY --chown=node:node package.json package-lock.json ./
USER node
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node config ./config
COPY --chown=node:node assets ./assets
COPY --chown=node:node img ./img
COPY --chown=node:node scripts/setup.js scripts/backup.js scripts/reset-data.js scripts/production-check.js scripts/healthcheck.js ./scripts/
COPY --chown=node:node index.html admin.html cupon.html cartel.html instalar.html offline.html manifest.webmanifest sw.js ./
EXPOSE 8080
CMD ["node", "server/index.js"]
