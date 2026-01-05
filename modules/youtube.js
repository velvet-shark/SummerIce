const DEFAULT_CLIENT_NAME = "WEB";
const DEFAULT_CLIENT_VERSION = "2.20240101.00.00";

export const isYouTubeUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch (error) {
    return false;
  }
};

export const getYouTubeVideoId = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      if (parsed.pathname.startsWith("/v/")) {
        return parsed.pathname.split("/")[2] || null;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

const decodeHtmlEntities = (text) => {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
};

const extractJsonObject = (html, marker) => {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const braceIndex = html.indexOf("{", markerIndex);
  if (braceIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = braceIndex; i < html.length; i += 1) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const jsonText = html.slice(braceIndex, i + 1);
        try {
          return JSON.parse(jsonText);
        } catch (error) {
          return null;
        }
      }
    }
  }

  return null;
};

const extractPlayerResponseFromHtml = (html) => {
  return extractJsonObject(html, "ytInitialPlayerResponse");
};

const extractYtConfigFromHtml = (html) => {
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientNameMatch = html.match(/"INNERTUBE_CLIENT_NAME":"?([^"]+?)"?(?=,|})/);
  const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
  const visitorDataMatch = html.match(/"VISITOR_DATA":"([^"]+)"/);

  return {
    apiKey: apiKeyMatch ? apiKeyMatch[1] : null,
    clientName: clientNameMatch ? clientNameMatch[1] : null,
    clientVersion: clientVersionMatch ? clientVersionMatch[1] : null,
    visitorData: visitorDataMatch ? visitorDataMatch[1] : null
  };
};

const pickCaptionTrack = (tracks, preferredLanguage) => {
  if (!tracks || tracks.length === 0) return null;
  const languagePrefix = preferredLanguage ? preferredLanguage.split("-")[0] : null;

  const nonAsrTracks = tracks.filter((track) => track.kind !== "asr");
  const preferredSets = [nonAsrTracks, tracks];

  for (const set of preferredSets) {
    if (languagePrefix) {
      const match = set.find((track) =>
        typeof track.languageCode === "string" && track.languageCode.startsWith(languagePrefix)
      );
      if (match) return match;
    }

    if (set.length > 0) return set[0];
  }

  return tracks[0];
};

const parseJson3Transcript = (payload) => {
  if (!payload || !Array.isArray(payload.events)) return "";
  const lines = [];

  payload.events.forEach((event) => {
    if (!event.segs) return;
    const line = event.segs
      .map((segment) => decodeHtmlEntities(segment.utf8 || ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length > 0) {
      lines.push(line);
    }
  });

  return lines.join("\n");
};

const parseVttTranscript = (text) => {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const output = [];
  let buffer = [];

  const flush = () => {
    if (buffer.length > 0) {
      output.push(buffer.join(" ").replace(/\s+/g, " ").trim());
      buffer = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      return;
    }

    if (trimmed.startsWith("WEBVTT") || trimmed.startsWith("NOTE")) return;
    if (/^\d+$/.test(trimmed)) return;
    if (trimmed.includes("-->")) return;

    buffer.push(decodeHtmlEntities(trimmed));
  });

  flush();
  return output.filter(Boolean).join("\n");
};

const parseXmlTranscript = (text) => {
  if (!text) return "";
  const matches = [...text.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
  const lines = matches.map((match) =>
    decodeHtmlEntities(match[1]).replace(/\s+/g, " ").trim()
  );
  return lines.filter(Boolean).join("\n");
};

const fetchCaptionTrackText = async (baseUrl) => {
  const url = new URL(baseUrl);
  if (!url.searchParams.has("fmt")) {
    url.searchParams.set("fmt", "json3");
  }

  const response = await fetch(url.toString(), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`Transcript request failed: ${response.status}`);
  }

  const bodyText = await response.text();

  try {
    const json = JSON.parse(bodyText);
    const parsed = parseJson3Transcript(json);
    if (parsed) return parsed;
  } catch (error) {
    // Fall back to text parsing below.
  }

  if (bodyText.includes("<text")) {
    return parseXmlTranscript(bodyText);
  }

  if (bodyText.includes("WEBVTT")) {
    return parseVttTranscript(bodyText);
  }

  return "";
};

const fetchPlayerResponse = async ({ apiKey, clientName, clientVersion, visitorData }, videoId) => {
  if (!apiKey) return null;
  const clientNameValue = clientName || DEFAULT_CLIENT_NAME;
  const headerClientName = /^\d+$/.test(clientNameValue) ? clientNameValue : "1";
  const contextClientName = /^\d+$/.test(clientNameValue) ? DEFAULT_CLIENT_NAME : clientNameValue;
  const body = {
    context: {
      client: {
        clientName: contextClientName,
        clientVersion: clientVersion || DEFAULT_CLIENT_VERSION
      }
    },
    videoId
  };

  if (visitorData) {
    body.context.client.visitorData = visitorData;
  }

  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-youtube-client-name": String(headerClientName),
        "x-youtube-client-version": String(clientVersion || DEFAULT_CLIENT_VERSION),
        Origin: "https://www.youtube.com"
      },
      credentials: "include",
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
};

export const fetchYouTubeTranscript = async ({ html, url, preferredLanguage }) => {
  try {
    const playerResponse = extractPlayerResponseFromHtml(html || "");
    const extractedVideoId = playerResponse?.videoDetails?.videoId || null;
    const videoId = getYouTubeVideoId(url) || extractedVideoId;
    if (!videoId) {
      return { success: false, error: "Unable to determine YouTube video id." };
    }

    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
    let track = pickCaptionTrack(captionTracks, preferredLanguage);

    if (!track) {
      const ytConfig = extractYtConfigFromHtml(html || "");
      const playerResponseFallback = await fetchPlayerResponse(ytConfig, videoId);
      const fallbackTracks =
        playerResponseFallback?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
      track = pickCaptionTrack(fallbackTracks, preferredLanguage);
    }

    if (!track || !(track.baseUrl || track.url)) {
      return { success: false, error: "No YouTube transcript available." };
    }

    const transcript = await fetchCaptionTrackText(track.baseUrl || track.url);
    if (!transcript || transcript.length < 1) {
      return { success: false, error: "Failed to parse YouTube transcript." };
    }

    return {
      success: true,
      content: transcript,
      title: playerResponse?.videoDetails?.title || null,
      videoId: videoId,
      source: track.kind === "asr" ? "youtube-asr" : "youtube-manual"
    };
  } catch (error) {
    return { success: false, error: error.message || "YouTube transcript failed." };
  }
};
