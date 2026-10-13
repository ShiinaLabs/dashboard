# ── Stage 1: Build ─────────────────────────────────────────────────
FROM --platform=linux/amd64 reg.mikumikumi.xyz/mirror/node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Keep every Node process on a tight heap so the memory-limited CI kaniko
# container never sees a runaway V8 allocation. The React Router build is
# split into client (512 MB heap) and SSR (192 MB heap) passes via the
# patched @react-router/dev + RR_SKIP_* env vars; each script carries its own
# NODE_OPTIONS which overrides this baseline.
ENV NODE_OPTIONS=--max-old-space-size=256
RUN corepack enable
WORKDIR /app

# Install deps first for better layer reuse. Serialize build scripts
# (node-gyp for argon2, sharp prebuilds, esbuild, unrs-resolver) so native
# compiles never run in parallel and spike memory.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --child-concurrency=1 --network-concurrency=4

# Copy source; build client + SSR in separate passes.
# Type checking remains in CI because the full tsc pass has a higher memory
# requirement than the production build.
COPY . .
RUN pnpm build

# ── Stage 2: Isolated production dependencies ───────────────────────
FROM --platform=linux/amd64 reg.mikumikumi.xyz/mirror/node:24-bookworm-slim AS prod-deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY scripts/prune-runtime-dependencies.sh ./scripts/prune-runtime-dependencies.sh
RUN pnpm install --prod --frozen-lockfile --child-concurrency=1 --network-concurrency=4 \
  && sh ./scripts/prune-runtime-dependencies.sh ./node_modules

# ── Stage 3: Distroless runtime ─────────────────────────────────────
FROM --platform=linux/amd64 gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9eeb7f5887d0e239e78264b06f7f11d2e14be534050481803a9e4728fcdd278e AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV NODE_OPTIONS=--max-old-space-size=256

COPY --from=prod-deps --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=base --chown=1001:1001 /app/build ./build
COPY --from=base --chown=1001:1001 /app/public/a/t.js ./build/client/a/t.js
COPY --from=base --chown=1001:1001 /app/server ./server
COPY --from=base --chown=1001:1001 /app/package.json ./package.json
COPY --chown=1001:1001 docker/runtime-data/ ./data/

USER 1001:1001
EXPOSE 3000
CMD ["/app/server/index.mjs"]
