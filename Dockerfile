# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Remove dev dependencies for production
RUN npm prune --production

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    git \
    bash \
    curl \
    jq \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S dguard && \
    adduser -S dguard -u 1001 -G dguard

WORKDIR /app

# Copy production dependencies and source
COPY --from=builder --chown=dguard:dguard /app/node_modules ./node_modules
COPY --chown=dguard:dguard . .

# Create necessary directories with proper permissions
RUN mkdir -p \
    reports \
    .audit-history \
    .audit-cache \
    logs \
    projects/backend \
    projects/frontend \
    projects/design-system \
    && chown -R dguard:dguard /app

# Switch to non-root user
USER dguard

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD npm run monitor:health || exit 1

# Expose port for web dashboard
EXPOSE 3000

# Default command
CMD ["npm", "run", "audit"]

# Labels for metadata
LABEL maintainer="Santiago García <santiago@dguard.com>"
LABEL version="1.0.0"
LABEL description="DGuard Ultra Audit Bot - Complete audit system for DGuard stack"
LABEL org.opencontainers.image.source="https://github.com/santiagogarcia/dguard-audit-bot"