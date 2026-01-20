// lib/orchestrator/coordinator.ts
// AI Pentagon Pipeline: GPT-4o → GPT-4o → GPT-4o → ElevenLabs → Grok → Pollinations
// Production-ready with Georgian voiceover support via ElevenLabs

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
  pollinations: { baseUrl: string; videoBaseUrl: string };
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
      stage: "structure_generation",
      code: "BAD_REQUEST",
      message: errorMessage,
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

async function stageStructure(
  input: PentagonInput,
  config: EnvConfig
): Promise<VideoStructure> {
  const maxScenes = input.constraints?.maxScenes || 6;
  const maxDuration = input.constraints?.maxDurationSec || 120;

  const lines: string[] = [];
  lines.push("You are a video structure architect. Return ONLY valid JSON matching this exact schema:");
  lines.push("{");
  lines.push('  "title": "string",');
  lines.push('  "logline": "string",');
  lines.push('  "scenes": [');
  lines.push("    {");
  lines.push('      "id": "scene_1",');
  lines.push('      "beat": "string description of what happens",');
  lines.push('      "durationSec": 10,');
  lines.push('      "camera": "wide shot/close-up/etc",');
  lines.push('      "setting": "location description",');
  lines.push('      "characters": ["character names"],');
  lines.push('      "action": "detailed action description"');
  lines.push("    }");
  lines.push("  ]");
  lines.push("}");
  lines.push("");
  lines.push("RULES:");
  lines.push("- Maximum " + String(maxScenes) + " scenes");
  lines.push("- Total duration must not exceed " + String(maxDuration) + " seconds");
  lines.push("- Each scene MUST have unique ID like scene_1, scene_2, etc");
  lines.push("- Do NOT include markdown code fences");
  lines.push("- Return ONLY the JSON object, nothing else");
  lines.push("");
  lines.push("User request: " + input.userPrompt);

  const systemPrompt = lines.join("\n");

  const requestBody = {
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "structure_generation",
    config.openai.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.openai.apiKey,
      },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  let content = "";
  if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
    content = response.choices[0].message.content;
  }

  if (!content) {
    throw new PipelineError({
      stage: "structure_generation",
      code: "INVALID_JSON",
      message: "Structure response missing",
      retryable: false,
    });
  }

  let structure: VideoStructure;
  try {
    const cleaned = cleanJsonString(content);
    structure = JSON.parse(cleaned);
  } catch (error) {
    throw new PipelineError({
      stage: "structure_generation",
      code: "INVALID_JSON",
      message: "Failed to parse structure JSON",
      retryable: false,
      cause: error,
    });
  }

  if (!structure.title || !structure.logline || !Array.isArray(structure.scenes)) {
    throw new PipelineError({
      stage: "structure_generation",
      code: "INVALID_JSON",
      message: "Invalid structure: missing required fields",
      retryable: false,
    });
  }

  return structure;
}

async function stageEdit(
  structure: VideoStructure,
  input: PentagonInput,
  config: EnvConfig
): Promise<EditedStructure> {
  const maxScenes = input.constraints?.maxScenes || 6;
  const maxDuration = input.constraints?.maxDurationSec || 120;

  const lines: string[] = [];
  lines.push("You are a professional video editor. Refine this video structure.");
  lines.push("Return ONLY valid JSON with the same structure PLUS a globalNotes array.");
  lines.push("");
  lines.push("CONSTRAINTS:");
  lines.push("- Maximum " + String(maxScenes) + " scenes (truncate if needed)");
  lines.push("- Total duration must not exceed " + String(maxDuration) + " seconds (scale if needed)");
  lines.push("- Preserve all scene IDs exactly as they are");
  lines.push("- Improve pacing and flow");
  lines.push("- Add your editing notes to globalNotes array");
  lines.push("- Do NOT include markdown code fences");
  lines.push("");
  lines.push("Input structure:");
  lines.push(JSON.stringify(structure));

  const systemPrompt = lines.join("\n");

  const requestBody = {
    model: config.openai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(structure) },
    ],
    temperature: 0.5,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "gpt_edit",
    config.openai.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.openai.apiKey,
      },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  let content = "";
  if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
    content = response.choices[0].message.content;
  }

  if (!content) {
    throw new PipelineError({
      stage: "gpt_edit",
      code: "INVALID_JSON",
      message: "GPT response missing",
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

  edited.globalNotes = edited.globalNotes || [];

  if (edited.scenes.length > maxScenes) {
    const truncated = [];
    for (let i = 0; i < maxScenes; i = i + 1) {
      truncated.push(edited.scenes[i]);
    }
    edited.scenes = truncated;
    edited.globalNotes.push("Truncated to " + String(maxScenes) + " scenes");
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
    edited.globalNotes.push("Scaled durations to fit " + String(maxDuration) + "s total");
  }

  return edited;
}

async function stageLocalize(
  edited: EditedStructure,
  config: EnvConfig
): Promise<LocalizedStructureKA> {
  const lines: string[] = [];
  lines.push("Translate this video structure to Georgian. For each scene, also create a short voiceover narration script (2-3 sentences).");
  lines.push("Return JSON with all field names ending in _ka, PLUS narration_ka for voiceover text.");
  lines.push("");
  lines.push("Use native Georgian script.");
  lines.push("");
  lines.push("Input structure:");
  lines.push(JSON.stringify(edited, null, 2));

  const systemPrompt = lines.join("\n");

  const requestBody = {
    model: config.openai.model,
    messages: [
      { 
        role: "system", 
        content: "You are a Georgian translator. Translate JSON to Georgian, add _ka suffix to field names, and create narration_ka text for voiceovers." 
      },
      { role: "user", content: systemPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "georgian_localization",
    config.openai.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.openai.apiKey,
      },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    3
  );

  let content = "";
  if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
    content = response.choices[0].message.content;
  }

  if (!content) {
    throw new PipelineError({
      stage: "georgian_localization",
      code: "INVALID_JSON",
      message: "Localization response missing",
      retryable: false,
    });
  }

  let parsed: any;
  try {
    const cleaned = cleanJsonString(content);
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new PipelineError({
      stage: "georgian_localization",
      code: "INVALID_JSON",
      message: "Failed to parse JSON: " + String(error),
      retryable: false,
      cause: error,
    });
  }

  const localized: LocalizedStructureKA = {
    title_ka: parsed.title_ka || parsed.title || "უსათაურო",
    logline_ka: parsed.logline_ka || parsed.logline || "",
    scenes_ka: [],
  };

  if (Array.isArray(parsed.scenes_ka)) {
    localized.scenes_ka = parsed.scenes_ka.map((scene: any) => ({
      id: scene.id,
      beat_ka: scene.beat_ka || scene.beat || "",
      camera_ka: scene.camera_ka || scene.camera || "",
      setting_ka: scene.setting_ka || scene.setting || "",
      characters_ka: scene.characters_ka || scene.characters || [],
      action_ka: scene.action_ka || scene.action || "",
      narration_ka: scene.narration_ka || scene.action_ka || scene.beat_ka || "",
    }));
  } else if (Array.isArray(parsed.scenes)) {
    localized.scenes_ka = parsed.scenes.map((scene: any) => ({
      id: scene.id,
      beat_ka: scene.beat_ka || scene.beat || "",
      camera_ka: scene.camera_ka || scene.camera || "",
      setting_ka: scene.setting_ka || scene.setting || "",
      characters_ka: scene.characters_ka || scene.characters || [],
      action_ka: scene.action_ka || scene.action || "",
      narration_ka: scene.narration_ka || scene.action_ka || scene.beat_ka || "",
    }));
  }

  if (!localized.title_ka || !localized.scenes_ka || localized.scenes_ka.length === 0) {
    throw new PipelineError({
      stage: "georgian_localization",
      code: "INVALID_JSON",
      message: "Could not build valid localization",
      retryable: false,
    });
  }

  return localized;
}

async function stageVoiceover(
  localized: LocalizedStructureKA,
  config: EnvConfig
): Promise<VoiceoverPack> {
  const voiceovers: Array<{ sceneId: string; text: string; audioUrl: string }> = [];

  for (let i = 0; i < localized.scenes_ka.length; i = i + 1) {
    const scene = localized.scenes_ka[i];
    const narrationText = scene.narration_ka || scene.action_ka || scene.beat_ka;

    if (!narrationText || narrationText.length < 5) {
      voiceovers.push({
        sceneId: scene.id,
        text: "",
        audioUrl: "",
      });
      continue;
    }

    const audioUrl = config.elevenlabs.baseUrl + "/text-to-speech/" + config.elevenlabs.voiceId + "/stream?text=" + encodeURIComponent(narrationText) + "&model_id=eleven_multilingual_v2";

    voiceovers.push({
      sceneId: scene.id,
      text: narrationText,
      audioUrl: audioUrl,
    });

    await sleep(500);
  }

  return { voiceovers: voiceovers };
}

async function stageVisualPrompts(
  edited: EditedStructure,
  input: PentagonInput,
  config: EnvConfig
): Promise<VisualPromptPack> {
  const styleHint = input.constraints?.style || "cinematic, professional, 4K, beautiful lighting";

  const lines: string[] = [];
  lines.push("You are a visual prompt engineer for AI video generation.");
  lines.push("Convert these scenes into optimized visual prompts for Pollinations AI.");
  lines.push("Return ONLY valid JSON with a shots array.");
  lines.push("");
  lines.push("Style requirements: " + styleHint);
  lines.push("");
  lines.push("Each shot must include:");
  lines.push("- sceneId (matching the input scene ID)");
  lines.push("- prompt (detailed visual description optimized for AI)");
  lines.push("- Optional: negative, camera, lighting, styleTags");
  lines.push("");
  lines.push("Do NOT include markdown code fences.");
  lines.push("");
  lines.push("Input scenes:");
  lines.push(JSON.stringify(edited.scenes));

  const systemPrompt = lines.join("\n");

  const requestBody = {
    model: config.xai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(edited.scenes) },
    ],
    temperature: 0.8,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  };

  const response = await requestJson<any>(
    "visual_prompting",
    config.xai.baseUrl + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.xai.apiKey,
      },
      body: JSON.stringify(requestBody),
    },
    config.defaultTimeoutMs,
    2
  );

  let content = "";
  if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
    content = response.choices[0].message.content;
  }

  if (!content) {
    throw new PipelineError({
      stage: "visual_prompting",
      code: "INVALID_JSON",
      message: "Visual prompts response missing",
      retryable: false,
    });
  }

  let prompts: VisualPromptPack;
  try {
    const cleaned = cleanJsonString(content);
    prompts = JSON.parse(cleaned);
  } catch (error) {
    throw new PipelineError({
      stage: "visual_prompting",
      code: "INVALID_JSON",
      message: "Failed to parse visual prompts JSON",
      retryable: false,
      cause: error,
    });
  }

  if (!Array.isArray(prompts.shots) || prompts.shots.length === 0) {
    throw new PipelineError({
      stage: "visual_prompting",
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

async function stageVideoRender(
  prompts: VisualPromptPack,
  input: PentagonInput,
  config: EnvConfig
): Promise<VideoRender[]> {
  const renders: VideoRender[] = [];

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
  const visualPrompts = await stageVisualPrompts(edited, input, config);
  timings.visual_prompting = Date.now() - t0;

  t0 = Date.now();
  const videos = await stageVideoRender(visualPrompts, input, config);
  timings.video_rendering = Date.now() - t0;

  const finishedAt = new Date().toISOString();
  const finalVideoUrl = videos.length > 0 ? videos[0].videoUrl : "";

  return {
    requestId: input.requestId,
    structure: structure,
    edited: edited,
    localized: localized,
    voiceovers: voiceovers,
    visualPrompts: visualPrompts,
    videos: videos,
    finalVideoUrl: finalVideoUrl,
    meta: {
      startedAt: startedAt,
      finishedAt: finishedAt,
      stageTimingsMs: timings,
    },
  };
}
