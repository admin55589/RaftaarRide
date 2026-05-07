FROM node:20-alpine AS base
RUN npm install -g pnpm@10.26.1
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY artifacts/api-server/package.json ./artifacts/api-server/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS builder
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY tsconfig.json tsconfig.base.json ./
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

FROM node:20-alpine AS runner
RUN npm install -g pnpm@10.26.1
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json ./lib/db/
COPY artifacts/api-server/package.json ./artifacts/api-server/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
