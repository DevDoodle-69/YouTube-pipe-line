import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15_000);
const MAX_REDIRECTS = 5;

const DEFAULT_PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.syncpundit.io",
  "https://pipedapi.tokhmi.xyz",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.r4fo.com",
  "https://pipedapi-libre.kavin.rocks"
];

const PIPED_INSTANCES = (process.env.PIPED_INSTANCES || DEFAULT_PIPED_INSTANCES.join(","))
  .split(",")
  .map(value => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", methods: ["GET", "HEAD"] }));
app.use(morgan("combined"));

app.get("/", (_req, res) => {
  res.json({
    name: "YouTube Audio/Video Download API",
    endpoints: {
      streams: "/api/streams/:youtubeVideoId",
      audio: "/download?mp3=<YouTube URL or video ID>",
      video: "/download?mp4=<YouTube URL or video ID>"
    },
    note: "Use only content you are authorized to access and download."
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), providers: PIPED_INSTANCES.length });
});

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function extractYouTubeVideoId(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw httpError(400, "Provide a YouTube URL or 11-character video ID");
  }

  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(400, "Invalid YouTube URL or video ID");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const allowedHosts = new Set([
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "youtube-nocookie.com"
  ]);

  if (!allowedHosts.has(hostname)) {
    throw httpError(400, "Only YouTube URLs are supported");
  }

  let videoId = null;
  if (hostname === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0];
  } else if (url.searchParams.get("v")) {
    videoId = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
    videoId = match?.[1] || null;
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw httpError(400, "Could not extract an 11-character YouTube video ID");
  }

  return videoId;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("json")) {
      throw new Error(`Provider returned ${response.status} ${contentType}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveStreams(videoId) {
  const failures = [];

  for (const provider of PIPED_INSTANCES) {
    try {
      const data = await fetchJson(`${provider}/streams/${encodeURIComponent(videoId)}`);
      if (!Array.isArray(data.audioStreams) && !Array.isArray(data.videoStreams)) {
        throw new Error("Provider response has no stream arrays");
      }
      return { provider, data };
    } catch (error) {
      failures.push(`${provider}: ${error.message}`);
    }
  }

  const error = httpError(503, "No Piped stream provider is currently available");
  error.details = failures;
  throw error;
}

function chooseStream(data, mode) {
  const streams = mode === "mp3" ? data.audioStreams : data.videoStreams;
  if (!Array.isArray(streams)) return null;

  const valid = streams.filter(stream => {
    if (!stream?.url || stream.videoOnly === true) return false;
    if (mode === "mp3") return String(stream.mimeType || "").startsWith("audio/");
    return String(stream.mimeType || "").startsWith("video/");
  });

  return valid.sort((a, b) => {
    if (mode === "mp4") return (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0);
    return (b.bitrate || 0) - (a.bitrate || 0);
  })[0] || null;
}

async function fetchMediaWithRedirects(startUrl, req) {
  let current = new URL(startUrl);
  const range = typeof req.headers.range === "string" ? req.headers.range : undefined;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(current, {
        method: req.method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          ...(range ? { Range: range } : {}),
          "User-Agent": "YouTubeDownloadAPI/1.0"
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Upstream redirect has no Location header");
        current = new URL(location, current);
        continue;
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Too many upstream redirects");
}

function getMode(req) {
  const mp3 = typeof req.query.mp3 === "string" ? req.query.mp3 : null;
  const mp4 = typeof req.query.mp4 === "string" ? req.query.mp4 : null;

  if ((mp3 ? 1 : 0) + (mp4 ? 1 : 0) !== 1) {
    throw httpError(400, "Provide exactly one query parameter: mp3 or mp4");
  }

  return { mode: mp3 ? "mp3" : "mp4", input: mp3 || mp4 };
}

app.get("/api/streams/:videoId", async (req, res, next) => {
  try {
    const videoId = extractYouTubeVideoId(req.params.videoId);
    const { provider, data } = await resolveStreams(videoId);

    res.json({
      provider,
      videoId,
      title: data.title || null,
      duration: data.duration || null,
      thumbnailUrl: data.thumbnailUrl || null,
      audioStreams: data.audioStreams || [],
      videoStreams: data.videoStreams || [],
      dash: data.dash || null,
      hls: data.hls || null
    });
  } catch (error) {
    next(error);
  }
});

async function handleDownload(req, res, next) {
  try {
    const { mode, input } = getMode(req);
    const videoId = extractYouTubeVideoId(input);
    const { data } = await resolveStreams(videoId);
    const selected = chooseStream(data, mode);

    if (!selected) {
      throw httpError(404, `No ${mode} stream is available for this video`);
    }

    if (mode === "mp3") {
      if (req.method === "HEAD") {
        res.status(200);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Disposition", `attachment; filename="${videoId}.mp3"`);
        res.setHeader("Cache-Control", "no-store");
        return res.end();
      }

      // Piped may return M4A or WebM audio. FFmpeg converts it to real MP3 output.
      res.status(200);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="${videoId}.mp3"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const ffmpeg = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-i", selected.url,
        "-vn",
        "-map", "0:a:0",
        "-codec:a", "libmp3lame",
        "-b:a", process.env.MP3_BITRATE || "192k",
        "-f", "mp3",
        "pipe:1"
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let ffmpegError = "";
      ffmpeg.stderr.setEncoding("utf8");
      ffmpeg.stderr.on("data", chunk => { ffmpegError += chunk; });
      req.on("close", () => {
        if (!res.writableEnded) ffmpeg.kill("SIGTERM");
      });

      try {
        await pipeline(ffmpeg.stdout, res);
      } catch (error) {
        if (!res.headersSent || !res.writableEnded) next(error);
        return;
      }

      if (ffmpeg.exitCode !== 0 && !res.writableEnded) {
        next(new Error(`FFmpeg failed: ${ffmpegError.trim() || "unknown conversion error"}`));
      }
      return;
    }

    const upstream = await fetchMediaWithRedirects(selected.url, req);
    if (!upstream.ok && upstream.status !== 206) {
      throw httpError(502, `Resolved media URL returned HTTP ${upstream.status}`);
    }

    const extension = "mp4";
    const contentType = "video/mp4";
    const length = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");

    res.status(upstream.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${videoId}.${extension}"`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (length) res.setHeader("Content-Length", length);
    if (contentRange) res.setHeader("Content-Range", contentRange);

    if (req.method === "HEAD" || !upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({ error: "Upstream request timed out" });
    }
    next(error);
  }
}

app.get("/download", handleDownload);
app.head("/download", handleDownload);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));

app.use((error, _req, res, _next) => {
  console.error(error);
  const body = { error: error.message || "Internal server error" };
  if (process.env.NODE_ENV !== "production" && error.details) body.providerErrors = error.details;
  res.status(Number.isInteger(error.statusCode) ? error.statusCode : 500).json(body);
});

app.listen(PORT, HOST, () => {
  console.log(`YouTube Download API listening on http://${HOST}:${PORT}`);
});
