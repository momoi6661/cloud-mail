FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@11.25.0

COPY mail-worker/package.json mail-worker/pnpm-lock.yaml ./mail-worker/
RUN pnpm --dir mail-worker install --frozen-lockfile --ignore-scripts

COPY mail-vue/package.json mail-vue/pnpm-lock.yaml ./mail-vue/
RUN pnpm --dir mail-vue install --frozen-lockfile --ignore-scripts

COPY server/package.json server/pnpm-lock.yaml ./server/
RUN pnpm --dir server install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm --dir mail-vue build

FROM node:22-bookworm-slim

WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /app/server/data

EXPOSE 8787 2525
VOLUME ["/app/server/data"]

CMD ["node", "--no-warnings", "--import", "tsx", "src/main.js"]
