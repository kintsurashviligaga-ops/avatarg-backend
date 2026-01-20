```typescript
// coordinator.ts
// Pentagon Pipeline: DeepSeek → GPT → Gemini → Grok → Pollinations
// Strict production orchestrator for AI video generation

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

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new PipelineError({
      stage: "deepseek_structure",
      code: "BAD_REQUEST",
      message: `Missing required environment variables: ${missing.join(", ")}`,
      retryable: false,
    });
  }

  return {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY!,
      baseUrl: process.env.DEEPSEEK_BASE_URL!,
      model: process.env.DEEPSEEK_MODEL!,
    },
    gpt: {
      apiKey: process.env.GPT_API_KEY!,
      baseUrl: process.env.GPT_BASE_URL!,
      model: process.env.GPT_MODEL!,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY!,
      baseUrl: process.env.GEMINI_BASE_URL!,
      model: process.env.GEMINI_MODEL!,
    },
    grok: {
      apiKey: process.env.GROK_API_KEY!,
      baseUrl: process.env.GROK_BASE_URL!,
      model: process.env.GROK_MODEL!,
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
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

async function requestJson<T>(
  stage: PipelineStage,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      if (!response.ok) {
        const statusCode = response.status;
        const errorText = await response.text().catch(() => "unknown");

        if (statusCode === 429) {
          throw new PipelineError({
            stage,
            code: "RATE_LIMIT",
            message: `Rate limit exceeded: ${errorText}`,
            retryable: true,
          });
        }

        if (statusCode >= 500) {
          throw new PipelineError({
            stage,
            code: "PROVIDER_UNAVAILABLE",
            message: `Provider error ${statusCode}: ${errorText}`,
            retryable: true,
          });
        }

        throw new PipelineError({
          stage,
          code: "UPSTREAM_ERROR",
          message: `HTTP ${statusCode}: ${errorText}`,
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
          stage,
          code: "TIMEOUT",
          message: "Request timed out",
          retryable: true,
          cause: error,
        });
      } else {
        lastError = new PipelineError({
          stage,
          code: "UNKNOWN",
          message: error.message || "Unknown error",
          retryable: false,
          cause: error,
        });
      }

      attempt++;
      if (attempt < maxRetries) {
        const backoffMs = 400 * Math.pow(3, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new PipelineError({
    stage,
    code: "UNKNOWN",
    message: "Max retries exceeded",
    retryable: false,
  });
}

async function stageDeepSeek(
  input: PentagonInput,
  config: EnvConfig
): Promise<DeepSeekStructure> {
  const maxScenes = input.constraints?.maxScenes || 8;
  const maxDuration = input.constraints?.maxDurationSec || 180;

  const systemPrompt = `You are a video structure architect. Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "logline": "string",
  "scenes": [
    {
      "id": "scene_1",
      "beat": "string",
      "durationSec": number,
      "camera": "string",
      "setting": "string",
      "characters": ["string"],
      "action": "string"
    }
  ]
}

Constraints:
- Maximum ${maxScenes} scenes
- Total duration <= ${maxDuration} seconds
- Each scene must have unique ID starting with "scene_"
- Do not include markdown fences or any text outside JSON
- If you cannot comply, return a JSON error object

User prompt: ${input.userPrompt}`;

  const response = await requestJson<any>(
    "deepseek_structure",
    `${config.deepseek.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.deepseek.apiKey}`,
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
    config.defaultTimeoutMs
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
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
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

  const systemPrompt = `You are a video editor. Refine this structure. Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "logline": "string",
  "scenes": [...same as input...],
  "globalNotes": ["string"]
}

Rules:
- Enforce maximum ${maxScenes} scenes (truncate if needed)
- Enforce total duration <= ${maxDuration} seconds (scale if needed)
- Tighten beats, improve pacing
- Add editing notes to globalNotes array
- Do not include markdown fences or any text outside JSON
- Preserve scene IDs

Input structure:
${JSON.stringify(structure)}`;

  const response = await requestJson<any>(
    "gpt_edit",
    `${config.gpt.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.gpt.apiKey}`,
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
    config.defaultTimeoutMs
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
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
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
    edited.globalNotes.push(`Truncated to ${maxScenes} scenes`);
  }

  const totalDuration = edited.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  if (totalDuration > maxDuration) {
    const scale = maxDuration / totalDuration;
    edited.scenes = edited.scenes.map((s) => ({
      ...s,
      durationSec: Math.floor(s.durationSec * scale),
    }));
    edited.globalNotes = edited.globalNotes || [];
    edited.globalNotes.push(`Scaled durations to fit ${maxDuration}s total`);
  }

  return edited;
}

async function stageGemini(
  edited: EditedStructure,
  config: EnvConfig
): Promise<LocalizedStructureKA> {
  const systemPrompt = `You are a Georgian localization expert. Translate this video structure to fluent, culturally correct Georgian. Return ONLY valid JSON matching this schema:
{
  "title_ka": "string",
  "logline_ka": "string",
  "scenes_ka": [
    {
      "id": "string (preserve original)",
      "beat_ka": "string",
      "camera_ka": "string",
      "setting_ka": "string",
      "characters_ka": ["string"],
      "action_ka": "string"
    }
  ]
}

Rules:
- Preserve scene IDs exactly as provided
- Use native Georgian script (ქართული), no transliteration
- Ensure cultural appropriateness
- Do not include markdown fences or any text outside JSON

Input structure:
${JSON.stringify(edited)}`;

  const url = `${config.gemini.baseUrl}/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;

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
    config.defaultTimeoutMs
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
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
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

  const systemPrompt = `You are a visual prompt engineer. Convert these scenes into optimized visual prompts for Pollinations AI video generation. Return ONLY valid JSON matching this schema:
{
  "shots": [
    {
      "sceneId": "string (match input scene id)",
      "prompt": "string (detailed visual prompt)",
      "negative": "string (optional)",
      "camera": "string (optional)",
      "lighting": "string (optional)",
      "styleTags": ["string"] (optional)
    }
  ]
}

Rules:
- Each shot must match a scene ID from input
- Prompts must be optimized for AI video generation (detailed, visual, no dialogue)
- Include camera angles, lighting, mood, style: ${styleHint}
- Do not include markdown fences or any text outside JSON

Input scenes:
${JSON.stringify(edited.scenes)}`;

  const response = await requestJson<any>(
    "grok_visual_prompting",
    `${config.grok.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.grok.apiKey}`,
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
    config.defaultTimeoutMs
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
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
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

  for (const shot of prompts.shots) {
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
  const combined = `${requestId}:${sceneId}`;
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

  for (const shot of prompts.shots) {
    const seed = generateDeterministicSeed(input.requestId, shot.sceneId);
    const encodedPrompt = encodeURIComponent(shot.prompt);
    
    const url = `${config.pollinations.baseUrl}/prompt/${encodedPrompt}?width=1080&height=1920&seed=${seed}&nologo=true&enhance=true`;

    renders.push({
      sceneId: shot.sceneId,
      url,
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
    deepseek,
    gpt,
    gemini,
    grok,
    pollinations,
    meta: {
      startedAt,
      finishedAt,
      stageTimingsMs: timings,
    },
  };
}
```
