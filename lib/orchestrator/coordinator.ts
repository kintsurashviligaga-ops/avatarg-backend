// lib/orchestrator/coordinator.ts
// ✅ Vercel Edge Runtime friendly (fetch-only, no Node-only deps).

export type PipelineStage =
  | "structure_generation"
  | "gpt_edit"
  | "georgian_localization"
  | "voiceover_generation"
  | "visual_prompting"
  | "video_rendering";

export interface PentagonInput {
  requestId: string;
  userPrompt: string;
  constraints?: {
    maxScenes?: number;
    maxDurationSec?: number;
    style?: string;
  };
}

export interface VideoStructure {
  title: string;
  logline: string;
  scenes: Array<{
    id: string;
    beat: string;
    durationSec: number;
    camera: string;
    setting: string;
    characters: string[];
    action: string;
  }>;
}

export interface EditedStructure extends VideoStructure {
  globalNotes: string[];
}

export interface LocalizedStructureKA {
  title_ka: string;
  logline_ka: string;
  scenes_ka: Array<{
    id: string;
    beat_ka: string;
    camera_ka: string;
    setting_ka: string;
    characters_ka: string[];
    action_ka: string;
    narration_ka: string;
  }>;
}

export interface VoiceoverPack {
  voiceovers: Array<{
    sceneId: string;
    text: string;
    audioUrl: string; // data:audio/mpeg;base64,... OR https://...
    provider: "elevenlabs" | "google_tts" | "none";
  }>;
}

export interface VisualPromptPack {
  shots: Array<{
    sceneId: string;
    prompt: string; // Pexels keywords (or later: image gen prompt)
  }>;
}

export interface VideoRender {
  sceneId: string;
  imageUrl: string;
  videoUrl: string;
}

export interface PentagonOutput {
  requestId: string;
  structure: VideoStructure;
  edited: EditedStructure;
  localized: LocalizedStructureKA;
  voiceovers: VoiceoverPack;
  visualPrompts: VisualPromptPack;
  videos: VideoRender[];

  // NOTE: This is NOT the final stitched video.
  // It's a "first available clip" fallback, while worker renders final mp4.
  finalVideoUrl: string;

  // ✅ NEW: Supabase render job id for frontend polling
  renderJobId?: string;

  meta: {
    startedAt: string;
    finishedAt: string;
    stageTimingsMs: Partial<Record<PipelineStage, number>>;
  };
}

export class PipelineError extends Error {
  public readonly stage: PipelineStage;
  public readonly code:
    | "BAD_REQUEST"
    | "TIMEOUT"
    | "RATE_LIMIT"
    | "PROVIDER_UNAVAILABLE"
    | "INVALID_JSON"
    | "UPSTREAM_ERROR"
    | "UNKNOWN";
  public readonly retryable: boolean;

  constructor(args: {
    stage: PipelineStage;
    code: PipelineError["code"];
    message: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = "PipelineError";
    this.stage = args.stage;
    this.code = args.code;
    this.retryable = args.retryable;
    if (args.cause) (this as any).cause = args.cause;
  }
}

interface EnvConfig {
  openai: { apiKey: string; baseUrl: string; model: string };
  elevenlabs: { apiKey: string; baseUrl: string; voiceId: string; sfxApiKey: string };
  googleTts: { apiKey: string; baseUrl: string; voiceName: string; languageCode: string };
  pexels: { apiKey: string; baseUrl: string };
  supabase: {
    url: string;
    serviceRoleKey: string;
    renderJobsTable: string;
    audioBucket?: string;
    publicBaseUrl?: string; // `${SUPABASE_URL}/storage/v1/object/public`
  };
  defaultTimeoutMs: number;
}

/* -------------------------- ENV HELPERS -------------------------- */

function getEnvVar(key: string): string {
  const v = (process.env as any)?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function mustEnv(stage: PipelineStage, key: string): string {
  const v = getEnvVar(key);
  if (!v) {
    throw new PipelineError({
      stage,
      code: "BAD_REQUEST",
      message: `Missing required environment variable: ${key}`,
      retryable: false,
    });
  }
  return v;
}

function toInt(v: string, fallback: number): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function loadEnvConfig(): EnvConfig {
  // ✅ Minimal required for this pipeline
  mustEnv("structure_generation", "OPENAI_API_KEY");
  mustEnv("voiceover_generation", "GOOGLE_TTS_API_KEY");
  mustEnv("video_rendering", "PEXELS_API_KEY");

  const supabaseUrl = getEnvVar("SUPABASE_URL");
  const supabaseServiceRole = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  return {
    openai: {
      apiKey: getEnvVar("OPENAI_API_KEY"),
      baseUrl: "https://api.openai.com/v1",
      model: getEnvVar("OPENAI_MODEL") || "gpt-4o-mini",
    },
    elevenlabs: {
      apiKey: getEnvVar("ELEVENLABS_API_KEY") || "",
      baseUrl: "https://api.elevenlabs.io/v1",
      voiceId: getEnvVar("ELEVENLABS_VOICE_ID") || "",
      sfxApiKey: getEnvVar("ELEVENLABS_SOUND_EFFECTS_API_KEY") || "",
    },
    googleTts: {
      apiKey: getEnvVar("GOOGLE_TTS_API_KEY"),
      baseUrl: "https://texttospeech.googleapis.com/v1",
      voiceName: getEnvVar("GOOGLE_TTS_VOICE_NAME") || "ka-GE-Standard-A",
      languageCode: getEnvVar("GOOGLE_TTS_LANGUAGE_CODE") || "ka-GE",
    },
    pexels: {
      apiKey: getEnvVar("PEXELS_API_KEY"),
      baseUrl: "https://api.pexels.com/videos",
    },
    supabase: {
      url: supabaseUrl || "",
      serviceRoleKey: supabaseServiceRole || "",
      renderJobsTable: getEnvVar("SUPABASE_RENDER_JOBS_TABLE") || "render_jobs",
      audioBucket: getEnvVar("SUPABASE_AUDIO_BUCKET") || "",
      publicBaseUrl: supabaseUrl ? `${supabaseUrl}/storage/v1/object/public` : "",
    },
    defaultTimeoutMs: toInt(getEnvVar("DEFAULT_TIMEOUT_MS") || "30000", 30000),
  };
}

/* -------------------------- FETCH HELPERS -------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    return resp;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") throw new Error("TIMEOUT");
    throw err;
  }
}

async function requestJson<T>(
  stage: PipelineStage,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxRetries: number
): Promise<T> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      const resp = await fetchWithTimeout(url, init, timeoutMs);

      if (!resp.ok) {
        const status = resp.status;
        const text = await resp.text().catch(() => "unable to read error");

        if (status === 429) {
          throw new PipelineError({ stage, code: "RATE_LIMIT", message: `Rate limit: ${text}`, retryable: true });
        }
        if (status >= 500) {
          throw new PipelineError({
            stage,
            code: "PROVIDER_UNAVAILABLE",
            message: `Server error ${status}: ${text}`,
            retryable: true,
          });
        }
        throw new PipelineError({ stage, code: "UPSTREAM_ERROR", message: `HTTP ${status}: ${text}`, retryable: false });
      }

      return (await resp.json()) as T;
    } catch (e: any) {
      if (e instanceof PipelineError) {
        if (!e.retryable) throw e;
        lastError = e;
      } else if (e?.message === "TIMEOUT") {
        lastError = new PipelineError({ stage, code: "TIMEOUT", message: "Request timed out", retryable: true, cause: e });
      } else {
        lastError = new PipelineError({ stage, code: "UNKNOWN", message: e?.message || "Unknown error", retryable: false, cause: e });
      }

      attempt += 1;
      if (attempt < maxRetries) {
        const backoff = 400 * Math.pow(2.2, attempt - 1);
        await sleep(backoff);
      }
    }
  }

  throw (
    lastError ||
    new PipelineError({
      stage,
      code: "UNKNOWN",
      message: "Max retries exceeded",
      retryable: false,
    })
  );
}

/* -------------------------- JSON HELPERS -------------------------- */

function cleanJsonString(text: string): string {
  let cleaned = text || "";
  cleaned = cleaned.replace(/```json\s*/g, "");
  cleaned = cleaned.replace(/```\s*/g, "");
  return cleaned.trim();
}

function isNonEmptyString(x: any): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function ensureArray<T>(x: any, fallback: T[] = []): T[] {
  return Array.isArray(x) ? (x as T[]) : fallback;
}

/* -------------------------- STRUCTURE -------------------------- */

function safeFallbackStructure(input: PentagonInput): VideoStructure {
  const maxDuration = input.constraints?.maxDurationSec || 120;
  const duration = Math.min(15, Math.max(6, Math.floor(maxDuration / 6)));

  return {
    title: "Untitled",
    logline: input.userPrompt.slice(0, 140),
    scenes: [
      {
        id: "scene_1",
        beat: "A concise, coherent opening beat aligned to the user prompt.",
        durationSec: duration,
        camera: "wide shot",
        setting: "neutral",
        characters: ["Narrator"],
        action: input.userPrompt.slice(0, 200),
      },
    ],
  };
}

function normalizeStructure(structure: any, input: PentagonInput): VideoStructure {
  const maxScenes = input.constraints?.maxScenes || 6;
  const maxDuration = input.constraints?.maxDurationSec || 120;

  const title = isNonEmptyString(structure?.title) ? structure.title : "Untitled";
  const logline = isNonEmptyString(structure?.logline) ? structure.logline : input.userPrompt.slice(0, 140);

  const scenesRaw = ensureArray<any>(structure?.scenes, []);
  const scenesSafe = scenesRaw
    .filter((s) => s && (isNonEmptyString(s.id) || isNonEmptyString(s.beat) || isNonEmptyString(s.action)))
    .slice(0, maxScenes)
    .map((s, idx) => ({
      id: isNonEmptyString(s.id) ? s.id : `scene_${idx + 1}`,
      beat: isNonEmptyString(s.beat) ? s.beat : "Beat",
      durationSec: typeof s.durationSec === "number" && s.durationSec > 0 ? Math.floor(s.durationSec) : 10,
      camera: isNonEmptyString(s.camera) ? s.camera : "wide shot",
      setting: isNonEmptyString(s.setting) ? s.setting : "location",
      characters: ensureArray<string>(s.characters, []).filter(isNonEmptyString),
      action: isNonEmptyString(s.action) ? s.action : (isNonEmptyString(s.beat) ? s.beat : input.userPrompt),
    }));

  if (scenesSafe.length === 0) return safeFallbackStructure(input);

  let total = 0;
  for (let i = 0; i < scenesSafe.length; i++) total += scenesSafe[i].durationSec;

  if (total > maxDuration) {
    const scale = maxDuration / total;
    for (let i = 0; i < scenesSafe.length; i++) {
      scenesSafe[i].durationSec = Math.max(3, Math.floor(scenesSafe[i].durationSec * scale));
    }
  }

  return { title, logline, scenes: scenesSafe };
}

async function stageStructure(input: PentagonInput, config: EnvConfig): Promise<VideoStructure> {
  const maxScenes = input.constraints?.maxScenes || 6;
  const maxDuration = input.constraints?.maxDurationSec || 120;

  const systemPrompt = [
    "You are a video structure architect.",
    "Return ONLY valid JSON matching this schema (no markdown, no commentary):",
    "{",
    '  "title": "string",',
    '  "logline": "string",',
    '  "scenes": [',
    "    {",
    '      "id": "scene_1",',
    '      "beat": "string",',
    '      "durationSec": 10,',
    '      "camera": "string",',
    '      "setting": "string",',
    '      "characters": ["string"],',
    '      "action": "string"',
    "    }",
    "  ]",
    "}",
    "",
    "RULES:",
    `- scenes.length <= ${maxScenes}`,
    `- sum(durationSec) <= ${maxDuration}`,
    "- IDs must be unique: scene_1, scene_2, ...",
    "- Output MUST be a JSON object only.",
  ].join("\n");

  const requestBody = {
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 2500,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "structure_generation",
    `${config.openai.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  const content = response?.choices?.[0]?.message?.content || "";
  if (!isNonEmptyString(content)) return safeFallbackStructure(input);

  try {
    const parsed = JSON.parse(cleanJsonString(content));
    return normalizeStructure(parsed, input);
  } catch {
    return safeFallbackStructure(input);
  }
}

async function stageEdit(structure: VideoStructure, input: PentagonInput, config: EnvConfig): Promise<EditedStructure> {
  const maxScenes = input.constraints?.maxScenes || 6;
  const maxDuration = input.constraints?.maxDurationSec || 120;

  const systemPrompt = [
    "You are a professional video editor.",
    "Refine the provided JSON structure for pacing and clarity.",
    "Return ONLY valid JSON (no markdown, no commentary) with the SAME schema PLUS:",
    '{ "globalNotes": ["string"] }',
    "",
    "CONSTRAINTS:",
    `- scenes.length <= ${maxScenes}`,
    `- sum(durationSec) <= ${maxDuration}`,
    "- Preserve scene IDs exactly.",
  ].join("\n");

  const requestBody = {
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(structure) },
    ],
    temperature: 0.4,
    max_tokens: 2500,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "gpt_edit",
    `${config.openai.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  const content = response?.choices?.[0]?.message?.content || "";
  if (!isNonEmptyString(content)) return { ...structure, globalNotes: ["Edit stage returned empty output."] };

  try {
    const parsed = JSON.parse(cleanJsonString(content));
    const normalized = normalizeStructure(parsed, input);

    const edited: EditedStructure = {
      ...normalized,
      globalNotes: ensureArray<string>(parsed?.globalNotes, []),
    };

    // duration hard cap
    let totalDuration = 0;
    for (let i = 0; i < edited.scenes.length; i++) totalDuration += edited.scenes[i].durationSec;
    if (totalDuration > maxDuration) {
      const scale = maxDuration / totalDuration;
      for (let i = 0; i < edited.scenes.length; i++) {
        edited.scenes[i].durationSec = Math.max(3, Math.floor(edited.scenes[i].durationSec * scale));
      }
      edited.globalNotes.push(`Scaled durations to fit ${maxDuration}s total.`);
    }

    if (edited.scenes.length > maxScenes) {
      edited.scenes = edited.scenes.slice(0, maxScenes);
      edited.globalNotes.push(`Truncated to ${maxScenes} scenes.`);
    }

    return edited;
  } catch {
    return { ...structure, globalNotes: ["Edit stage returned invalid JSON; using original structure."] };
  }
}

async function stageLocalize(edited: EditedStructure, config: EnvConfig): Promise<LocalizedStructureKA> {
  const systemPrompt = [
    "You are a Georgian (ka) localizer and script writer.",
    "Input is a JSON video structure in English.",
    "Output MUST be JSON only (no markdown, no commentary).",
    "You must produce:",
    "- title_ka (Georgian)",
    "- logline_ka (Georgian)",
    "- IMPORTANT: Use ONLY Georgian letters. No Latin words.",
    "- scenes_ka: array with same scene IDs, each with beat_ka, camera_ka, setting_ka, characters_ka, action_ka",
    "- narration_ka: 2-3 sentence Georgian narration for voiceover per scene.",
    "Use native Georgian script only.",
  ].join("\n");

  const requestBody = {
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(edited) },
    ],
    temperature: 0.2,
    max_tokens: 3500,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "georgian_localization",
    `${config.openai.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  const content = response?.choices?.[0]?.message?.content || "";
  if (!isNonEmptyString(content)) {
    return {
      title_ka: "უსათაურო",
      logline_ka: "",
      scenes_ka: edited.scenes.map((s) => ({
        id: s.id,
        beat_ka: s.beat,
        camera_ka: s.camera,
        setting_ka: s.setting,
        characters_ka: s.characters,
        action_ka: s.action,
        narration_ka: s.action,
      })),
    };
  }

  try {
    const parsed = JSON.parse(cleanJsonString(content));

    const scenesRaw = ensureArray<any>(parsed?.scenes_ka, []);
    const scenesSafe =
      scenesRaw.length > 0
        ? scenesRaw
        : edited.scenes.map((s) => ({
            id: s.id,
            beat_ka: "",
            camera_ka: "",
            setting_ka: "",
            characters_ka: [],
            action_ka: "",
            narration_ka: s.action,
          }));

    const scenesFinal = scenesSafe.map((scene: any) => ({
      id: isNonEmptyString(scene?.id) ? scene.id : "scene_1",
      beat_ka: isNonEmptyString(scene?.beat_ka) ? scene.beat_ka : "",
      camera_ka: isNonEmptyString(scene?.camera_ka) ? scene.camera_ka : "",
      setting_ka: isNonEmptyString(scene?.setting_ka) ? scene.setting_ka : "",
      characters_ka: ensureArray<string>(scene?.characters_ka, []).filter(isNonEmptyString),
      action_ka: isNonEmptyString(scene?.action_ka) ? scene.action_ka : "",
      narration_ka: isNonEmptyString(scene?.narration_ka) ? scene.narration_ka : "",
    }));

    return {
      title_ka: isNonEmptyString(parsed?.title_ka) ? parsed.title_ka : "უსათაურო",
      logline_ka: isNonEmptyString(parsed?.logline_ka) ? parsed.logline_ka : "",
      scenes_ka: scenesFinal,
    };
  } catch {
    return {
      title_ka: "უსათაურო",
      logline_ka: "",
      scenes_ka: edited.scenes.map((s) => ({
        id: s.id,
        beat_ka: s.beat,
        camera_ka: s.camera,
        setting_ka: s.setting,
        characters_ka: s.characters,
        action_ka: s.action,
        narration_ka: s.action,
      })),
    };
  }
}

/* -------------------------- VOICEOVER -------------------------- */

type LocalizedSceneKA = LocalizedStructureKA["scenes_ka"][number];

async function googleTTS(text: string, config: EnvConfig): Promise<string> {
  const url = `${config.googleTts.baseUrl}/text:synthesize?key=${encodeURIComponent(config.googleTts.apiKey)}`;

  const body = {
    input: { text },
    voice: { languageCode: config.googleTts.languageCode, name: config.googleTts.voiceName },
    audioConfig: { audioEncoding: "MP3" },
  };

  const data = await requestJson<any>(
    "voiceover_generation",
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    config.defaultTimeoutMs,
    2
  );

  const audioContent = data?.audioContent;
  if (!isNonEmptyString(audioContent)) {
    throw new PipelineError({
      stage: "voiceover_generation",
      code: "UPSTREAM_ERROR",
      message: "Google TTS returned empty audioContent",
      retryable: true,
    });
  }

  return `data:audio/mpeg;base64,${audioContent}`;
}

async function stageVoiceover(localized: LocalizedStructureKA, config: EnvConfig): Promise<VoiceoverPack> {
  const scenesRaw = Array.isArray(localized?.scenes_ka) ? localized.scenes_ka : [];
  const scenes: LocalizedSceneKA[] =
    scenesRaw.length > 0
      ? scenesRaw
      : [
          {
            id: "scene_1",
            beat_ka: localized?.title_ka || "",
            camera_ka: "",
            setting_ka: "",
            characters_ka: [],
            action_ka: localized?.logline_ka || "",
            narration_ka: `${localized?.title_ka || ""}. ${localized?.logline_ka || ""}`.trim(),
          },
        ];

  const voiceovers: VoiceoverPack["voiceovers"] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const text = (scene?.narration_ka ?? scene?.action_ka ?? scene?.beat_ka ?? "").toString().trim();

    if (!isNonEmptyString(text) || text.length < 4) {
      voiceovers.push({ sceneId: scene?.id || `scene_${i + 1}`, text: "", audioUrl: "", provider: "none" });
      continue;
    }

    try {
      const audioUrl = await googleTTS(text, config);
      voiceovers.push({ sceneId: scene.id, text, audioUrl, provider: "google_tts" });
    } catch {
      voiceovers.push({ sceneId: scene.id, text, audioUrl: "", provider: "none" });
    }

    await sleep(120);
  }

  return { voiceovers };
}

/* -------------------------- VISUAL PROMPTS + VIDEO SEARCH -------------------------- */

async function stageVisualPromptsFromActions(edited: EditedStructure): Promise<VisualPromptPack> {
  const scenes = ensureArray<EditedStructure["scenes"][number]>(edited?.scenes, []);
  const shots = scenes.map((s) => ({
    sceneId: s.id,
    prompt: (s.action || s.beat || "").toString().slice(0, 160).trim() || "cinematic scene",
  }));
  return { shots };
}

async function pexelsSearchOneVideo(query: string, config: EnvConfig): Promise<{ imageUrl: string; videoUrl: string }> {
  const searchUrl = `${config.pexels.baseUrl}/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`;

  const resp = await fetchWithTimeout(
    searchUrl,
    {
      method: "GET",
      headers: { Authorization: config.pexels.apiKey, "Content-Type": "application/json" },
    },
    config.defaultTimeoutMs
  );

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new PipelineError({
      stage: "video_rendering",
      code: resp.status === 429 ? "RATE_LIMIT" : "UPSTREAM_ERROR",
      message: `Pexels search failed (HTTP ${resp.status}): ${t}`,
      retryable: resp.status === 429 || resp.status >= 500,
    });
  }

  const data = await resp.json();
  const videos = ensureArray<any>(data?.videos, []);
  if (videos.length === 0) return { imageUrl: "", videoUrl: "" };

  const v = videos[0];
  const imageUrl = isNonEmptyString(v?.image) ? v.image : "";

  const files = ensureArray<any>(v?.video_files, []);
  const preferred =
    files.find((f) => f?.quality === "hd" && typeof f?.width === "number" && f.width >= 720) ||
    files.find((f) => f?.quality === "hd") ||
    files[0];

  const videoUrl = isNonEmptyString(preferred?.link) ? preferred.link : "";
  return { imageUrl, videoUrl };
}

async function stageVideoRender(prompts: VisualPromptPack, config: EnvConfig): Promise<VideoRender[]> {
  const shots = ensureArray<VisualPromptPack["shots"][number]>(prompts?.shots, []);
  const renders: VideoRender[] = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const query = (shot?.prompt || "").trim();

    if (!isNonEmptyString(query)) {
      renders.push({ sceneId: shot?.sceneId || `scene_${i + 1}`, imageUrl: "", videoUrl: "" });
      continue;
    }

    try {
      const res = await pexelsSearchOneVideo(query, config);
      renders.push({ sceneId: shot.sceneId, imageUrl: res.imageUrl, videoUrl: res.videoUrl });
    } catch {
      renders.push({ sceneId: shot.sceneId, imageUrl: "", videoUrl: "" });
    }

    await sleep(160);
  }

  return renders;
}

/* -------------------------- SUPABASE: ENQUEUE RENDER JOB -------------------------- */

async function enqueueRenderJobToSupabase(args: {
  requestId: string;
  payload: any;
  config: EnvConfig;
}): Promise<string> {
  const { requestId, payload, config } = args;
  const sb = config.supabase;

  if (!isNonEmptyString(sb.url) || !isNonEmptyString(sb.serviceRoleKey)) {
    throw new PipelineError({
      stage: "video_rendering",
      code: "BAD_REQUEST",
      message: "Supabase enqueue not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on Vercel.",
      retryable: false,
    });
  }

  const table = sb.renderJobsTable || "render_jobs";
  const url = `${sb.url}/rest/v1/${encodeURIComponent(table)}`;

  // ✅ Adjust keys if your DB schema differs
  const row = {
    request_id: requestId,
    status: "queued",
    payload, // ✅ entire PentagonOutput payload
    final_video_url: null,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sb.serviceRoleKey}`,
        apikey: sb.serviceRoleKey,
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    },
    config.defaultTimeoutMs
  );

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new PipelineError({
      stage: "video_rendering",
      code: "UPSTREAM_ERROR",
      message: `Failed to enqueue render job (HTTP ${resp.status}): ${t}`,
      retryable: resp.status === 429 || resp.status >= 500,
    });
  }

  const data = (await resp.json().catch(() => null)) as any;

  // Supabase returns an array with Prefer:return=representation
  const inserted = Array.isArray(data) ? data[0] : null;
  const id = inserted?.id || inserted?.job_id || "";

  return isNonEmptyString(id) ? String(id) : "";
}

/* -------------------------- MAIN PIPELINE -------------------------- */

export async function runPentagonPipeline(input: PentagonInput): Promise<PentagonOutput> {
  const startedAt = new Date().toISOString();
  const timings: Partial<Record<PipelineStage, number>> = {};

  if (!isNonEmptyString(input?.requestId) || !isNonEmptyString(input?.userPrompt)) {
    throw new PipelineError({
      stage: "structure_generation",
      code: "BAD_REQUEST",
      message: "Missing requestId or userPrompt",
      retryable: false,
    });
  }

  const config = loadEnvConfig();

  let t0 = Date.now();
  const structure = await stageStructure(input, config);
  timings.structure_generation = Date.now() - t0;

  t0 = Date.now();
  const edited = await stageEdit(structure, input, config);
  timings.gpt_edit = Date.now() - t0;

  t0 = Date.now();
  const localized = await stageLocalize(edited, config);
  timings.georgian_localization = Date.now() - t0;

  t0 = Date.now();
  const voiceovers = await stageVoiceover(localized, config);
  timings.voiceover_generation = Date.now() - t0;

  t0 = Date.now();
  const visualPrompts = await stageVisualPromptsFromActions(edited);
  timings.visual_prompting = Date.now() - t0;

  t0 = Date.now();
  const videos = await stageVideoRender(visualPrompts, config);
  timings.video_rendering = Date.now() - t0;

  const finishedAt = new Date().toISOString();
  const finalVideoUrl = videos.find((v) => isNonEmptyString(v.videoUrl))?.videoUrl || "";

  // ✅ Payload for worker (full PentagonOutput pack)
  const payload = {
    requestId: input.requestId,
    input,
    structure,
    edited,
    localized,
    voiceovers,
    visualPrompts,
    videos,
    meta: {
      startedAt,
      finishedAt,
      stageTimingsMs: timings,
    },
  };

  // ✅ Trigger: enqueue render job for Fly worker
  const renderJobId = await enqueueRenderJobToSupabase({
    requestId: input.requestId,
    payload,
    config,
  });

  return {
    requestId: input.requestId,
    structure,
    edited,
    localized,
    voiceovers,
    visualPrompts,
    videos,
    finalVideoUrl,
    renderJobId,
    meta: {
      startedAt,
      finishedAt,
      stageTimingsMs: timings,
    },
  };
                                     }
