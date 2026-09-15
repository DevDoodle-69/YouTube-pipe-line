const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 10000;
const playerClients = ["WEB", "ANDROID", "IOS"];

app.get('/search', async (req, res) => {
    try {
        const query = req.query.yt;
        if (!query) {
            return res.status(400).json({ success: false, error: 'Missing yt query parameter' });
        }
        const searchResult = await ytSearch(query);
        res.json({
            success: true,
            query: query,
            results: searchResult.videos.slice(0, 15)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/stream', async (req, res) => {
    try {
        const videoURL = req.query.url;
        if (!videoURL || !ytdl.validateURL(videoURL)) {
            return res.status(400).send('Invalid or missing YouTube URL');
        }

        const info = await ytdl.getInfo(videoURL, { playerClients });
        const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });

        if (!format || !format.url) {
            return res.status(400).send('Error: YouTube stream format unavailable.');
        }

        res.redirect(format.url);
    } catch (err) {
        res.status(500).send('Streaming error: ' + err.message);
    }
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>YouTube Direct Streamer</title>
            <style>
                body { font-family: Arial, sans-serif; background: #0f0f0f; color: #fff; text-align: center; padding: 40px; }
                input { width: 500px; padding: 12px; font-size: 16px; border-radius: 6px; border: 1px solid #333; background: #222; color: #fff; }
                button { padding: 12px 24px; font-size: 16px; background: #cc0000; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
                button:hover { background: #e60000; }
                video { margin-top: 20px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
                #error { color: #ff4444; margin-top: 15px; font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>YouTube Direct Streamer</h2>
            <input type="text" id="url" placeholder="Paste YouTube Video URL here..." />
            <br><br>
            <button onclick="streamVideo()">Play Video</button>
            <br>
            <div id="error"></div>
            <br>
            <video id="player" controls width="720" style="max-width:100%;"></video>
            <script>
                function streamVideo() {
                    const u = document.getElementById('url').value;
                    const errDiv = document.getElementById('error');
                    errDiv.innerText = '';
                    if(!u) { alert('Please enter a valid YouTube URL'); return; }
                    const player = document.getElementById('player');
                    player.src = '/stream?url=' + encodeURIComponent(u);
                    player.play().catch(err => {
                        errDiv.innerText = 'Playback failed. Try a different video link.';
                    });
                }
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
