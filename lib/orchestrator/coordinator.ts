// coordinator.ts
// Pentagon Pipeline: DeepSeek → GPT → Gemini → Grok → Pollinations
// Production orchestrator for AI video generation with 5-stage processing

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

function loadEnvConfig(): EnvConfig {
  const required = [
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

  const missing = required.filter(function(key) { return !process.env[key]; });
  if (missing.length > 0) {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "BAD_REQUEST",
      message: "Missing required environment variables: " + missing.join(", "),
      retryable: false,
    });
  }

  return {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || "",
      baseUrl: process.env.DEEPSEEK_BASE_URL || "",
      model: process.env.DEEPSEEK_MODEL || "",
    },
    gpt: {
      apiKey: process.env.GPT_API_KEY || "",
      baseUrl: process.env.GPT_BASE_URL || "",
      model: process.env.GPT_MODEL || "",
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
      baseUrl: process.env.GEMINI_BASE_URL || "",
      model: process.env.GEMINI_MODEL || "",
    },
    grok: {
      apiKey: process.env.GROK_API_KEY || "",
      baseUrl: process.env.GROK_BASE_URL || "",
      model: process.env.GROK_MODEL || "",
    },
    pollinations: {
      baseUrl: process.env.POLLINATIONS_BASE_URL || "https://image.pollinations.ai",
    },
    defaultTimeoutMs: parseInt(process.env.DEFAULT_TIMEOUT_MS || "20000", 10),
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
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

async function sleep(ms: number): Promise<void> {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
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
        const errorText = await response.text().catch(function() { return "unknown"; });

        if (statusCode === 402) {
          throw new PipelineError({
            stage: stage,
            code: "RATE_LIMIT",
            message: "Insufficient balance or quota exceeded: " + errorText,
            retryable: false,
          });
        }

        if (statusCode === 404) {
          throw new PipelineError({
            stage: stage,
            code: "BAD_REQUEST",
            message: "Resource not found (check model name): " + errorText,
            retryable: false,
          });
        }

        if (statusCode === 429) {
          throw new PipelineError({
            stage: stage,
            code: "RATE_LIMIT",
            message: "Rate limit exceeded: " + errorText,
            retryable: true,
          });
        }

        if (statusCode >= 500) {
          throw new PipelineError({
            stage: stage,
            code: "PROVIDER_UNAVAILABLE",
            message: "Provider error " + statusCode + ": " + errorText,
            retryable: true,
          });
        }

        throw new PipelineError({
          stage: stage,
          code: "UPSTREAM_ERROR",
          message: "HTTP " + statusCode + ": " + errorText,
          retryable: false,
        });
      }

      const json = await response.json();
      return json as T;
    } catch (error: any) {
      if (error instanceof PipelineError) {
        if (!error.retryable) throw error;
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

      attempt++;
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
  return text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .replace(/^[\s\n]+/, "")
    .replace(/[\s\n]+$/, "");
}

async function stageDeepSeek(
  input: PentagonInput,
  config: EnvConfig
): Promise<DeepSeekStructure> {
  const maxScenes = input.constraints?.maxScenes || 8;
  const maxDuration = input.constraints?.maxDurationSec || 180;

  const systemPrompt = "You are a video structure architect. Return ONLY valid JSON matching this schema:\n" +
    "{\n" +
    '  "title": "string",\n' +
    '  "logline": "string",\n' +
    '  "scenes": [\n' +
    "    {\n" +
    '      "id": "scene_1",\n' +
    '      "beat": "string",\n' +
    '      "durationSec": number,\n' +
    '      "camera": "string",\n' +
    '      "setting": "string",\n' +
    '      "characters": ["string"],\n' +
    '      "action": "string"\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Constraints:\n" +
    "- Maximum " + maxScenes + " scenes\n" +
    "- Total duration <= " + maxDuration + " seconds\n" +
    "- Each scene must have unique ID starting with scene_\n" +
    "- Do not include markdown fences or any text outside JSON\n" +
    "- If you cannot comply, return a JSON error object\n\n" +
    "User prompt: " + input.userPrompt;

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

  let content: string;
  if (response.choices && response.choices[0]?.message?.content) {
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

  const systemPrompt = "You are a video editor. Refine this structure. Return ONLY valid JSON matching this schema:\n" +
    "{\n" +
    '  "title": "string",\n' +
    '  "logline": "string",\n' +
    '  "scenes": [...same as input...],\n' +
    '  "globalNotes": ["string"]\n' +
    "}\n\n" +
    "Rules:\n" +
    "- Enforce maximum " + maxScenes + " scenes (truncate if needed)\n" +
    "- Enforce total duration <= " + maxDuration + " seconds (scale if needed)\n" +
    "- Tighten beats, improve pacing\n" +
    "- Add editing notes to globalNotes array\n" +
    "- Do not include markdown fences or any text outside JSON\n" +
    "- Preserve scene IDs\n\n" +
    "Input structure:\n" +
    JSON.stringify(structure);

  const response = await requestJson<any>(
    "gpt_edit",
    config.gpt.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.gpt.apiKey,
      },
      body: JSON.stringify({
        model: config.gpt.model,
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

  let content: string;
  if (response.choices && response.choices[0]?.message?.content) {
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
    edited.scenes = edited.scenes.slice(0, maxScenes);
    edited.globalNotes = edited.globalNotes || [];
    edited.globalNotes.push("Truncated to " + maxScenes + " scenes");
  }

  const totalDuration = edited.scenes.reduce(function(sum, s) { return sum + s.durationSec; }, 0);
  if (totalDuration > maxDuration) {
    const scale = maxDuration / totalDuration;
    edited.scenes = edited.scenes.map(function(s) {
      return {
        ...s,
        durationSec: Math.floor(s.durationSec * scale),
      };
    });
    edited.globalNotes = edited.globalNotes || [];
    edited.globalNotes.push("Scaled durations to fit " + maxDuration + "s total");
  }

  return edited;
}

async function stageGemini(
  edited: EditedStructure,
  config: EnvConfig
): Promise<LocalizedStructureKA> {
  const systemPrompt = "You are a Georgian localization expert. Translate this video structure to fluent, culturally correct Georgian. Return ONLY valid JSON matching this schema:\n" +
    "{\n" +
    '  "title_ka": "string",\n' +
    '  "logline_ka": "string",\n' +
    '  "scenes_ka": [\n' +
    "    {\n" +
    '      "id": "string (preserve original)",\n' +
    '      "beat_ka": "string",\n' +
    '      "camera_ka": "string",\n' +
    '      "setting_ka": "string",\n' +
    '      "characters_ka": ["string"],\n' +
    '      "action_ka": "string"\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Rules:\n" +
    "- Preserve scene IDs exactly as provided\n" +
    "- Use native Georgian script, no transliteration\n" +
    "- Ensure cultural appropriateness\n" +
    "- Do not include markdown fences or any text outside JSON\n\n" +
    "Input structure:\n" +
    JSON.stringify(edited);

  const url = config.gemini.baseUrl + "/models/" + config.gemini.model + ":generateContent?key=" + config.gemini.apiKey;

  const response = await requestJson<any>(
    "gemini_localize_ka",
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    },
    config.defaultTimeoutMs,
    2
  );

  let content: string;
  if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
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
      message: "Gemini localized structure missing required fields",
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
  const styleHint = input.constraints?.style || "cinematic, high-quality, professional";

  const systemPrompt = "You are a visual prompt engineer. Convert these scenes into optimized visual prompts for Pollinations AI video generation. Return ONLY valid JSON matching this schema:\n" +
    "{\n" +
    '  "shots": [\n' +
    "    {\n" +
    '      "sceneId": "string (match input scene id)",\n' +
    '      "prompt": "string (detailed visual prompt)",\n' +
    '      "negative": "string (optional)",\n' +
    '      "camera": "string (optional)",\n' +
    '      "lighting": "string (optional)",\n' +
    '      "styleTags": ["string"] (optional)\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Rules:\n" +
    "- Each shot must match a scene ID from input\n" +
    "- Prompts must be optimized for AI video generation (detailed, visual, no dialogue)\n" +
    "- Include camera angles, lighting, mood, style: " + styleHint + "\n" +
    "- Do not include markdown fences or any text outside JSON\n\n" +
    "Input scenes:\n" +
    JSON.stringify(edited.scenes);

  const response = await requestJson<any>(
    "grok_visual_prompting",
    config.grok.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.grok.apiKey,
      },
      body: JSON.stringify({
        model: config.grok.model,
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

  let content: string;
  if (response.choices && response.choices[0]?.message?.content) {
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
      message: "Grok prompts missing shots array",
      retryable: false,
    });
  }

  for (let i = 0; i < prompts.shots.length; i++) {
    const shot = prompts.shots[i];
    if (!shot.sceneId || !shot.prompt) {
      throw new PipelineError({
        stage: "grok_visual_prompting",
        code: "INVALID_JSON",
        message: "Grok shot missing sceneId or prompt",
        retryable: false,
      });
    }
  }

  return prompts;
}

function generateDeterministicSeed(requestId: string, sceneId: string): number {
  let hash = 0;
  const combined = requestId + ":" + sceneId;
  for (let i = 0; i < combined.length; i++) {
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

  for (let i = 0; i < prompts.shots.length; i++) {
    const shot = prompts.shots[i];
    const seed = generateDeterministicSeed(input.requestId, shot.sceneId);
    const encodedPrompt = encodeURIComponent(shot.prompt);
    
    const url = config.pollinations.baseUrl + "/prompt/" + encodedPrompt + "?width=1080&height=1920&seed=" + seed + "&nologo=true&enhance=true";

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
