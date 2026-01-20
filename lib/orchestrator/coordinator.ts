// lib/orchestrator/coordinator.ts
// Pentagon Pipeline: Production-grade AI video orchestration
// Compatible with Next.js 14.2.5 and Vercel deployment

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
  url: string;
}

export interface PentagonOutput {
  requestId: string;
  deepseek: DeepSeekStructure;
  gpt: EditedStructure;
  gemini: LocalizedStructureKA;
  grok: GrokPromptPack;
  pollinations: PollinationsRender[];
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
  gpt: { apiKey: string; baseUrl: string; model: string };
  gemini: { apiKey: string; baseUrl: string; model: string };
  grok: { apiKey: string; baseUrl: string; model: string };
  pollinations: { baseUrl: string };
  defaultTimeoutMs: number;
}

function getEnvVar(key: string): string {
  return process.env[key] || "";
}

function loadEnvConfig(): EnvConfig {
  const required: string[] = [
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "DEEPSEEK_MODEL",
    "GPT_API_KEY",
    "GPT_BASE_URL",
    "GPT_MODEL",
    "GEMINI_API_KEY",
    "GEMINI_BASE_URL",
    "GEMINI_MODEL",
    "GROK_API_KEY",
    "GROK_BASE_URL",
    "GROK_MODEL",
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
      baseUrl: getEnvVar("DEEPSEEK_BASE_URL"),
      model: getEnvVar("DEEPSEEK_MODEL"),
    },
    gpt: {
      apiKey: getEnvVar("GPT_API_KEY"),
      baseUrl: getEnvVar("GPT_BASE_URL"),
      model: getEnvVar("GPT_MODEL"),
    },
    gemini: {
      apiKey: getEnvVar("GEMINI_API_KEY"),
      baseUrl: getEnvVar("GEMINI_BASE_URL"),
      model: getEnvVar("GEMINI_MODEL"),
    },
    grok: {
      apiKey: getEnvVar("GROK_API_KEY"),
      baseUrl: getEnvVar("GROK_BASE_URL"),
      model: getEnvVar("GROK_MODEL"),
    },
    pollinations: {
      baseUrl: getEnvVar("POLLINATIONS_BASE_URL") || "https://image.pollinations.ai",
    },
    defaultTimeoutMs: parseInt(getEnvVar("DEFAULT_TIMEOUT_MS") || "20000", 10),
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
  const maxScenes = input.constraints?.maxScenes || 8;
  const maxDuration = input.constraints?.maxDurationSec || 180;

  const lines: string[] = [];
  lines.push("You are a video structure architect. Return ONLY valid JSON matching this schema:");
  lines.push("{");
  lines.push('  "title": "string",');
  lines.push('  "logline": "string",');
  lines.push('  "scenes": [');
  lines.push("    {");
  lines.push('      "id": "scene_1",');
  lines.push('      "beat": "string",');
  lines.push('      "durationSec": number,');
  lines.push('      "camera": "string",');
  lines.push('      "setting": "string",');
  lines.push('      "characters": ["string"],');
  lines.push('      "action": "string"');
  lines.push("    }");
  lines.push("  ]");
  lines.push("}");
  lines.push("");
  lines.push("Constraints:");
  lines.push("- Maximum " + String(maxScenes) + " scenes");
  lines.push("- Total duration <= " + String(maxDuration) + " seconds");
  lines.push("- Each scene must have unique ID starting with scene_");
  lines.push("- Do not include markdown fences");
  lines.push("");
  lines.push("User prompt: " + input.userPrompt);

  const systemPrompt = lines.join("\n");

  const requestBody = {
    model: config.deepseek.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  };

  const response = await requestJson<any>(
    "deepseek_structure",
    config.deepseek.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.deepseek.apiKey,
      },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  let content: string;
  if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
    content = response.choices[0].message.content;
  } else {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "INVALID_JSON",
      message: "DeepSeek response missing content",
      retryable: false,
    });
  }

  let structure: DeepSeekStructure;
  try {
    const cleaned = cleanJsonString(content);
    structure = JSON.parse(cleaned);
  } catch (error) {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "INVALID_JSON",
      message: "Failed to parse DeepSeek JSON",
      retryable: false,
      cause: error,
    });
  }

  if (!structure.title || !structure.logline || !Array.isArray(structure.scenes)) {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "INVALID_JSON",
      message: "DeepSeek structure missing required fields",
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
  const maxScenes = input.constraints?.maxScenes || 8;
  const maxDuration = input.constraints?.maxDurationSec || 180;

  const lines: string[] = [];
  lines.push("You are a video editor. Refine this structure. Return ONLY valid JSON:");
  lines.push("{");
  lines.push('  "title": "string",');
  lines.push('  "logline": "string",');
  lines.push('  "scenes": [...],');
  lines.push('  "globalNotes": ["string"]');
  lines.push("}");
  lines.push("");
  lines.push("Rules:");
  lines.push("- Maximum " + String(maxScenes) + " scenes");
  lines.push("- Total duration <= " + String(maxDuration) + " seconds");
  lines.push("- Preserve scene IDs");
  lines.push("- Do not include markdown fences");
  lines.push("");
  lines.push("Input:");
  lines.push(JSON.stringify(structure));

  const systemPrompt = lines.join("\n");

  const requestBody = {
    model: config.gpt.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(structure) },
    ],
    temperature: 0.5,
    max_tokens: 3000,
  };

  const response = await requestJson<any>(
    "gpt_edit",
    config.gpt.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.gpt.apiKey,
      },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  let content: string;
  if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
    content = response.choices[0].message.content;
  } else {
    throw new PipelineError({
      stage: "gpt_edit",
      code: "INVALID_JSON",
      message: "GPT response missing content",
      retryable: false,
    });
  }

  let edited: EditedStructure;
  try {
    const cleaned = cleanJsonString(content);
    edited = JSON.parse(cleaned);
  } catch (error) {
    throw new PipelineError({
      stage: "gpt_edit",
      code: "INVALID_JSON",
      message: "Failed to parse GPT JSON",
      retryable: false,
      cause: error,
    });
  }

  if (edited.scenes.length > maxScenes) {
    const truncated = [];
    for (let i = 0; i < maxScenes; i = i + 1) {
      truncated.push(edited.scenes[i]);
    }
    edited.scenes = truncated;
    edited.globalNotes = edited.globalNotes || [];
    edited.globalNotes.push("Truncated to " + String(maxScenes) + " scenes");
  }

  let totalDuration = 0;
  for (let i = 0; i < edited.scenes.length; i = i + 1) {
    totalDuration = totalDuration + edited.scenes[i].durationSec;
  }

  if (totalDuration > maxDuration) {
    const scale = maxDuration / totalDuration;
    const scaledScenes = [];
    for (let i = 0; i < edited.scenes.length; i = i + 1) {
      const scene = edited.scenes[i];
      const scaledScene = {
        id: scene.id,
        beat: scene.beat,
        durationSec: Math.floor(scene.durationSec * scale),
        camera: scene.camera,
        setting: scene.setting,
        characters: scene.characters,
        action: scene.action,
      };
      scaledScenes.push(scaledScene);
    }
    edited.scenes = scaledScenes;
    edited.globalNotes = edited.globalNotes || [];
    edited.globalNotes.push("Scaled to " + String(maxDuration) + "s");
  }

  return edited;
}

async function stageGemini(
  edited: EditedStructure,
  config: EnvConfig
): Promise<LocalizedStructureKA> {
  const lines: string[] = [];
  lines.push("Georgian localization expert. Return ONLY valid JSON:");
  lines.push("{");
  lines.push('  "title_ka": "string",');
  lines.push('  "logline_ka": "string",');
  lines.push('  "scenes_ka": [...]');
  lines.push("}");
  lines.push("");
  lines.push("Rules:");
  lines.push("- Preserve scene IDs");
  lines.push("- Native Georgian script only");
  lines.push("- Do not include markdown fences");
  lines.push("");
  lines.push("Input:");
  lines.push(JSON.stringify(edited));

  const systemPrompt = lines.join("\n");

  const url = config.gemini.baseUrl + "/models/" + config.gemini.model + ":generateContent?key=" + config.gemini.apiKey;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4000,
    },
  };

  const response = await requestJson<any>(
    "gemini_localize_ka",
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  let content: string;
  if (
    response.candidates &&
    response.candidates[0] &&
    response.candidates[0].content &&
    response.candidates[0].content.parts &&
    response.candidates[0].content.parts[0] &&
    response.candidates[0].content.parts[0].text
  ) {
    content = response.candidates[0].content.parts[0].text;
  } else {
    throw new PipelineError({
      stage: "gemini_localize_ka",
      code: "INVALID_JSON",
      message: "Gemini response missing content",
      retryable: false,
    });
  }

  let localized: LocalizedStructureKA;
  try {
    const cleaned = cleanJsonString(content);
    localized = JSON.parse(cleaned);
  } catch (error) {
    throw new PipelineError({
      stage: "gemini_localize_ka",
      code: "INVALID_JSON",
      message: "Failed to parse Gemini JSON",
      retryable: false,
      cause: error,
    });
  }

  if (!localized.title_ka || !localized.logline_ka || !Array.isArray(localized.scenes_ka)) {
    throw new PipelineError({
      stage: "gemini_localize_ka",
      code: "INVALID_JSON",
      message: "Gemini missing required fields",
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
  const styleHint = input.constraints?.style || "cinematic, professional";

  const lines: string[] = [];
  lines.push("Visual prompt engineer. Return ONLY valid JSON:");
  lines.push("{");
  lines.push('  "shots": [');
  lines.push("    {");
  lines.push('      "sceneId": "string",');
  lines.push('      "prompt": "string"');
  lines.push("    }");
  lines.push("  ]");
  lines.push("}");
  lines.push("");
  lines.push("Style: " + styleHint);
  lines.push("Do not include markdown fences");
  lines.push("");
  lines.push("Scenes:");
  lines.push(JSON.stringify(edited.scenes));

  const systemPrompt = lines.join("\n");

  const requestBody = {
    model: config.grok.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(edited.scenes) },
    ],
    temperature: 0.8,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "grok_visual_prompting",
    config.grok.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.grok.apiKey,
      },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  let content: string;
  if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
    content = response.choices[0].message.content;
  } else {
    throw new PipelineError({
      stage: "grok_visual_prompting",
      code: "INVALID_JSON",
      message: "Grok response missing content",
      retryable: false,
    });
  }

  let prompts: GrokPromptPack;
  try {
    const cleaned = cleanJsonString(content);
    prompts = JSON.parse(cleaned);
  } catch (error) {
    throw new PipelineError({
      stage: "grok_visual_prompting",
      code: "INVALID_JSON",
      message: "Failed to parse Grok JSON",
      retryable: false,
      cause: error,
    });
  }

  if (!Array.isArray(prompts.shots) || prompts.shots.length === 0) {
    throw new PipelineError({
      stage: "grok_visual_prompting",
      code: "INVALID_JSON",
      message: "Grok missing shots array",
      retryable: false,
    });
  }

  for (let i = 0; i < prompts.shots.length; i = i + 1) {
    const shot = prompts.shots[i];
    if (!shot.sceneId || !shot.prompt) {
      throw new PipelineError({
        stage: "grok_visual_prompting",
        code: "INVALID_JSON",
        message: "Grok shot missing fields",
        retryable: false,
      });
    }
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

    const urlParts: string[] = [];
    urlParts.push(config.pollinations.baseUrl);
    urlParts.push("/prompt/");
    urlParts.push(encodedPrompt);
    urlParts.push("?width=1080&height=1920&seed=");
    urlParts.push(String(seed));
    urlParts.push("&nologo=true&enhance=true");

    const url = urlParts.join("");

    renders.push({
      sceneId: shot.sceneId,
      url: url,
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

  let t0: number;

  t0 = Date.now();
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

  return {
    requestId: input.requestId,
    deepseek: deepseek,
    gpt: gpt,
    gemini: gemini,
    grok: grok,
    pollinations: pollinations,
    meta: {
      startedAt: startedAt,
      finishedAt: finishedAt,
      stageTimingsMs: timings,
    },
  };
        }
