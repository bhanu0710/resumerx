# multi-stage build so the runtime image stays small-ish
# (chromium + fonts already pushes us past 400MB — we fight that where we can)

FROM node:20-slim AS builder
WORKDIR /app

# install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# copy manifests from the whole workspace so pnpm can resolve the workspace dep
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/pdf-service/package.json ./apps/pdf-service/

RUN pnpm install --frozen-lockfile

# copy sources
COPY packages/shared ./packages/shared
COPY apps/pdf-service ./apps/pdf-service

# build shared first so pdf-service can consume the dist/ output
RUN pnpm --filter @resumerx/shared build
RUN pnpm --filter @resumerx/pdf-service build

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app

# chromium + the fonts it actually needs. Without these fonts, puppeteer
# renders squares for anything non-latin. Took me half a day to figure out.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgbm1 \
    libnss3 \
    libxss1 \
    ca-certificates \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

# tell puppeteer where chromium lives
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# copy only what we need to run
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/pdf-service/package.json ./apps/pdf-service/
COPY --from=builder /app/apps/pdf-service/dist ./apps/pdf-service/dist

# install prod deps only (skip dev, skip the lockfile-based recursive install for brevity)
RUN pnpm install --prod --frozen-lockfile --filter @resumerx/pdf-service...

# unprivileged user — running chromium as root is a bad idea
RUN groupadd --gid 1001 nodeapp && useradd --uid 1001 --gid nodeapp --shell /bin/bash --create-home nodeapp \
  && chown -R nodeapp:nodeapp /app
USER nodeapp

EXPOSE 3001

# dumb-init handles signals properly so puppeteer zombies don't pile up
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/pdf-service/dist/index.js"]
