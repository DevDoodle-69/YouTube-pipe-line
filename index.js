const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 10000;

const YOUTUBE_COOKIE = 'GPS=1; PREF=f6=40000000&tz=Asia.Dhaka; __Secure-1PSIDTS=sidts-CjUBXMw41VSfJMUQeEbTw9Q7W8HGmqx3BQS98i6GDNvTgpkpQroBvUpZih2siMV_BoY8dPjUhxAA; __Secure-3PSIDTS=sidts-CjUBXMw41VSfJMUQeEbTw9Q7W8HGmqx3BQS98i6GDNvTgpkpQroBvUpZih2siMV_BoY8dPjUhxAA; HSID=AqDIpHgd7rS_H6Hei; SSID=AMDL1wVHmXEt2r2Xv; APISID=tMG0pSWEVdF1F-vA/AD6FDLIcE9TXv4pjm; SAPISID=dMKm0aE_0iOrnbCX/AE-7ZFojnihs1uzYM; __Secure-1PAPISID=dMKm0aE_0iOrnbCX/AE-7ZFojnihs1uzYM; __Secure-3PAPISID=dMKm0aE_0iOrnbCX/AE-7ZFojnihs1uzYM; SID=g.a000CgmoihWi0NUE2rIXztcGtHQZyjz7VqYf-MStP_aqOmAD6wjMpFiETDU-2IkhNyvpf-Rh-AACgYKAUUSARYSFQHGX2MiYkOU0SjVM5VGu_SXJy1pJBoVAUF8yKrEjrB8LP-NtfvJFRt4Ih7l0076; __Secure-1PSID=g.a000CgmoihWi0NUE2rIXztcGtHQZyjz7VqYf-MStP_aqOmAD6wjMhrUVDM9DX1JR6BTT0g0SxAACgYKAZgSARYSFQHGX2MiDok0Mmr6ft4KE_H1REq66xoVAUF8yKr3vahEl5Ve_am_KLtLONeJ0076; __Secure-3PSID=g.a000CgmoihWi0NUE2rIXztcGtHQZyjz7VqYf-MStP_aqOmAD6wjMoMvSEHCCcpmUDmICiPHtBwACgYKASISARYSFQHGX2MiPgmYvMvo1nInvpmYiGYodxoVAUF8yKqupTVidfdWxlbTarO55dVo0076; LOGIN_INFO=AFmmF2swRgIhALSbqxeQm75kvshfUjXOm7h-1_Qhdxx9D1hjGhNRfpc3AiEAxs4MdCRBxZ7CE-rbPBTUQwW4N7hX6BnQAj--Jo6Hir4:QUQ3MjNmdzV3THk3SmVfR04zLVkyT2hrMEZRekMtZlprclA4X1pfUWE4WW9zQWlZa2dkOFdoUnQyYUdEOUs3QkpsdHdMMzNhQktOM0M3UkRkM0kwLVlVYkM3S0F0dGJab0hieFlDTVoyNzBZcnlIVmpqOWw1SUJGaVl0UWFBcnBERHR5YVpxX1hWYktvdUhiMHBDS3VIRXZkV1U3cGU0LUR3; SIDCC=AKEyXzW7xXxjY5ytwUIYytS6LTmAooMlDF96A1mdd9nWg3NkHs5XJhKKjkBQZnYnxHIwwq_d; __Secure-1PSIDCC=AKEyXzX669D02up9n8pOJJ5uuAD85xjK58-1T2zV37WoQRx2CZwNjTc8L0aZPwhOKoBIQCTs; __Secure-3PSIDCC=AKEyXzVDDyIuvpElX_UnRwSGOPFmrTfc6YTNO1oXc4dfrxtocUUSCXdM6ipfpom1GC9i_pgJ';

const getYtdlOptions = (type) => {
    const options = {
        requestOptions: {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': YOUTUBE_COOKIE
            }
        }
    };

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

        if (!videoURL) {
            return res.status(400).json({ success: false, error: 'Valid YouTube URL is required via ?url=' });
        }

        const info = await ytdl.getInfo(videoURL, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Cookie': YOUTUBE_COOKIE
                }
            }
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
