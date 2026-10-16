# SPDX-License-Identifier: AGPL-3.0-or-later
# Based on Abyssal Claims — © 2026 Michal Mazurowski — https://something-rare.com
#
# Abyssal Claims Tools: one container serving the static app and POST /api/fetch.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Browser libraries are devDependencies (vite bundles them); the server needs only express.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
CMD ["node", "dist-server/server/index.js"]
