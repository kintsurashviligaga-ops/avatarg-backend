// lib/orchestrator/coordinator.ts
// AI Pentagon Pipeline: DeepSeek → GPT-4o → Gemini → Grok → Pollinations

export type PipelineStage =
  | "deepseek_structure"
  | "gpt_edit"
  | "gemini_localize_ka"
  | "grok_visual_prompting"
  | "pollinations_render";

export interface PentagonInput {
  requestId: string;
  userPrompt: string;
  constraints?: {
    maxScenes?: number;
    maxDurationSec?: number;
    style?: string;
  };
}

export interface DeepSeekStructure {
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

export interface EditedStructure extends DeepSeekStructure {
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
  }>;
}

export interface GrokPromptPack {
  shots: Array<{
    sceneId: string;
    prompt: string;
    negative?: string;
    camera?: string;
    lighting?: string;
    styleTags?: string[];
  }>;
}

export interface PollinationsRender {
  sceneId: string;
  imageUrl: string;
  videoUrl: string;
}

export interface PentagonOutput {
  requestId: string;
  deepseek: DeepSeekStructure;
  gpt: EditedStructure;
  gemini: LocalizedStructureKA;
  grok: GrokPromptPack;
  pollinations: PollinationsRender[];
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
  deepseek: { apiKey: string; baseUrl: string; model: string };
  openai: { apiKey: string; baseUrl: string; model: string };
  gemini: { apiKey: string; baseUrl: string; model: string };
  xai: { apiKey: string; baseUrl: string; model: string };
  pollinations: { baseUrl: string; videoBaseUrl: string };
  defaultTimeoutMs: number;
}

function getEnvVar(key: string): string {
  return process.env[key] || "";
}

function loadEnvConfig(): EnvConfig {
  const required: string[] = [
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "XAI_API_KEY",
  ];

  const missing: string[] = [];
  for (let i = 0; i < required.length; i = i + 1) {
    const key = required[i];
    if (!getEnvVar(key)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const errorMessage = "Missing required environment variables: " + missing.join(", ");
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "BAD_REQUEST",
      message: errorMessage,
      retryable: false,
    });
  }

  return {
    deepseek: {
      apiKey: getEnvVar("DEEPSEEK_API_KEY"),
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    },
    openai: {
      apiKey: getEnvVar("OPENAI_API_KEY"),
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
    gemini: {
      apiKey: getEnvVar("GEMINI_API_KEY"),
      baseUrl: "https://generativelanguage.googleapis.com/v1",
      model: "gemini-1.5-flash",
    },
    xai: {
      apiKey: getEnvVar("XAI_API_KEY"),
      baseUrl: "https://api.x.ai/v1",
      model: "grok-beta",
    },
    pollinations: {
      baseUrl: "https://image.pollinations.ai",
      videoBaseUrl: "https://image.pollinations.ai/prompt",
    },
    defaultTimeoutMs: parseInt(getEnvVar("DEFAULT_TIMEOUT_MS") || "30000", 10),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    const requestInit: RequestInit = {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    };
    const response = await fetch(url, requestInit);
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("TIMEOUT");
    }
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
  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      if (!response.ok) {
        const statusCode = response.status;
        let errorText = "unknown";
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = "unable to read error";
        }

        if (statusCode === 402) {
          throw new PipelineError({
            stage: stage,
            code: "RATE_LIMIT",
            message: "Insufficient balance: " + errorText,
            retryable: false,
          });
        }

        if (statusCode === 404) {
          throw new PipelineError({
            stage: stage,
            code: "BAD_REQUEST",
            message: "Not found: " + errorText,
            retryable: false,
          });
        }

        if (statusCode === 429) {
          throw new PipelineError({
            stage: stage,
            code: "RATE_LIMIT",
            message: "Rate limit: " + errorText,
            retryable: true,
          });
        }

        if (statusCode >= 500) {
          throw new PipelineError({
            stage: stage,
            code: "PROVIDER_UNAVAILABLE",
            message: "Server error " + String(statusCode),
            retryable: true,
          });
        }

        throw new PipelineError({
          stage: stage,
          code: "UPSTREAM_ERROR",
          message: "HTTP " + String(statusCode),
          retryable: false,
        });
      }

      const json = await response.json();
      return json as T;
    } catch (error: any) {
      if (error instanceof PipelineError) {
        if (!error.retryable) {
          throw error;
        }
        lastError = error;
      } else if (error.message === "TIMEOUT") {
        lastError = new PipelineError({
          stage: stage,
          code: "TIMEOUT",
          message: "Request timed out",
          retryable: true,
          cause: error,
        });
      } else {
        lastError = new PipelineError({
          stage: stage,
          code: "UNKNOWN",
          message: error.message || "Unknown error",
          retryable: false,
          cause: error,
        });
      }

      attempt = attempt + 1;
      if (attempt < maxRetries) {
        const backoffMs = 400 * Math.pow(3, attempt - 1);
        await sleep(backoffMs);
      }
    }
  }

  throw lastError || new PipelineError({
    stage: stage,
    code: "UNKNOWN",
    message: "Max retries exceeded",
    retryable: false,
  });
}

function cleanJsonString(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/```json\n?/g, "");
  cleaned = cleaned.replace(/```\n?/g, "");
  cleaned = cleaned.replace(/^[\s\n]+/, "");
  cleaned = cleaned.replace(/[\s\n]+$/, "");
  return cleaned;
}

async function stageDeepSeek(
  input: PentagonInput,
  config: EnvConfig
): Promise<DeepSeekStructure> {
  const maxScenes = input.constraints?.maxScenes || 6;
  const maxDuration = input.constraints?.maxDurationSec || 120;

  const systemPrompt = [
    "You are a video structure architect. Return ONLY valid JSON:",
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
    "Constraints: Max " + maxScenes + " scenes, total " + maxDuration + "s.",
    "NO markdown fences. User prompt: " + input.userPrompt,
  ].join("\n");

  const response = await requestJson<any>(
    "deepseek_structure",
    config.deepseek.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.deepseek.apiKey,
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    },
    config.defaultTimeoutMs,
    2
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "INVALID_JSON",
      message: "DeepSeek response missing",
      retryable: false,
    });
  }

  const structure = JSON.parse(cleanJsonString(content));
  if (!structure.title || !Array.isArray(structure.scenes)) {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "INVALID_JSON",
      message: "Invalid structure",
      retryable: false,
    });
  }

  return structure;
}

async function stageGPT(
  structure: DeepSeekStructure,
  input: PentagonInput,
  config: EnvConfig
): Promise<EditedStructure> {
  const maxScenes = input.constraints?.maxScenes || 6;
  const maxDuration = input.constraints?.maxDurationSec || 120;

  const systemPrompt = [
    "Video editor. Return ONLY valid JSON with globalNotes array.",
    "Enforce: max " + maxScenes + " scenes, " + maxDuration + "s total.",
    "Input: " + JSON.stringify(structure),
  ].join("\n");

  const response = await requestJson<any>(
    "gpt_edit",
    config.openai.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.openai.apiKey,
      },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(structure) },
        ],
        temperature: 0.5,
        max_tokens: 3000,
      }),
    },
    config.defaultTimeoutMs,
    2
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new PipelineError({
      stage: "gpt_edit",
      code: "INVALID_JSON",
      message: "GPT response missing",
      retryable: false,
    });
  }

  let edited = JSON.parse(cleanJsonString(content));
  edited.globalNotes = edited.globalNotes || [];

  if (edited.scenes.length > maxScenes) {
    edited.scenes = edited.scenes.slice(0, maxScenes);
    edited.globalNotes.push("Truncated to " + maxScenes);
  }

  let totalDuration = 0;
  for (let i = 0; i < edited.scenes.length; i = i + 1) {
    totalDuration = totalDuration + edited.scenes[i].durationSec;
  }

  if (totalDuration > maxDuration) {
    const scale = maxDuration / totalDuration;
    for (let i = 0; i < edited.scenes.length; i = i + 1) {
      edited.scenes[i].durationSec = Math.floor(edited.scenes[i].durationSec * scale);
    }
    edited.globalNotes.push("Scaled to " + maxDuration + "s");
  }

  return edited;
}

async function stageGemini(
  edited: EditedStructure,
  config: EnvConfig
): Promise<LocalizedStructureKA> {
  const systemPrompt = [
    "Georgian localization expert. Return ONLY valid JSON with _ka fields.",
    "Preserve scene IDs. Native Georgian script only.",
    "Input: " + JSON.stringify(edited),
  ].join("\n");

  const url = config.gemini.baseUrl + "/models/" + config.gemini.model + ":generateContent?key=" + config.gemini.apiKey;

  const response = await requestJson<any>(
    "gemini_localize_ka",
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
      }),
    },
    config.defaultTimeoutMs,
    2
  );

  const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new PipelineError({
      stage: "gemini_localize_ka",
      code: "INVALID_JSON",
      message: "Gemini response missing",
      retryable: false,
    });
  }

  const localized = JSON.parse(cleanJsonString(content));
  if (!localized.title_ka || !Array.isArray(localized.scenes_ka)) {
    throw new PipelineError({
      stage: "gemini_localize_ka",
      code: "INVALID_JSON",
      message: "Invalid localization",
      retryable: false,
    });
  }

  return localized;
}

async function stageGrok(
  edited: EditedStructure,
  input: PentagonInput,
  config: EnvConfig
): Promise<GrokPromptPack> {
  const styleHint = input.constraints?.style || "cinematic, professional, 4K";

  const systemPrompt = [
    "Visual prompt engineer. Return ONLY valid JSON with shots array.",
    "Style: " + styleHint,
    "Scenes: " + JSON.stringify(edited.scenes),
  ].join("\n");

  const response = await requestJson<any>(
    "grok_visual_prompting",
    config.xai.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.xai.apiKey,
      },
      body: JSON.stringify({
        model: config.xai.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(edited.scenes) },
        ],
        temperature: 0.8,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      }),
    },
    config.defaultTimeoutMs,
    2
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new PipelineError({
      stage: "grok_visual_prompting",
      code: "INVALID_JSON",
      message: "Grok response missing",
      retryable: false,
    });
  }

  const prompts = JSON.parse(cleanJsonString(content));
  if (!Array.isArray(prompts.shots) || prompts.shots.length === 0) {
    throw new PipelineError({
      stage: "grok_visual_prompting",
      code: "INVALID_JSON",
      message: "No shots generated",
      retryable: false,
    });
  }

  return prompts;
}

function generateDeterministicSeed(requestId: string, sceneId: string): number {
  let hash = 0;
  const combined = requestId + ":" + sceneId;
  for (let i = 0; i < combined.length; i = i + 1) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

async function stagePollinations(
  prompts: GrokPromptPack,
  input: PentagonInput,
  config: EnvConfig
): Promise<PollinationsRender[]> {
  const renders: PollinationsRender[] = [];

  for (let i = 0; i < prompts.shots.length; i = i + 1) {
    const shot = prompts.shots[i];
    const seed = generateDeterministicSeed(input.requestId, shot.sceneId);
    const encodedPrompt = encodeURIComponent(shot.prompt);

    const imageUrl = config.pollinations.baseUrl + "/prompt/" + encodedPrompt + "?width=1920&height=1080&seed=" + String(seed) + "&nologo=true&enhance=true";
    const videoUrl = config.pollinations.videoBaseUrl + "/" + encodedPrompt + "?width=1920&height=1080&seed=" + String(seed) + "&nologo=true&model=flux";

    renders.push({
      sceneId: shot.sceneId,
      imageUrl: imageUrl,
      videoUrl: videoUrl,
    });
  }

  return renders;
}

export async function runPentagonPipeline(input: PentagonInput): Promise<PentagonOutput> {
  const startedAt = new Date().toISOString();
  const timings: Partial<Record<PipelineStage, number>> = {};

  if (!input.requestId || !input.userPrompt) {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "BAD_REQUEST",
      message: "Missing requestId or userPrompt",
      retryable: false,
    });
  }

  const config = loadEnvConfig();

  let t0 = Date.now();
  const deepseek = await stageDeepSeek(input, config);
  timings.deepseek_structure = Date.now() - t0;

  t0 = Date.now();
  const gpt = await stageGPT(deepseek, input, config);
  timings.gpt_edit = Date.now() - t0;

  t0 = Date.now();
  const gemini = await stageGemini(gpt, config);
  timings.gemini_localize_ka = Date.now() - t0;

  t0 = Date.now();
  const grok = await stageGrok(gpt, input, config);
  timings.grok_visual_prompting = Date.now() - t0;

  t0 = Date.now();
  const pollinations = await stagePollinations(grok, input, config);
  timings.pollinations_render = Date.now() - t0;

  const finishedAt = new Date().toISOString();
  const finalVideoUrl = pollinations.length > 0 ? pollinations[0].videoUrl : "";

  return {
    requestId: input.requestId,
    deepseek: deepseek,
    gpt: gpt,
    gemini: gemini,
    grok: grok,
    pollinations: pollinations,
    finalVideoUrl: finalVideoUrl,
    meta: {
      startedAt: startedAt,
      finishedAt: finishedAt,
      stageTimingsMs: timings,
    },
  };
      }
