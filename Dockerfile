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
#    - python3-venv: ENABLES CREATING VIRTUAL ENVIRONMENTS.
#    - build-essential & python3-dev: Crucial for compiling Python package C extensions
#      if pip needs to build them from source (often required for some dependencies).
#    - curl: General utility for downloading files if needed (e.g., alternative yt-dlp install).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \    # <-- CORRECTLY ADDED HERE
    build-essential \
    python3-dev \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 5. Create and use a Python virtual environment for yt-dlp
ENV VENV_PATH=/opt/venv
# Create the virtual environment
RUN python3 -m venv $VENV_PATH
# Install yt-dlp into the virtual environment using the venv's pip
RUN $VENV_PATH/bin/pip install --no-cache-dir yt-dlp
# Add the virtual environment's bin directory to the PATH
# This ensures that 'yt-dlp' calls use the one from the venv
ENV PATH="$VENV_PATH/bin:$PATH"

# 6. Verify installations (Optional but highly recommended for debugging build issues)
#    This helps confirm that the tools are installed and accessible in the PATH.
RUN ffmpeg -version
RUN yt-dlp --version  # This should now use the yt-dlp from the venv
RUN node --version
RUN npm --version
RUN python3 --version # This will be the system Python
RUN pip3 --version    # This will be the system pip (outside venv)
RUN which yt-dlp      # Should show path inside /opt/venv/bin/

# 7. Copy package.json and package-lock.json (if available)
#    This leverages Docker's layer caching.
COPY package*.json ./

# 8. Install Node.js application dependencies
#    --only=production ensures only production dependencies are installed.
RUN npm install --only=production --no-optional && npm cache clean --force

# 9. Copy the rest of your application code into the container's WORKDIR
COPY . .

# 10. Create the 'downloads' directory within the WORKDIR
#     This directory is used by server.js to store temporary downloads.
#     Ensure the Node.js process (running as 'node' user) has permissions to write to it.
RUN mkdir -p /usr/src/app/downloads && chown -R node:node /usr/src/app/downloads

# 11. Switch to a non-root user for security best practices
#     The official Node.js images create a 'node' user for this purpose.
USER node

# 12. Expose the port the app runs on internally within the container.
EXPOSE 3000

# 13. Define the command to run your application when the container starts.
#     This uses the "start" script defined in your package.json.
CMD [ "npm", "start" ]