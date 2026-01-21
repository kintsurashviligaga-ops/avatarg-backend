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
    audioUrl: string;
  }>;
}

export interface VisualPromptPack {
  shots: Array<{
    sceneId: string;
    prompt: string;
    negative?: string;
    camera?: string;
    lighting?: string;
    styleTags?: string[];
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
  finalVideoUrl: string;
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
    if (args.cause) {
      this.cause = args.cause;
    }
  }
}

interface EnvConfig {
  openai: { apiKey: string; baseUrl: string; model: string };
  elevenlabs: { apiKey: string; baseUrl: string; voiceId: string };
  xai: { apiKey: string; baseUrl: string; model: string };
  pexels: { apiKey: string; baseUrl: string };
  defaultTimeoutMs: number;
}

function getEnvVar(key: string): string {
  return process.env[key] || "";
}

function loadEnvConfig(): EnvConfig {
  const required: string[] = [
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "XAI_API_KEY",
    "PEXELS_API_KEY",
  ];

  const missing: string[] = [];
  for (let i = 0; i < required.length; i++) {
    const key = required[i];
    if (!getEnvVar(key)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new PipelineError({
      stage: "structure_generation",
      code: "BAD_REQUEST",
      message: "Missing required environment variables: " + missing.join(", "),
      retryable: false,
    });
  }

  return {
    openai: {
      apiKey: getEnvVar("OPENAI_API_KEY"),
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
    elevenlabs: {
      apiKey: getEnvVar("ELEVENLABS_API_KEY"),
      baseUrl: "https://api.elevenlabs.io/v1",
      voiceId: getEnvVar("ELEVENLABS_VOICE_ID") || "pNInz6obpgDQGcFmaJgB",
    },
    xai: {
      apiKey: getEnvVar("XAI_API_KEY"),
      baseUrl: "https://api.x.ai/v1",
      model: "grok-3",
    },
    pexels: {
      apiKey: getEnvVar("PEXELS_API_KEY"),
      baseUrl: "https://api.pexels.com/videos",
    },
    defaultTimeoutMs: parseInt(getEnvVar("DEFAULT_TIMEOUT_MS") || "30000", 10),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") throw new Error("TIMEOUT");
    throw error;
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
  while (attempt < maxRetries) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      await sleep(1000);
    }
  }
  throw new Error("Max retries exceeded");
}

function cleanJsonString(text: string): string {
  return text.replace(/```json\n?|```/g, "").trim();
}

async function stageStructure(input: PentagonInput, config: EnvConfig): Promise<VideoStructure> {
  const requestBody = {
    model: config.openai.model,
    messages: [
      { role: "system", content: "Return ONLY valid JSON for video structure." },
      { role: "user", content: input.userPrompt },
    ],
    response_format: { type: "json_object" },
  };
  return requestJson<VideoStructure>("structure_generation", config.openai.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
    body: JSON.stringify(requestBody),
  }, config.defaultTimeoutMs, 2);
}

// ... (სხვა შუალედური ფუნქციები: stageEdit, stageLocalize, stageVoiceover იგივე რჩება)
// იმისათვის რომ პასუხი ძალიან არ გაგრძელდეს, აქ მხოლოდ შეცვლილ ვიზუალურ ნაწილს ვწერ:

async function stageVisualPrompts(edited: EditedStructure, input: PentagonInput, config: EnvConfig): Promise<VisualPromptPack> {
  const requestBody = {
    model: config.xai.model,
    messages: [
      { role: "system", content: "Convert scenes to English keywords for stock video search. Return JSON shots array." },
      { role: "user", content: JSON.stringify(edited.scenes) },
    ],
    response_format: { type: "json_object" },
  };
  return requestJson<VisualPromptPack>("visual_prompting", config.xai.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.xai.apiKey}` },
    body: JSON.stringify(requestBody),
  }, config.defaultTimeoutMs, 2);
}

async function stageVideoRender(prompts: VisualPromptPack, input: PentagonInput, config: EnvConfig): Promise<VideoRender[]> {
  const renders: VideoRender[] = [];
  for (const shot of prompts.shots) {
    const searchUrl = `${config.pexels.baseUrl}/search?query=${encodeURIComponent(shot.prompt)}&per_page=1&orientation=landscape`;
    try {
      const response = await fetch(searchUrl, { headers: { Authorization: config.pexels.apiKey } });
      const data = await response.json();
      const video = data.videos[0];
      const videoFile = video?.video_files.find((f: any) => f.quality === 'hd')?.link || video?.video_files[0]?.link || "";
      renders.push({ sceneId: shot.sceneId, imageUrl: video?.image || "", videoUrl: videoFile });
    } catch {
      renders.push({ sceneId: shot.sceneId, imageUrl: "", videoUrl: "" });
    }
  }
  return renders;
}

export async function runPentagonPipeline(input: PentagonInput): Promise<PentagonOutput> {
  const config = loadEnvConfig();
  const timings: Partial<Record<PipelineStage, number>> = {};
  const startedAt = new Date().toISOString();

  // ლოგიკური ნაბიჯები
  let t0 = Date.now();
  const structure = await stageStructure(input, config);
  timings.structure_generation = Date.now() - t0;

  // აქ ჩაამატე stageEdit, stageLocalize, stageVoiceover ფუნქციები შენი ორიგინალი კოდიდან...
  // (მოკლედ ვწერ რომ პირდაპირ Render-ზე გადავიდეთ)

  // ვიზუალური ნაწილი (Pexels)
  t0 = Date.now();
  const visualPrompts = await stageVisualPrompts(structure as any, input, config); // structure-ს ვიყენებ სატესტოდ
  timings.visual_prompting = Date.now() - t0;

  t0 = Date.now();
  const videos = await stageVideoRender(visualPrompts, input, config);
  timings.video_rendering = Date.now() - t0;

  return {
    requestId: input.requestId,
    structure: structure,
    edited: structure as any,
    localized: structure as any,
    voiceovers: { voiceovers: [] },
    visualPrompts: visualPrompts,
    videos: videos,
    finalVideoUrl: videos[0]?.videoUrl || "",
    meta: { startedAt, finishedAt: new Date().toISOString(), stageTimingsMs: timings },
  };
}
