const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const YT_KEY = process.env.YT_API_KEY || 'AIzaSyC-SVwqFX7N-Wg5YfjEEYxlaBIC4u1JxCg';
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

const SPOTIFY_TOKEN_URL = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let spotifyToken = null;
let spotifyTokenExpiresAt = 0;
let spotifyTokenPromise = null;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiresAt - 60000) {
    return spotifyToken;
  }

  if (spotifyTokenPromise) return spotifyTokenPromise;

  spotifyTokenPromise = (async () => {
    try {
      const res = await axios.get(SPOTIFY_TOKEN_URL, {
        headers: {
          'User-Agent': SPOTIFY_UA,
          'Accept': 'application/json',
          'Referer': 'https://open.spotify.com/',
          'Origin': 'https://open.spotify.com'
        },
        timeout: 15000
      });

      const token = res.data && res.data.accessToken;
      const expMs = res.data && res.data.accessTokenExpirationTimestampMs;

      if (!token) throw new Error('no access token in response');

      spotifyToken = token;
      spotifyTokenExpiresAt = expMs ? expMs : Date.now() + 30 * 60 * 1000;

      console.log(`spotify token refreshed (expires in ${Math.round((spotifyTokenExpiresAt - Date.now()) / 60000)}m)`);
      return token;
    } catch (err) {
      console.log(`spotify token fetch failed: ${err.message}`);
      throw err;
    } finally {
      spotifyTokenPromise = null;
    }
  })();

  return spotifyTokenPromise;
}

function ytDurationToMs(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const h = parseInt(m[1] || 0, 10);
  const mi = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  return ((h * 60 + mi) * 60 + s) * 1000;
}

function ytFormatDuration(iso) {
  const total = Math.floor(ytDurationToMs(iso) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function ytSearch(query, limit = 10) {
  const res = await axios.get(`${YT_BASE}/search`, {
    params: {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: Math.min(50, limit),
      key: YT_KEY
    },
    timeout: 15000
  });

  const items = (res.data.items || []).map(v => ({
    videoId: v.id.videoId,
    title: v.snippet.title,
    description: v.snippet.description,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    publishedAt: v.snippet.publishedAt,
    thumbnail: {
      default: v.snippet.thumbnails && v.snippet.thumbnails.default && v.snippet.thumbnails.default.url,
      medium: v.snippet.thumbnails && v.snippet.thumbnails.medium && v.snippet.thumbnails.medium.url,
      high: v.snippet.thumbnails && v.snippet.thumbnails.high && v.snippet.thumbnails.high.url,
      standard: v.snippet.thumbnails && v.snippet.thumbnails.standard && v.snippet.thumbnails.standard.url,
      maxres: v.snippet.thumbnails && v.snippet.thumbnails.maxres && v.snippet.thumbnails.maxres.url
    },
    url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    shortUrl: `https://youtu.be/${v.id.videoId}`
  }));

  if (!items.length) return { items, total: 0 };

  const ids = items.map(i => i.videoId).join(',');
  try {
    const details = await axios.get(`${YT_BASE}/videos`, {
      params: {
        part: 'contentDetails,statistics,status',
        id: ids,
        key: YT_KEY
      },
      timeout: 15000
    });

    const map = new Map();
    for (const d of details.data.items || []) {
      map.set(d.id, {
        durationIso: d.contentDetails && d.contentDetails.duration,
        duration: ytFormatDuration(d.contentDetails && d.contentDetails.duration),
        durationMs: ytDurationToMs(d.contentDetails && d.contentDetails.duration),
        views: d.statistics && parseInt(d.statistics.viewCount || '0', 10),
        likes: d.statistics && parseInt(d.statistics.likeCount || '0', 10),
        comments: d.statistics && parseInt(d.statistics.commentCount || '0', 10),
        isLive: d.snippet && d.snippet.liveBroadcastContent === 'live'
      });
    }

    for (const i of items) {
      const extra = map.get(i.videoId);
      if (extra) Object.assign(i, extra);
    }
  } catch (e) {
    console.log(`yt details enrich failed: ${e.message}`);
  }

  return { items, total: items.length };
}

async function spoSearch(query, limit = 10, type = 'track') {
  const token = await getSpotifyToken();

  const res = await axios.get(`${SPOTIFY_API}/search`, {
    params: {
      q: query,
      type,
      limit: Math.min(50, limit),
      market: 'US'
    },
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': SPOTIFY_UA,
      'Accept': 'application/json'
    },
    timeout: 15000
  });

  return res.data;
}

function normalizeTracks(data) {
  const tracks = data && data.tracks && data.tracks.items ? data.tracks.items : [];
  return tracks.filter(Boolean).map(t => ({
    id: t.id,
    name: t.name,
    uri: t.uri,
    url: t.external_urls ? t.external_urls.spotify : null,
    durationMs: t.duration_ms,
    duration: msToTime(t.duration_ms),
    explicit: t.explicit,
    popularity: t.popularity,
    previewUrl: t.preview_url,
    artists: (t.artists || []).map(a => ({
      id: a.id,
      name: a.name,
      url: a.external_urls ? a.external_urls.spotify : null
    })),
    album: t.album ? {
      id: t.album.id,
      name: t.album.name,
      url: t.album.external_urls ? t.album.external_urls.spotify : null,
      releaseDate: t.album.release_date,
      totalTracks: t.album.total_tracks,
      images: (t.album.images || []).map(i => ({ url: i.url, width: i.width, height: i.height }))
    } : null,
    thumbnail: t.album && t.album.images && t.album.images[0] ? t.album.images[0].url : null
  }));
}

function normalizeAlbums(data) {
  const albums = data && data.albums && data.albums.items ? data.albums.items : [];
  return albums.filter(Boolean).map(a => ({
    id: a.id,
    name: a.name,
    uri: a.uri,
    url: a.external_urls ? a.external_urls.spotify : null,
    type: a.album_type,
    releaseDate: a.release_date,
    totalTracks: a.total_tracks,
    artists: (a.artists || []).map(x => ({ id: x.id, name: x.name })),
    images: (a.images || []).map(i => ({ url: i.url, width: i.width, height: i.height })),
    thumbnail: a.images && a.images[0] ? a.images[0].url : null
  }));
}

function normalizeArtists(data) {
  const artists = data && data.artists && data.artists.items ? data.artists.items : [];
  return artists.filter(Boolean).map(a => ({
    id: a.id,
    name: a.name,
    uri: a.uri,
    url: a.external_urls ? a.external_urls.spotify : null,
    followers: a.followers ? a.followers.total : null,
    popularity: a.popularity,
    genres: a.genres || [],
    images: (a.images || []).map(i => ({ url: i.url, width: i.width, height: i.height })),
    thumbnail: a.images && a.images[0] ? a.images[0].url : null
  }));
}

function normalizePlaylists(data) {
  const playlists = data && data.playlists && data.playlists.items ? data.playlists.items : [];
  return playlists.filter(Boolean).map(p => ({
    id: p.id,
    name: p.name,
    uri: p.uri,
    url: p.external_urls ? p.external_urls.spotify : null,
    description: p.description,
    owner: p.owner ? { id: p.owner.id, name: p.owner.display_name } : null,
    tracks: p.tracks ? p.tracks.total : null,
    images: (p.images || []).map(i => ({ url: i.url, width: i.width, height: i.height })),
    thumbnail: p.images && p.images[0] ? p.images[0].url : null
  }));
}

function msToTime(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

app.get('/search', async (req, res) => {
  const yt = req.query.yt;
  const spo = req.query.spo;
  const limit = Math.min(50, parseInt(req.query.limit || '10', 10) || 10);
  const type = (req.query.type || 'track').toLowerCase();

  if (!yt && !spo) {
    return res.status(400).json({
      status: 'error',
      message: 'missing ?yt= or ?spo=',
      usage: {
        youtube: '/search?yt=never gonna give you up',
        spotify: '/search?spo=never gonna give you up',
        spotify_types: 'track | album | artist | playlist (add &type=album)'
      }
    });
  }

  if (yt) {
    try {
      const data = await ytSearch(yt, limit);
      return res.json({
        status: 'success',
        source: 'youtube',
        query: yt,
        total: data.total,
        results: data.items
      });
    } catch (err) {
      console.log(`yt search failed: ${err.message}`);
      const detail = err.response && err.response.data ? err.response.data : null;
      return res.status(500).json({
        status: 'error',
        source: 'youtube',
        message: err.message,
        detail
      });
    }
  }

  try {
    const raw = await spoSearch(spo, limit, type);

    let results;
    let kind;

    switch (type) {
      case 'album':
        results = normalizeAlbums(raw);
        kind = 'albums';
        break;
      case 'artist':
        results = normalizeArtists(raw);
        kind = 'artists';
        break;
      case 'playlist':
        results = normalizePlaylists(raw);
        kind = 'playlists';
        break;
      default:
        results = normalizeTracks(raw);
        kind = 'tracks';
    }

    return res.json({
      status: 'success',
      source: 'spotify',
      query: spo,
      type: kind,
      total: results.length,
      results
    });
  } catch (err) {
    console.log(`spo search failed: ${err.message}`);

    if (err.response && err.response.status === 401) {
      spotifyToken = null;
      spotifyTokenExpiresAt = 0;
      try {
        const raw = await spoSearch(spo, limit, type);
        const results = type === 'album' ? normalizeAlbums(raw)
          : type === 'artist' ? normalizeArtists(raw)
          : type === 'playlist' ? normalizePlaylists(raw)
          : normalizeTracks(raw);
        return res.json({
          status: 'success',
          source: 'spotify',
          query: spo,
          type,
          total: results.length,
          results
        });
      } catch (e2) {
        return res.status(500).json({ status: 'error', source: 'spotify', message: e2.message });
      }
    }

    return res.status(500).json({
      status: 'error',
      source: 'spotify',
      message: err.message,
      detail: err.response && err.response.data ? err.response.data : null
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    endpoints: {
      youtube: '/search?yt=query&limit=10',
      spotify: '/search?spo=query&limit=10&type=track',
      spotify_types: ['track', 'album', 'artist', 'playlist']
    }
  });
});

app.listen(PORT, () => {
  console.log(`http on ${PORT}`);
});
