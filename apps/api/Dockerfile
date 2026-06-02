FROM node:20-alpine3.16
WORKDIR /app
RUN npm install -g pnpm@9
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "watch", "src/index.ts"]
