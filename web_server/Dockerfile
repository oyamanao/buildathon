# Use a lightweight Node image
FROM node:20-alpine

# Install Python and build tools for native node modules (needed for better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 1. Copy both package files first to leverage Docker cache
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# 2. Install dependencies for both (this will compile better-sqlite3 for the Alpine architecture)
WORKDIR /app/client
RUN npm ci

WORKDIR /app/server
RUN npm ci

# 3. Copy project files
WORKDIR /app
COPY client/ ./client/
COPY server/ ./server/

# 4. Build the client app
WORKDIR /app/client
RUN npm run build

# 5. Switch to server directory
WORKDIR /app/server

# Expose the server port
EXPOSE 3000

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Set up a data directory for the persistent SQLite Database
RUN mkdir -p /data
# Give correct permissions
RUN chown -R node:node /data
ENV DB_PATH=/data/echo_blade.db

# Run the server
CMD ["node", "index.js"]
