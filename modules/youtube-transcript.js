const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_URL_PATTERN = /youtube\.com|youtu\.be/i;
const YOUTUBEI_TRANSCRIPT_ENDPOINT_REGEX =
  /"getTranscriptEndpoint":\{"params":"([^"]+)"\}/;
const DEFAULT_TIMEOUT_MS = 15000;

const REQUEST_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
};

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeYoutubeJsonResponse = (input) => {
  const trimmed = input.trimStart();
  if (trimmed.startsWith(")]}'")) {
    return trimmed.slice(4);
  }
  return trimmed;
};

const decodeHtmlEntities = (input) =>
  input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&nbsp;", " ");

const fetchWithTimeout = async (
  fetchImpl,
  url,
  options = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const parseTimestampToMs = (value, assumeSeconds) => {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return assumeSeconds ? Math.round(num * 1000) : Math.round(num);
};

const normalizeTranscriptText = (text) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const extractBalancedJsonObject = (source, startAt) => {
  const start = source.indexOf("{", startAt);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let quote = null;
  let escaping = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (!ch) continue;

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      if (quote && ch === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
};

const extractInitialPlayerResponse = (html) => {
  const tokenIndex = html.indexOf("ytInitialPlayerResponse");
  if (tokenIndex < 0) return null;
  const assignmentIndex = html.indexOf("=", tokenIndex);
  if (assignmentIndex < 0) return null;
  const objectText = extractBalancedJsonObject(html, assignmentIndex);
  if (!objectText) return null;

  try {
    const parsed = JSON.parse(objectText);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const extractInnertubeApiKey = (html) => {
  const match = html.match(
    /"INNERTUBE_API_KEY":"([^"]+)"|INNERTUBE_API_KEY\\":\\"([^\\"]+)\\"/,
  );
  const key = match?.[1] ?? match?.[2] ?? null;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
};

const parseBootstrapFromScript = (source) => {
  const sanitizedSource = sanitizeYoutubeJsonResponse(source.trimStart());
  for (let index = 0; index >= 0; ) {
    index = sanitizedSource.indexOf("ytcfg.set", index);
    if (index < 0) break;
    const object = extractBalancedJsonObject(sanitizedSource, index);
    if (object) {
      try {
        const parsed = JSON.parse(object);
        if (isRecord(parsed)) return parsed;
      } catch {
        // keep searching
      }
    }
    index += "ytcfg.set".length;
  }

  const varIndex = sanitizedSource.indexOf("var ytcfg");
  if (varIndex >= 0) {
    const object = extractBalancedJsonObject(sanitizedSource, varIndex);
    if (object) {
      try {
        const parsed = JSON.parse(object);
        if (isRecord(parsed)) return parsed;
      } catch {
        return null;
      }
    }
  }

  return null;
};

const extractYoutubeBootstrapConfig = (html) => {
  const config = parseBootstrapFromScript(html);
  if (config) return config;
  return parseBootstrapFromScript(sanitizeYoutubeJsonResponse(html));
};

const extractYoutubeiTranscriptConfig = (html) => {
  try {
    const bootstrapConfig = extractYoutubeBootstrapConfig(html);
    if (!bootstrapConfig) return null;

    const parametersMatch = html.match(YOUTUBEI_TRANSCRIPT_ENDPOINT_REGEX);
    if (!parametersMatch) return null;

    const params = parametersMatch[1];
    if (!params) return null;

    const apiKeyCandidate = bootstrapConfig.INNERTUBE_API_KEY;
    const apiKey = typeof apiKeyCandidate === "string" ? apiKeyCandidate : null;
    const contextCandidate = bootstrapConfig.INNERTUBE_CONTEXT;
    const context = isRecord(contextCandidate) ? contextCandidate : null;
    if (!(apiKey && context)) return null;

    const visitorDataCandidate = bootstrapConfig.VISITOR_DATA;
    const visitorDataFromBootstrap =
      typeof visitorDataCandidate === "string" ? visitorDataCandidate : null;
    const contextClientCandidate = context.client;
    const contextClient = isRecord(contextClientCandidate)
      ? contextClientCandidate
      : null;
    const visitorDataFromContext =
      typeof contextClient?.visitorData === "string"
        ? contextClient.visitorData
        : null;
    const visitorData = visitorDataFromBootstrap ?? visitorDataFromContext;

    const clientNameCandidate = bootstrapConfig.INNERTUBE_CONTEXT_CLIENT_NAME;
    const clientName =
      typeof clientNameCandidate === "number"
        ? String(clientNameCandidate)
        : typeof clientNameCandidate === "string"
          ? clientNameCandidate
          : null;
    const clientVersionCandidate =
      bootstrapConfig.INNERTUBE_CONTEXT_CLIENT_VERSION;
    const clientVersion =
      typeof clientVersionCandidate === "string"
        ? clientVersionCandidate
        : null;
    const pageClCandidate = bootstrapConfig.PAGE_CL;
    const pageCl = typeof pageClCandidate === "number" ? pageClCandidate : null;
    const pageLabelCandidate = bootstrapConfig.PAGE_BUILD_LABEL;
    const pageLabel =
      typeof pageLabelCandidate === "string" ? pageLabelCandidate : null;

    return {
      apiKey,
      context,
      params,
      visitorData,
      clientName,
      clientVersion,
      pageCl,
      pageLabel,
    };
  } catch {
    return null;
  }
};

const extractYoutubeiBootstrap = (html) => {
  try {
    const bootstrapConfig = extractYoutubeBootstrapConfig(html);
    if (!bootstrapConfig) return null;

    const apiKeyCandidate = bootstrapConfig.INNERTUBE_API_KEY;
    const apiKey = typeof apiKeyCandidate === "string" ? apiKeyCandidate : null;
    const contextCandidate = bootstrapConfig.INNERTUBE_CONTEXT;
    const context = isRecord(contextCandidate) ? contextCandidate : null;
    const clientVersionCandidate = bootstrapConfig.INNERTUBE_CLIENT_VERSION;
    const clientVersion =
      typeof clientVersionCandidate === "string"
        ? clientVersionCandidate
        : null;
    const clientNameCandidate = bootstrapConfig.INNERTUBE_CONTEXT_CLIENT_NAME;
    const clientName =
      typeof clientNameCandidate === "number"
        ? String(clientNameCandidate)
        : typeof clientNameCandidate === "string"
          ? clientNameCandidate
          : null;
    const contextClientCandidate = context?.client;
    const contextClient = isRecord(contextClientCandidate)
      ? contextClientCandidate
      : null;
    const visitorDataCandidate = contextClient?.visitorData;
    const visitorData =
      typeof visitorDataCandidate === "string" ? visitorDataCandidate : null;
    const pageClCandidate = bootstrapConfig.PAGE_CL;
    const pageCl = typeof pageClCandidate === "number" ? pageClCandidate : null;
    const pageLabelCandidate = bootstrapConfig.PAGE_BUILD_LABEL;
    const pageLabel =
      typeof pageLabelCandidate === "string" ? pageLabelCandidate : null;
    const xsrfCandidate = bootstrapConfig.XSRF_TOKEN;
    const xsrfToken = typeof xsrfCandidate === "string" ? xsrfCandidate : null;

    if (!context) return null;

    return {
      apiKey,
      context,
      clientVersion,
      clientName,
      visitorData,
      pageCl,
      pageLabel,
      xsrfToken,
    };
  } catch {
    return null;
  }
};

const extractTranscriptFromTranscriptEndpoint = (data) => {
  if (!isRecord(data)) return null;
  const actions = Array.isArray(data.actions) ? data.actions : null;
  if (!actions || actions.length === 0) return null;

  const updatePanel = actions[0]?.updateEngagementPanelAction;
  if (!updatePanel) return null;
  const transcriptContent = updatePanel.content;
  if (!transcriptContent) return null;
  const searchPanel = transcriptContent.transcriptRenderer;
  if (!searchPanel) return null;
  const segmentListNode = searchPanel.content;
  if (!segmentListNode) return null;
  const listRenderer = segmentListNode.transcriptSearchPanelRenderer;
  if (!listRenderer) return null;
  const body = listRenderer.body;
  if (!body) return null;
  const segmentBody = body.transcriptSegmentListRenderer;
  if (!segmentBody) return null;
  const segmentList = Array.isArray(segmentBody.initialSegments)
    ? segmentBody.initialSegments
    : null;
  if (!segmentList || segmentList.length === 0) return null;

  const lines = [];
  const segments = [];
  segmentList.forEach((segment) => {
    const renderer = segment?.transcriptSegmentRenderer;
    if (!renderer) return;
    const snippet = renderer.snippet;
    if (!snippet) return;
    const runs = Array.isArray(snippet.runs) ? snippet.runs : null;
    if (!runs) return;

    const text = runs
      .map((run) => (typeof run?.text === "string" ? run.text : ""))
      .join("")
      .trim();
    if (!text) return;

    lines.push(text);
    const startMs = parseTimestampToMs(renderer.startMs, false);
    const durationMs = parseTimestampToMs(renderer.durationMs, false);
    if (startMs != null) {
      segments.push({
        startMs,
        endMs: durationMs != null ? startMs + durationMs : null,
        text: text.replace(/\s+/g, " ").trim(),
      });
    }
  });

  if (lines.length === 0) return null;
  return {
    text: lines.join("\n"),
    segments: segments.length > 0 ? segments : null,
  };
};

const fetchTranscriptFromTranscriptEndpoint = async (
  fetchImpl,
  config,
  originalUrl,
  timeoutMs,
) => {
  try {
    const contextRecord = config.context;
    const existingClient = isRecord(contextRecord.client)
      ? contextRecord.client
      : {};

    const payload = {
      context: {
        ...contextRecord,
        client: {
          ...existingClient,
          originalUrl,
        },
      },
      params: config.params,
    };

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...REQUEST_HEADERS,
    };

    if (config.clientName) {
      headers["X-Youtube-Client-Name"] = config.clientName;
    }
    if (config.clientVersion) {
      headers["X-Youtube-Client-Version"] = config.clientVersion;
    }
    if (config.visitorData) {
      headers["X-Goog-Visitor-Id"] = config.visitorData;
    }
    if (typeof config.pageCl === "number" && Number.isFinite(config.pageCl)) {
      headers["X-Youtube-Page-CL"] = String(config.pageCl);
    }
    if (config.pageLabel) {
      headers["X-Youtube-Page-Label"] = config.pageLabel;
    }

    const response = await fetchWithTimeout(
      fetchImpl,
      `https://www.youtube.com/youtubei/v1/get_transcript?key=${config.apiKey}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );

    if (!response.ok) return null;
    const json = await response.json();
    return extractTranscriptFromTranscriptEndpoint(json);
  } catch {
    return null;
  }
};

const extractTranscriptFromPlayerPayload = async (
  fetchImpl,
  payload,
  skipAutoGenerated,
  timeoutMs,
) => {
  const captionsCandidate = payload.captions;
  const captions = isRecord(captionsCandidate) ? captionsCandidate : null;
  const rendererCandidate =
    (captions ? captions.playerCaptionsTracklistRenderer : null) ??
    payload.playerCaptionsTracklistRenderer;

  const renderer = isRecord(rendererCandidate) ? rendererCandidate : null;
  const captionTracks = Array.isArray(renderer?.captionTracks)
    ? renderer.captionTracks
    : null;
  const automaticTracks = Array.isArray(renderer?.automaticCaptions)
    ? renderer.automaticCaptions
    : null;

  const orderedTracks = [];
  if (captionTracks) {
    orderedTracks.push(...captionTracks.filter((track) => isRecord(track)));
  }
  if (!skipAutoGenerated && automaticTracks) {
    orderedTracks.push(...automaticTracks.filter((track) => isRecord(track)));
  }

  const filteredTracks = orderedTracks.filter((track) => isRecord(track));
  const sortedTracks = filteredTracks.slice().sort((a, b) => {
    const aKind = typeof a.kind === "string" ? a.kind : "";
    const bKind = typeof b.kind === "string" ? b.kind : "";
    if (aKind === "asr" && bKind !== "asr") return 1;
    if (bKind === "asr" && aKind !== "asr") return -1;

    const aLang = typeof a.languageCode === "string" ? a.languageCode : "";
    const bLang = typeof b.languageCode === "string" ? b.languageCode : "";
    if (aLang === "en" && bLang !== "en") return -1;
    if (bLang === "en" && aLang !== "en") return 1;
    return 0;
  });

  const seenLanguages = new Set();
  const normalizedTracks = [];
  sortedTracks.forEach((track) => {
    const lang =
      typeof track.languageCode === "string"
        ? track.languageCode.toLowerCase()
        : "";
    if (lang && seenLanguages.has(lang)) return;
    if (lang) seenLanguages.add(lang);
    normalizedTracks.push(track);
  });

  const tracksToUse = skipAutoGenerated
    ? normalizedTracks.filter((track) => track.kind !== "asr")
    : normalizedTracks;

  if (tracksToUse.length === 0) return null;

  for (let i = 0; i < tracksToUse.length; i += 1) {
    const candidate = await downloadCaptionTrack(
      fetchImpl,
      tracksToUse[i],
      timeoutMs,
    );
    if (candidate) return candidate;
  }

  return null;
};

const downloadCaptionTrack = async (fetchImpl, track, timeoutMs) => {
  const baseUrl =
    typeof track.baseUrl === "string"
      ? track.baseUrl
      : typeof track.url === "string"
        ? track.url
        : null;
  if (!baseUrl) return null;

  const json3Url = (() => {
    try {
      const parsed = new URL(baseUrl);
      parsed.searchParams.set("fmt", "json3");
      parsed.searchParams.set("alt", "json");
      return parsed.toString();
    } catch {
      const separator = baseUrl.includes("?") ? "&" : "?";
      return `${baseUrl}${separator}fmt=json3&alt=json`;
    }
  })();

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      json3Url,
      { headers: REQUEST_HEADERS },
      timeoutMs,
    );
    if (!response.ok) {
      return await downloadXmlTranscript(fetchImpl, baseUrl, timeoutMs);
    }

    const text = await response.text();
    if (!text) {
      return await downloadXmlTranscript(fetchImpl, baseUrl, timeoutMs);
    }

    const jsonResult = parseJsonTranscript(text);
    if (jsonResult) return jsonResult;
    const xmlFallback = parseXmlTranscript(text);
    if (xmlFallback) return xmlFallback;
    return await downloadXmlTranscript(fetchImpl, baseUrl, timeoutMs);
  } catch {
    return await downloadXmlTranscript(fetchImpl, baseUrl, timeoutMs);
  }
};

const downloadXmlTranscript = async (fetchImpl, baseUrl, timeoutMs) => {
  const xmlUrl = baseUrl.replaceAll(/&fmt=[^&]+/g, "");
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      xmlUrl,
      { headers: REQUEST_HEADERS },
      timeoutMs,
    );
    if (!response.ok) return null;
    const text = await response.text();
    const jsonResult = parseJsonTranscript(text);
    if (jsonResult) return jsonResult;
    return parseXmlTranscript(text);
  } catch {
    return null;
  }
};

const parseJsonTranscript = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const events = Array.isArray(parsed.events) ? parsed.events : null;
    if (!events) return null;

    const lines = [];
    const segments = [];
    events.forEach((event) => {
      if (!isRecord(event)) return;
      const segs = Array.isArray(event.segs) ? event.segs : null;
      if (!segs) return;
      const text = segs
        .map((seg) => (typeof seg?.utf8 === "string" ? seg.utf8 : ""))
        .join("")
        .trim();
      if (!text) return;

      lines.push(text);
      const startMs = parseTimestampToMs(event.tStartMs, false);
      const durationMs = parseTimestampToMs(event.dDurationMs, false);
      if (startMs != null) {
        segments.push({
          startMs,
          endMs: durationMs != null ? startMs + durationMs : null,
          text: text.replace(/\s+/g, " ").trim(),
        });
      }
    });

    const transcript = lines.join("\n").trim();
    if (!transcript) return null;
    return {
      text: transcript,
      segments: segments.length > 0 ? segments : null,
    };
  } catch {
    return null;
  }
};

const parseXmlTranscript = (xml) => {
  const pattern = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  const lines = [];
  const segments = [];
  let match = pattern.exec(xml);
  while (match) {
    const content = match[1] ?? "";
    const decoded = decodeHtmlEntities(content).replaceAll(/\s+/g, " ").trim();
    if (decoded.length > 0) {
      lines.push(decoded);
      const tag = match[0] ?? "";
      const startMatch = tag.match(/\bstart\s*=\s*(['"])([^'"]+)\1/i);
      const durMatch = tag.match(/\bdur\s*=\s*(['"])([^'"]+)\1/i);
      const startMs = startMatch?.[2]
        ? parseTimestampToMs(startMatch[2], true)
        : null;
      const durationMs = durMatch?.[2]
        ? parseTimestampToMs(durMatch[2], true)
        : null;
      if (startMs != null) {
        segments.push({
          startMs,
          endMs: durationMs != null ? startMs + durationMs : null,
          text: decoded.replace(/\s+/g, " ").trim(),
        });
      }
    }
    match = pattern.exec(xml);
  }

  const transcript = lines.join("\n").trim();
  if (!transcript) return null;
  return { text: transcript, segments: segments.length > 0 ? segments : null };
};

const fetchTranscriptViaAndroidPlayer = async (
  fetchImpl,
  html,
  videoId,
  skipAutoGenerated,
  timeoutMs,
) => {
  const apiKey = extractInnertubeApiKey(html);
  if (!apiKey) return null;

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...REQUEST_HEADERS,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "20.10.38",
            },
          },
          videoId,
        }),
      },
      timeoutMs,
    );

    if (!response.ok) return null;
    const parsed = await response.json();
    if (!isRecord(parsed)) return null;

    return await extractTranscriptFromPlayerPayload(
      fetchImpl,
      parsed,
      skipAutoGenerated,
      timeoutMs,
    );
  } catch {
    return null;
  }
};

const fetchTranscriptFromCaptionTracks = async (
  fetchImpl,
  { html, originalUrl, videoId, skipAutoGenerated, timeoutMs },
) => {
  const initialPlayerResponse = extractInitialPlayerResponse(html);
  if (initialPlayerResponse) {
    const transcript = await extractTranscriptFromPlayerPayload(
      fetchImpl,
      initialPlayerResponse,
      skipAutoGenerated,
      timeoutMs,
    );
    if (transcript) return transcript;
  }

  const bootstrap = extractYoutubeiBootstrap(html);
  if (!bootstrap) {
    return await fetchTranscriptViaAndroidPlayer(
      fetchImpl,
      html,
      videoId,
      skipAutoGenerated,
      timeoutMs,
    );
  }

  const {
    apiKey,
    clientName,
    clientVersion,
    context,
    pageCl,
    pageLabel,
    visitorData,
    xsrfToken,
  } = bootstrap;
  if (!apiKey) {
    return await fetchTranscriptViaAndroidPlayer(
      fetchImpl,
      html,
      videoId,
      skipAutoGenerated,
      timeoutMs,
    );
  }

  const contextRecord = context;
  const clientContext = isRecord(contextRecord.client)
    ? contextRecord.client
    : {};
  const requestBody = {
    context: {
      ...contextRecord,
      client: {
        ...clientContext,
        originalUrl,
      },
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: "HTML5_PREF_WANTS",
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...REQUEST_HEADERS,
    };

    if (clientName) {
      headers["X-Youtube-Client-Name"] = clientName;
    }
    if (clientVersion) {
      headers["X-Youtube-Client-Version"] = clientVersion;
    }
    if (visitorData) {
      headers["X-Goog-Visitor-Id"] = visitorData;
    }
    if (typeof pageCl === "number" && Number.isFinite(pageCl)) {
      headers["X-Youtube-Page-CL"] = String(pageCl);
    }
    if (pageLabel) {
      headers["X-Youtube-Page-Label"] = pageLabel;
    }
    if (xsrfToken) {
      headers["X-Youtube-Identity-Token"] = xsrfToken;
    }

    const response = await fetchWithTimeout(
      fetchImpl,
      `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      },
      timeoutMs,
    );

    if (!response.ok) {
      return await fetchTranscriptViaAndroidPlayer(
        fetchImpl,
        html,
        videoId,
        skipAutoGenerated,
        timeoutMs,
      );
    }

    const raw = await response.text();
    const sanitized = sanitizeYoutubeJsonResponse(raw);
    const parsed = JSON.parse(sanitized);
    if (!isRecord(parsed)) {
      return await fetchTranscriptViaAndroidPlayer(
        fetchImpl,
        html,
        videoId,
        skipAutoGenerated,
        timeoutMs,
      );
    }

    const transcript = await extractTranscriptFromPlayerPayload(
      fetchImpl,
      parsed,
      skipAutoGenerated,
      timeoutMs,
    );
    if (transcript) return transcript;

    return await fetchTranscriptViaAndroidPlayer(
      fetchImpl,
      html,
      videoId,
      skipAutoGenerated,
      timeoutMs,
    );
  } catch {
    return await fetchTranscriptViaAndroidPlayer(
      fetchImpl,
      html,
      videoId,
      skipAutoGenerated,
      timeoutMs,
    );
  }
};

const extractMetaContent = (html, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagMatch = html.match(
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  );
  if (!tagMatch) return null;
  const contentMatch = tagMatch[0].match(/content\s*=\s*(["'])([^"']+)\1/i);
  if (!contentMatch?.[2]) return null;
  return decodeHtmlEntities(contentMatch[2]);
};

export const extractYouTubeMetadata = (html) => {
  const playerResponse = extractInitialPlayerResponse(html);
  const videoDetails = isRecord(playerResponse?.videoDetails)
    ? playerResponse.videoDetails
    : null;
  const title =
    typeof videoDetails?.title === "string" ? videoDetails.title : null;
  const description =
    typeof videoDetails?.shortDescription === "string"
      ? videoDetails.shortDescription
      : null;

  const fallbackTitle = title || extractMetaContent(html, "og:title") || null;
  const fallbackDescription =
    description ||
    extractMetaContent(html, "description") ||
    extractMetaContent(html, "og:description") ||
    null;

  return {
    title: fallbackTitle,
    description: fallbackDescription,
  };
};

export const isYouTubeUrl = (rawUrl) => {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return hostname.includes("youtube.com") || hostname.includes("youtu.be");
  } catch {
    const lower = rawUrl.toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
  }
};

export const extractYouTubeVideoId = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    let candidate = null;

    if (hostname === "youtu.be") {
      candidate = url.pathname.split("/")[1] ?? null;
    }

    if (hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/watch")) {
        candidate = url.searchParams.get("v");
      } else if (url.pathname.startsWith("/shorts/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/embed/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/v/")) {
        candidate = url.pathname.split("/")[2] ?? null;
      }
    }

    const trimmed = candidate?.trim() ?? "";
    if (!trimmed) return null;
    return YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
};

const fetchWatchHtml = async (fetchImpl, url, timeoutMs) => {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          ...REQUEST_HEADERS,
        },
      },
      timeoutMs,
    );
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
};

export const fetchYouTubeTranscript = async ({
  url,
  html,
  mode = "auto",
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  if (!YOUTUBE_URL_PATTERN.test(url)) {
    return { text: null, source: null, segments: null, html };
  }

  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return { text: null, source: null, segments: null, html };
  }

  let pageHtml = html;
  const hasBootstrap =
    typeof pageHtml === "string" &&
    /ytcfg\.set|ytInitialPlayerResponse/.test(pageHtml);
  if (!hasBootstrap) {
    pageHtml = await fetchWatchHtml(fetchImpl, url, timeoutMs);
  }

  if (!pageHtml) {
    return { text: null, source: "unavailable", segments: null, html: null };
  }

  if (mode !== "no-auto") {
    const config = extractYoutubeiTranscriptConfig(pageHtml);
    if (config) {
      const transcript = await fetchTranscriptFromTranscriptEndpoint(
        fetchImpl,
        config,
        url,
        timeoutMs,
      );
      if (transcript?.text) {
        return {
          text: normalizeTranscriptText(transcript.text),
          source: "youtubei",
          segments: transcript.segments ?? null,
          html: pageHtml,
        };
      }
    }
  }

  const captionTranscript = await fetchTranscriptFromCaptionTracks(fetchImpl, {
    html: pageHtml,
    originalUrl: url,
    videoId,
    skipAutoGenerated: mode === "no-auto",
    timeoutMs,
  });

  if (captionTranscript?.text) {
    return {
      text: normalizeTranscriptText(captionTranscript.text),
      source: "captionTracks",
      segments: captionTranscript.segments ?? null,
      html: pageHtml,
    };
  }

  return { text: null, source: "unavailable", segments: null, html: pageHtml };
};

export const resolveYouTubeContent = async ({
  url,
  html,
  mode,
  fetchImpl,
  timeoutMs,
}) => {
  const transcriptResult = await fetchYouTubeTranscript({
    url,
    html,
    mode,
    fetchImpl,
    timeoutMs,
  });

  const metadata = transcriptResult.html
    ? extractYouTubeMetadata(transcriptResult.html)
    : html
      ? extractYouTubeMetadata(html)
      : null;

  if (transcriptResult.text) {
    return {
      text: transcriptResult.text,
      source: transcriptResult.source,
      segments: transcriptResult.segments ?? null,
      html: transcriptResult.html ?? html,
      title: metadata?.title ?? null,
    };
  }

  if (metadata?.description) {
    return {
      text: normalizeTranscriptText(metadata.description),
      source: "description",
      segments: null,
      html: transcriptResult.html ?? html,
      title: metadata.title ?? null,
    };
  }

  return {
    text: null,
    source: "unavailable",
    segments: null,
    html: transcriptResult.html ?? html,
    title: metadata?.title ?? null,
  };
};

export { normalizeTranscriptText };
