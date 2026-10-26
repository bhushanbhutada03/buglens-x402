FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and workspace package files
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci

# Copy server source and build
COPY server/ ./server/
WORKDIR /app/server
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# Create non-root user
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D nodejs

COPY --chown=nodejs:nodejs server/package.json ./
RUN npm install --omit=dev

COPY --chown=nodejs:nodejs --from=builder /app/server/dist ./dist

USER nodejs

EXPOSE 8787

CMD ["node", "dist/index.js"]
