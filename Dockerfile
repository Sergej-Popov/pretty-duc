FROM oven/bun:1.3.10 AS build

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN bun install
RUN bun run build

FROM oven/bun:1.3.10 AS runtime

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends duc ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/bun.lock /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages

ENV PORT=3000
ARG DEPLOY_ENV
ENV DEPLOY_ENV=${DEPLOY_ENV}
EXPOSE 3000

CMD ["bun", "apps/api/dist/index.js"]
