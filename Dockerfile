# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Create initial project embeddings
RUN npm run init-embeddings

# Stage 2: Production image
FROM node:22-alpine

WORKDIR /app

# Copy only necessary files from the builder stage
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/build ./build

# Install production dependencies
RUN npm ci --only=production

# Expose the application port
EXPOSE 3000

# Set the command to run the application
CMD ["node", "./build/server.js"]
