const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors'); // For handling Cross-Origin Resource Sharing
const os = require('os'); // For temporary directory

const app = express();
const port = process.env.PORT || 3000; // Use Render's port or 3000 for local

// Ensure yt-dlp and ffmpeg are in your system's PATH (handled by Dockerfile for Render)
const YTDLP_PATH = 'yt-dlp';
const FFMPEG_PATH = 'ffmpeg'; // Implicitly used by yt-dlp

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static frontend files

// The 'downloads' directory inside the container will be ephemeral on Render.
// This is fine if we serve the file and then it's implicitly cleaned up on container restart,
// or if we explicitly delete it. For this app, we'll serve and let Render handle cleanup.
const downloadsDir = path.join(__dirname, 'downloads'); // This should match Dockerfile RUN mkdir
if (!fs.existsSync(downloadsDir)) {
    try {
        fs.mkdirSync(downloadsDir, { recursive: true });
        console.log(`Created downloads directory: ${downloadsDir}`);
    } catch (err) {
        console.error(`Error creating downloads directory ${downloadsDir}:`, err);
        // If this fails on startup in Render, the Dockerfile should have already created it.
    }
}


// Function to sanitize filename parts (less aggressive than before, focusing on path traversal)
function sanitizePathSegment(segment) {
    return segment.replace(/[\/\0]/g, '_'); // Replace slashes and null bytes
}

app.post('/download-audio', async (req, res) => {
    const { youtubeUrl, format = 'mp3' } = req.body;

    if (!youtubeUrl) {
        return res.status(400).json({ success: false, message: 'YouTube URL is required.' });
    }
    console.log(`Received request for URL: ${youtubeUrl}, Format: ${format}`);

    let videoTitle = 'youtube_audio';
    let videoId = Date.now().toString();
    let actualOutputFilename;

    try {
        const infoProcess = spawn(YTDLP_PATH, ['--get-title', '--get-id', youtubeUrl]);
        let infoData = '';
        for await (const chunk of infoProcess.stdout) infoData += chunk;
        let infoError = '';
        for await (const chunk of infoProcess.stderr) infoError += chunk;
        const exitCodeInfo = await new Promise((resolve) => infoProcess.on('close', resolve));

        if (exitCodeInfo === 0 && infoData.trim()) {
            const lines = infoData.trim().split('\n');
            videoTitle = sanitizePathSegment(lines[0] || videoTitle);
            videoId = sanitizePathSegment(lines[1] || videoId);
        } else {
            console.warn(`yt-dlp (get-info) failed or returned no data. Code: ${exitCodeInfo}, Stderr: ${infoError}`);
            const match = youtubeUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
            if (match && match[1]) videoId = sanitizePathSegment(match[1]);
        }
    } catch (error) {
        console.error('Error getting video info:', error);
    }

    const tempFilenameBase = `${videoTitle}_${videoId}_${Date.now()}`;
    const outputTemplate = path.join(downloadsDir, `${tempFilenameBase}.%(ext)s`);
    const expectedOutputFilePath = path.join(downloadsDir, `${tempFilenameBase}.${format}`);

    const args = [
        '-x',
        '--audio-format', format,
        '--audio-quality', '0',
        '--no-playlist', // Ensure only single video is downloaded if URL is part of playlist
        '--embed-thumbnail', // Optional: embeds thumbnail
        // '--ppa', `ffmpeg:"-ac 2 -ar 44100"`, // Optional: Standardize audio - remove if causing issues
        '-o', outputTemplate,
        youtubeUrl,
    ];

    console.log(`Executing: ${YTDLP_PATH} ${args.join(' ')}`);
    const ytDlpProcess = spawn(YTDLP_PATH, args);

    let stdoutData = '';
    ytDlpProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        // console.log(`yt-dlp stdout: ${data}`); // Can be very verbose
    });

    let stderrData = '';
    ytDlpProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        // console.error(`yt-dlp stderr: ${data}`); // Can be very verbose
    });

    ytDlpProcess.on('close', (code) => {
        console.log(`yt-dlp process exited with code ${code}.`);
        if (stderrData.length > 0) console.error("yt-dlp stderr output:\n", stderrData);
        if (stdoutData.length > 0) console.log("yt-dlp stdout output:\n", stdoutData);


        if (code === 0) {
            let foundFile = null;
            // Check for the exact expected file first
            if (fs.existsSync(expectedOutputFilePath)) {
                foundFile = expectedOutputFilePath;
            } else {
                // Fallback: yt-dlp might use a slightly different extension or name
                // Search for files starting with the tempFilenameBase in downloadsDir
                try {
                    const files = fs.readdirSync(downloadsDir);
                    const matchedFile = files.find(f => f.startsWith(tempFilenameBase) && f.endsWith(`.${format}`));
                    if (matchedFile) {
                        foundFile = path.join(downloadsDir, matchedFile);
                    } else {
                        // Broader fallback if format specific match fails
                        const genericMatchedFile = files.find(f => f.startsWith(tempFilenameBase));
                        if (genericMatchedFile) {
                            foundFile = path.join(downloadsDir, genericMatchedFile);
                            console.warn(`Expected format .${format} not found, but found ${genericMatchedFile}`);
                        }
                    }
                } catch (readDirError) {
                    console.error("Error reading downloads directory for fallback:", readDirError);
                }
            }

            if (foundFile) {
                actualOutputFilename = path.basename(foundFile);
                console.log(`Download successful. File identified: ${actualOutputFilename}`);
                return res.json({
                    success: true,
                    message: 'Audio downloaded successfully!',
                    downloadUrl: `/download/${encodeURIComponent(actualOutputFilename)}`
                });
            } else {
                console.error('yt-dlp success, but output file not found in downloads directory.');
                return res.status(500).json({ success: false, message: 'Download succeeded but file not found on server.' });
            }

        } else {
            console.error('yt-dlp failed.');
            return res.status(500).json({
                success: false,
                message: 'Failed to download or convert audio.',
                error: stderrData || 'Unknown yt-dlp error'
            });
        }
    });

    ytDlpProcess.on('error', (err) => {
        console.error('Failed to start yt-dlp process:', err);
        return res.status(500).json({ success: false, message: 'Server error: Could not start download process.' });
    });
});

app.get('/download/:filename', (req, res) => {
    const requestedFilename = req.params.filename;
    // Basic sanitization: prevent directory traversal.
    // path.basename will return only the last portion of a path.
    const safeFilename = path.basename(requestedFilename);

    if (safeFilename !== requestedFilename) {
        // This means the original filename likely contained path segments like '..' or '/'
        return res.status(400).send('Invalid filename.');
    }

    const filePath = path.join(downloadsDir, safeFilename);
    console.log(`Attempting to serve file: ${filePath}`);

    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                // Avoid sending another response if headers already sent
                if (!res.headersSent) {
                    res.status(500).send('Error sending file.');
                }
            } else {
                console.log('File sent successfully:', filePath);
                // Optionally delete the file after download to save space on ephemeral storage
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error('Error deleting file:', filePath, unlinkErr);
                    else console.log('File deleted successfully:', filePath);
                });
            }
        });
    } else {
        console.error('File not found for download:', filePath);
        res.status(404).send('File not found.');
    }
});

app.listen(port, '0.0.0.0', () => { // Listen on 0.0.0.0 to be accessible in container
    console.log(`Server listening on port ${port}`);
    console.log(`Ensure yt-dlp and ffmpeg are installed (handled by Dockerfile).`);
    console.log(`Downloads directory (within container): ${downloadsDir}`);
    if (!fs.existsSync(downloadsDir)) {
        console.warn(`WARNING: Downloads directory ${downloadsDir} does NOT exist at server start!`);
    } else {
        console.log(`Downloads directory ${downloadsDir} exists.`);
    }
});