# 1. Base Image: Use an official Node.js runtime.
FROM node:18-slim

# 2. Set Environment Variables
ENV NODE_ENV=production
ENV PORT=3000

# 3. Create app directory and set as working directory
WORKDIR /usr/src/app

# 4. Install system dependencies:
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    python3-dev \
    curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 5. Create and use a Python virtual environment for yt-dlp
ENV VENV_PATH=/opt/venv
RUN python3 -m venv $VENV_PATH
RUN $VENV_PATH/bin/pip install --no-cache-dir yt-dlp
ENV PATH="$VENV_PATH/bin:$PATH"

# 6. Verify installations
RUN ffmpeg -version
RUN yt-dlp --version
RUN node --version
RUN npm --version
RUN python3 --version
RUN pip3 --version
RUN which yt-dlp

# 7. Copy package.json and package-lock.json
COPY package*.json ./

# 8. Install Node.js application dependencies
RUN npm install --only=production --no-optional && npm cache clean --force

# 9. Copy the rest of your application code
COPY . .

# 10. Create the 'downloads' directory
RUN mkdir -p /usr/src/app/downloads && chown -R node:node /usr/src/app/downloads

# 11. Switch to a non-root user
USER node

# 12. Expose the port
EXPOSE 3000

# 13. Define the command to run your app
CMD [ "npm", "start" ]