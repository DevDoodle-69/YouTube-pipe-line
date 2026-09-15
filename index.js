const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 10000;

// Helper options to bypass bot detection using cookies
const getYtdlOptions = (type) => {
    const options = {
        requestOptions: {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        }
    };

    // Include cookie if set in environment variables
    if (process.env.YT_COOKIE) {
        options.requestOptions.headers.Cookie = process.env.YT_COOKIE;
    }

    if (type === 'mp3') {
        options.quality = 'highestaudio';
        options.filter = 'audioonly';
    } else {
        options.quality = 'highest';
        options.filter = 'videoandaudio';
    }

    return options;
};

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

        const info = await ytdl.getInfo(videoURL, {
            requestOptions: process.env.YT_COOKIE ? { headers: { Cookie: process.env.YT_COOKIE } } : {}
        });
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, '').trim();

        if (type === 'mp3') {
            res.header('Content-Disposition', `attachment; filename="${title}.mp3"`);
            res.setHeader('Content-Type', 'audio/mpeg');
            ytdl(videoURL, getYtdlOptions('mp3')).pipe(res);
        } else if (type === 'mp4') {
            res.header('Content-Disposition', `attachment; filename="${title}.mp4"`);
            res.setHeader('Content-Type', 'video/mp4');
            ytdl(videoURL, getYtdlOptions('mp4')).pipe(res);
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
