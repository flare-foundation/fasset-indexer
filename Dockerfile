FROM node:current-alpine AS base
WORKDIR /app

FROM base AS builder
COPY . ./
ENV NODE_ENV=production
RUN yarn install --immutable
RUN yarn build
RUN yarn cache clean

FROM base AS runner
COPY --from=builder /app ./
