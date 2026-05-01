FROM node:20-slim

RUN npm install -g pnpm@10.26.1

WORKDIR /app

COPY . .

# Install ALL dependencies including devDependencies (needed for build tools like esbuild)
RUN NODE_ENV=development pnpm install --no-frozen-lockfile

# Build the API server
RUN pnpm --filter @workspace/api-server run build

EXPOSE 8080

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
