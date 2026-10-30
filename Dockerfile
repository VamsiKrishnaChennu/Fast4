# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --ignore-scripts
COPY shared shared
COPY client client
RUN npm run build --workspace client

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --ignore-scripts --workspace server --workspace shared
COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "server/src/index.js"]
