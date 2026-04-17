# syntax=docker/dockerfile:1

# Stage 1: Build the React application
# Note: If base image download is slow, ensure you have configured Docker registry mirrors in /etc/docker/daemon.json
FROM node:20-alpine as build

WORKDIR /app

# Set npm registry to a faster mirror (TaoBao/Aliyun mirror) to speed up download
RUN npm config set registry https://registry.npmmirror.com

# Copy package.json
COPY package*.json ./

# Install dependencies with cache mount to speed up subsequent builds
# --mount=type=cache stores the npm cache in a persistent volume managed by Docker
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve the application with Node.js static server and API proxy
FROM node:20-alpine

WORKDIR /app

# Copy the build output and runtime server
COPY --from=build /app/dist ./dist
COPY server.js ./server.js

# Expose port 80
EXPOSE 80

# Start runtime server
CMD ["node", "server.js"]
