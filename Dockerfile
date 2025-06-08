# 1. Base Image: Use an official Node.js runtime.
# Using '-slim' for a smaller image size. Node 18 is a good LTS choice.
FROM node:18-slim

# 2. Set Environment Variables (Optional but good practice for consistency)
ENV NODE_ENV=production
ENV PORT=3000

# 3. Create app directory and set as working directory
WORKDIR /usr/src/app

# 4. Install system dependencies:
#    - ffmpeg: Essential for audio/video processing used by yt-dlp.
#    - python3 & python3-pip: To install and run yt-dlp (which is a Python application).
#    - build-essential & python3-dev: Crucial for compiling Python package C extensions
#      if pip needs to build them from source (often required for some dependencies).
#    - curl: General utility for downloading files if needed (e.g., alternative yt-dlp install).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    build-essential \
    python3-dev \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
# 5. Install yt-dlp using pip
#    The --no-cache-dir flag helps keep the image size down by not storing the download cache.
RUN pip3 install --no-cache-dir yt-dlp

# 6. Verify installations (Optional but highly recommended for debugging build issues)
#    This helps confirm that the tools are installed and accessible in the PATH.
RUN ffmpeg -version
RUN yt-dlp --version
RUN node --version
RUN npm --version
RUN python3 --version
RUN pip3 --version

# 7. Copy package.json and package-lock.json (if available)
#    This leverages Docker's layer caching. These files change less often than app code,
#    so their layer can be reused if they haven't changed, speeding up subsequent builds.
COPY package*.json ./

# 8. Install Node.js application dependencies
#    --only=production ensures only production dependencies are installed.
#    --no-optional skips optional dependencies.
#    npm cache clean --force helps reduce image size further.
RUN npm install --only=production --no-optional && npm cache clean --force


RUN mkdir -p /usr/src/app/downloads && chown -R node:node /usr/src/app/downloads

# 11. Switch to a non-root user for security best practices
#     The official Node.js images create a 'node' user for this purpose.
USER node

# 12. Expose the port the app runs on internally within the container.
#     Render (or other hosting platforms) will map an external port to this internal port.
#     This should match the PORT your application listens on (process.env.PORT || 3000).
EXPOSE 3000

# 13. Define the command to run your application when the container starts.
#     This uses the "start" script defined in your package.json.
CMD [ "npm", "start" ]