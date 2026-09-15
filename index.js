const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/search', async (req, res) => {
    try {
        const query = req.query.yt;
        if (!query) {
            return res.status(400).json({ success: false, error: 'Missing yt query parameter. Use /search?yt=your_query' });
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

app.get('/download', async (req, res) => {
    try {
        const videoURL = req.query.url;
        const type = (req.query.type || 'mp3').toLowerCase();

        if (!videoURL || !ytdl.validateURL(videoURL)) {
            return res.status(400).json({ success: false, error: 'Valid YouTube URL is required via ?url=' });
        }

        const info = await ytdl.getInfo(videoURL);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, '').trim();

        if (type === 'mp3') {
            res.header('Content-Disposition', `attachment; filename="${title}.mp3"`);
            res.setHeader('Content-Type', 'audio/mpeg');
            ytdl(videoURL, { quality: 'highestaudio', filter: 'audioonly' }).pipe(res);
        } else if (type === 'mp4') {
            res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
            res.setHeader('Content-Type', 'video/mp4');
            ytdl(videoURL, { quality: 'highest', filter: 'videoandaudio' }).pipe(res);
        } else {
            res.status(400).json({ success: false, error: 'Invalid type parameter. Use type=mp3 or type=mp4.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send('YouTube Downloader API is running successfully!');
});

app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
