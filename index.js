const express = require('express');
const yts = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// SPOTIFY: Anonymous Token & Search Pipeline
// ==========================================
async function getAnonymousSpotifyToken() {
  try {
    const res = await fetch("https://open.spotify.com/api/token");
    if (!res.ok) throw new Error("Failed to pull anonymous token from Spotify web player.");
    const data = await res.json();
    return data.accessToken;
  } catch (err) {
    throw new Error(`Spotify Auth Fault: ${err.message}`);
  }
}

async function searchSpotify(query, limit = 10) {
  const token = await getAnonymousSpotifyToken();
  
  const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });

  if (!res.ok) throw new Error(`Spotify API rejected request: HTTP ${res.status}`);
  
  const data = await res.json();
  
  if (!data.tracks || !data.tracks.items) {
    return [];
  }

  return data.tracks.items.map(track => ({
    source: 'spotify',
    id: track.id,
    title: track.name,
    artists: track.artists.map(a => a.name).join(', '),
    album: track.album.name,
    durationMs: track.duration_ms,
    thumbnail: track.album.images.length > 0 ? track.album.images[0].url : null,
    url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`
  }));
}

// ==========================================
// YOUTUBE: Scraping Pipeline (Bypasses Quotas)
// ==========================================
async function searchYouTube(query, limit = 10) {
  try {
    const r = await yts(query);
    const videos = r.videos.slice(0, limit);
    
    return videos.map(video => ({
      source: 'youtube',
      id: video.videoId,
      title: video.title,
      author: video.author.name,
      durationTimestamp: video.timestamp,
      durationSeconds: video.seconds,
      views: video.views,
      thumbnail: video.thumbnail,
      url: video.url
    }));
  } catch (err) {
    throw new Error(`YouTube Scraper Fault: ${err.message}`);
  }
}

// ==========================================
// ROUTER
// ==========================================
app.get('/search', async (req, res) => {
  const ytQuery = req.query.yt;
  const spoQuery = req.query.spo;

  if (!ytQuery && !spoQuery) {
    return res.status(400).json({ 
      status: "error", 
      message: "Missing parameters. Use /search?yt=<query> or /search?spo=<query>" 
    });
  }

  try {
    if (ytQuery) {
      console.log(`[SEARCH] Querying YouTube: ${ytQuery}`);
      const results = await searchYouTube(ytQuery);
      return res.json({
        status: "success",
        query: ytQuery,
        results: results
      });
    }

    if (spoQuery) {
      console.log(`[SEARCH] Querying Spotify: ${spoQuery}`);
      const results = await searchSpotify(spoQuery);
      return res.json({
        status: "success",
        query: spoQuery,
        results: results
      });
    }
  } catch (err) {
    console.error(`[API-ERROR] ${err.message}`);
    return res.status(500).json({ 
      status: "error", 
      message: err.message 
    });
  }
});

// Health check endpoint for Render.com
app.get('/health', (req, res) => {
  res.json({ status: 'active', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`[SYSTEM] Omni-Search Gateway active on port ${PORT}`);
  console.log(`[SYSTEM] ├─ Test YT:  http://localhost:${PORT}/search?yt=never+gonna+give+you+up`);
  console.log(`[SYSTEM] └─ Test SPO: http://localhost:${PORT}/search?spo=blinding+lights`);
});
