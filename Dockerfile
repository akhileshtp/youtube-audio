# 1. Base Image: Use an official Node.js runtime.
FROM node:18-slim

# 2. Set Environment Variables
ENV NODE_ENV=production
ENV PORT=3000

# 3. Create app directory and set as working directory
WORKDIR /usr/src/app

# 4. Install system dependencies: ffmpeg, python3, pip, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 5. Install yt-dlp using pip
RUN pip3 install --no-cache-dir yt-dlp

# Verify installations (optional, good for debugging build)
RUN ffmpeg -version
RUN yt-dlp --version

# 6. Copy package.json and package-lock.json (if available)
COPY package*.json ./

# 7. Install Node.js application dependencies
RUN npm install --only=production --no-optional && npm cache clean --force

# 8. Copy the rest of your application code into the container
COPY . .

# 9. Create the 'downloads' directory and set permissions
# This directory is used by server.js to store temporary downloads
RUN mkdir -p /usr/src/app/downloads && chown -R node:node /usr/src/app/downloads

# 10. Switch to a non-root user for security
USER node

# 11. Expose the port the app runs on
EXPOSE 3000

# 12. Define the command to run your app
CMD [ "npm", "start" ]