// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('youtubeUrl');
    const formatSelect = document.getElementById('format');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusDiv = document.getElementById('status');
    const downloadLinkContainer = document.getElementById('downloadLinkContainer');

    downloadBtn.addEventListener('click', async () => {
        const youtubeUrl = urlInput.value.trim();
        const selectedFormat = formatSelect.value;

        if (!youtubeUrl) {
            updateStatus('Please enter a YouTube URL.', 'error');
            return;
        }

        // Updated YouTube URL validation to explicitly include /shorts/
        // Also handles various forms like:
        // - https://www.youtube.com/watch?v=VIDEO_ID
        // - https://youtube.com/watch?v=VIDEO_ID
        // - https://youtu.be/VIDEO_ID
        // - https://www.youtube.com/embed/VIDEO_ID
        // - https://www.youtube.com/shorts/VIDEO_ID
        // - https://www.youtube.com/v/VIDEO_ID (older format)
        // It captures the 11-character VIDEO_ID.
        const youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9\-_]{11})(?:\S+)?$/;

        if (!youtubeRegex.test(youtubeUrl)) {
            updateStatus('Please enter a valid YouTube Video URL (including Shorts).', 'error');
            return;
        }

        updateStatus(`Processing... requesting ${selectedFormat.toUpperCase()}. This may take a moment.`, 'processing');
        downloadBtn.disabled = true;
        downloadLinkContainer.innerHTML = ''; // Clear previous link

        try {
            const response = await fetch('/download-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ youtubeUrl, format: selectedFormat }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                updateStatus(result.message || 'Audio ready!', 'success');
                const link = document.createElement('a');
                link.href = result.downloadUrl;
                link.textContent = `Download ${selectedFormat.toUpperCase()} File`;
                downloadLinkContainer.appendChild(link);
            } else {
                updateStatus(`Error: ${result.message || 'Could not process the request.'}`, 'error');
                console.error('Server error details:', result.error || result);
            }

        } catch (error) {
            updateStatus('Network error or server unavailable. Please check your connection or try again later.', 'error');
            console.error('Fetch error:', error);
        } finally {
            downloadBtn.disabled = false;
        }
    });

    function updateStatus(message, type = 'info') {
        statusDiv.textContent = message;
        statusDiv.className = ''; // Clear existing classes
        if (type === 'success') {
            statusDiv.classList.add('status-success');
        } else if (type === 'error') {
            statusDiv.classList.add('status-error');
        } else if (type === 'processing') {
            statusDiv.classList.add('status-processing');
        }
    }
});