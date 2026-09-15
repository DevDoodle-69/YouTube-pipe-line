const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytSearch = require('yt-search');

const app = express();
const PORT = process.env.PORT || 10000;
const playerClients = ["WEB", "ANDROID", "IOS"];

const COOKIES_ARRAY = [
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1789502170, name: "GPS", value: "1" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060473, name: "PREF", value: "f6=40000000&tz=Asia.Dhaka" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1821036424, name: "__Secure-1PSIDTS", value: "sidts-CjUBXMw41VSfJMUQeEbTw9Q7W8HGmqx3BQS98i6GDNvTgpkpQroBvUpZih2siMV_BoY8dPjUhxAA" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1821036424, name: "__Secure-3PSIDTS", value: "sidts-CjUBXMw41VSfJMUQeEbTw9Q7W8HGmqx3BQS98i6GDNvTgpkpQroBvUpZih2siMV_BoY8dPjUhxAA" },
    { domain: ".youtube.com", path: "/", secure: false, expirationDate: 1824060424, name: "HSID", value: "AqDIpHgd7rS_H6Hei" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060424, name: "SSID", value: "AMDL1wVHmXEt2r2Xv" },
    { domain: ".youtube.com", path: "/", secure: false, expirationDate: 1824060424, name: "APISID", value: "tMG0pSWEVdF1F-vA/AD6FDLIcE9TXv4pjm" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060424, name: "SAPISID", value: "dMKm0aE_0iOrnbCX/AE-7ZFojnihs1uzYM" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060424, name: "__Secure-1PAPISID", value: "dMKm0aE_0iOrnbCX/AE-7ZFojnihs1uzYM" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060424, name: "__Secure-3PAPISID", value: "dMKm0aE_0iOrnbCX/AE-7ZFojnihs1uzYM" },
    { domain: ".youtube.com", path: "/", secure: false, expirationDate: 1824060424, name: "SID", value: "g.a000CgmoihWi0NUE2rIXztcGtHQZyjz7VqYf-MStP_aqOmAD6wjMpFiETDU-2IkhNyvpf-Rh-AACgYKAUUSARYSFQHGX2MiYkOU0SjVM5VGu_SXJy1pJBoVAUF8yKrEjrB8LP-NtfvJFRt4Ih7l0076" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060424, name: "__Secure-1PSID", value: "g.a000CgmoihWi0NUE2rIXztcGtHQZyjz7VqYf-MStP_aqOmAD6wjMhrUVDM9DX1JR6BTT0g0SxAACgYKAZgSARYSFQHGX2MiDok0Mmr6ft4KE_H1REq66xoVAUF8yKr3vahEl5Ve_am_KLtLONeJ0076" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060424, name: "__Secure-3PSID", value: "g.a000CgmoihWi0NUE2rIXztcGtHQZyjz7VqYf-MStP_aqOmAD6wjMoMvSEHCCcpmUDmICiPHtBwACgYKASISARYSFQHGX2MiPgmYvMvo1nInvpmYiGYodxoVAUF8yKqupTVidfdWxlbTarO55dVo0076" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1824060425, name: "LOGIN_INFO", value: "AFmmF2swRgIhALSbqxeQm75kvshfUjXOm7h-1_Qhdxx9D1hjGhNRfpc3AiEAxs4MdCRBxZ7CE-rbPBTUQwW4N7hX6BnQAj--Jo6Hir4:QUQ3MjNmdzV3THk3SmVfR04zLVkyT2hrMEZRekMtZlprclA4X1pfUWE4WW9zQWlZa2dkOFdoUnQyYUdEOUs3QkpsdHdMMzNhQktOM0M3UkRkM0kwLVlVYkM3S0F0dGJab0hieFlDTVoyNzBZcnlIVmpqOWw1SUJGaVl0UWFBcnBERHR5YVpxX1hWYktvdUhiMHBDS3VIRXZkV1U3cGU0LUR3" },
    { domain: ".youtube.com", path: "/", secure: false, expirationDate: 1821036475, name: "SIDCC", value: "AKEyXzW7xXxjY5ytwUIYytS6LTmAooMlDF96A1mdd9nWg3NkHs5XJhKKjkBQZnYnxHIwwq_d" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1821036475, name: "__Secure-1PSIDCC", value: "AKEyXzX669D02up9n8pOJJ5uuAD85xjK58-1T2zV37WoQRx2CZwNjTc8L0aZPwhOKoBIQCTs" },
    { domain: ".youtube.com", path: "/", secure: true, expirationDate: 1821036475, name: "__Secure-3PSIDCC", value: "AKEyXzVDDyIuvpElX_UnRwSGOPFmrTfc6YTNO1oXc4dfrxtocUUSCXdM6ipfpom1GC9i_pgJ" }
];

const agent = process.env.PROXY_URL 
    ? ytdl.createProxyAgent({ uri: process.env.PROXY_URL }, COOKIES_ARRAY) 
    : ytdl.createAgent(COOKIES_ARRAY);

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

        const info = await ytdl.getInfo(videoURL, { agent, playerClients });
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
