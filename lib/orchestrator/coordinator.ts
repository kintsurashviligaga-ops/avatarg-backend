// lib/orchestrator/coordinator.ts - Avatar G Professional Orchestrator
import { Buffer } from 'node:buffer';

export type PipelineStage =
  | "structure_generation"
  | "gpt_edit"
  | "georgian_localization"
  | "voiceover_generation"
  | "sound_effects"
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
    audioBase64: string;
    provider: "elevenlabs" | "google";
  }>;
}

export interface SoundEffectsPack {
  backgroundMusicUrl: string;
  provider: "elevenlabs" | "fallback";
}

export interface VisualPromptPack {
  shots: Array<{
    sceneId: string;
    prompt: string;
    pexelsQuery: string;
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
  soundEffects: SoundEffectsPack;
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
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(args: { stage: PipelineStage; code: string; message: string; retryable: boolean; cause?: unknown }) {
    super(args.message);
    this.name = "PipelineError";
    this.stage = args.stage;
    this.code = args.code;
    this.retryable = args.retryable;
  }
}

interface EnvConfig {
  openai: { apiKey: string; baseUrl: string; model: string };
  elevenlabs: { apiKey: string; voiceId: string; soundKey: string };
  google: { ttsKey: string };
  xai: { apiKey: string; baseUrl: string; model: string };
  pexels: { apiKey: string; baseUrl: string };
  defaultTimeoutMs: number;
}

function loadEnvConfig(): EnvConfig {
  return {
    openai: { 
        apiKey: process.env.OPENAI_API_KEY || "", 
        baseUrl: "https://api.openai.com/v1", 
        model: "gpt-4o-mini" 
    },
    elevenlabs: { 
        apiKey: process.env.ELEVENLABS_API_KEY || "", 
        voiceId: process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
        soundKey: process.env.ELEVENLABS_SOUND_EFFECTS_API_KEY || process.env.ELEVENLABS_API_KEY || "" 
    },
    google: { 
        ttsKey: process.env.GOOGLE_TTS_API_KEY || "" 
    },
    xai: { 
        apiKey: process.env.XAI_API_KEY || "", 
        baseUrl: "https://api.x.ai/v1", 
        model: "grok-3" 
    },
    pexels: { 
        apiKey: process.env.PEXELS_API_KEY || "", 
        baseUrl: "https://api.pexels.com/videos" 
    },
    defaultTimeoutMs: parseInt(process.env.DEFAULT_TIMEOUT_MS || "45000", 10),
  };
}

// --- დამხმარე ფუნქციები ---
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function cleanJsonString(text: string): Promise<string> {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

// --- ხმის გენერაცია Fallback-ით ---
async function generateVoiceWithFallback(text: string, config: EnvConfig): Promise<{ audio: string; provider: "elevenlabs" | "google" }> {
  try {
    // 1. ElevenLabs (თემური)
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.elevenlabs.voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': config.elevenlabs.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" })
    });
    if (!res.ok) throw new Error("EL_LIMIT");
    const buffer = await res.arrayBuffer();
    return { audio: Buffer.from(buffer).toString('base64'), provider: "elevenlabs" };
  } catch {
    // 2. Google TTS Fallback
    const gRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${config.google.ttsKey}`, {
      method: 'POST',
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ka-GE", name: "ka-GE-Standard-A" },
        audioConfig: { audioEncoding: "MP3" }
      })
    });
    const data = await gRes.json();
    return { audio: data.audioContent, provider: "google" };
  }
}

// --- ეტაპები (Stages) ---

async function stageStructure(input: PentagonInput, config: EnvConfig): Promise<VideoStructure> {
  const prompt = `Create a video script JSON for: ${input.userPrompt}. Max scenes: ${input.constraints?.maxScenes || 5}. Return ONLY JSON.`;
  const res = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.openai.model, messages: [{ role: "system", content: "You are a director." }, { role: "user", content: prompt }], response_format: { type: "json_object" } })
  });
  const data = await res.json();
  return JSON.parse(await cleanJsonString(data.choices[0].message.content));
}

async function stageSoundEffects(duration: number, config: EnvConfig): Promise<SoundEffectsPack> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-effects/generate", {
      method: "POST",
      headers: { "xi-api-key": config.elevenlabs.soundKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Cinematic ambient background music", duration_seconds: Math.min(duration, 60) })
    });
    if (!res.ok) throw new Error();
    const buffer = await res.arrayBuffer();
    return { backgroundMusicUrl: `data:audio/mpeg;base64,${Buffer.from(buffer).toString('base64')}`, provider: "elevenlabs" };
  } catch {
    return { backgroundMusicUrl: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_8a6bdc2d44.mp3", provider: "fallback" };
  }
}

// --- მთავარი Pipeline ---
export async function runPentagonPipeline(input: PentagonInput): Promise<PentagonOutput> {
  const startedAt = new Date().toISOString();
  const timings: Partial<Record<PipelineStage, number>> = {};
  const config = loadEnvConfig();

  // 1. Structure
  let t0 = Date.now();
  const structure = await stageStructure(input, config);
  timings.structure_generation = Date.now() - t0;

  // 2. Localization (Simplified for brevity, but includes narration_ka)
  const localized: LocalizedStructureKA = {
    title_ka: "ვიდეო",
    logline_ka: structure.logline,
    scenes_ka: structure.scenes.map(s => ({ ...s, narration_ka: s.action, beat_ka: s.beat, camera_ka: s.camera, setting_ka: s.setting, characters_ka: s.characters, action_ka: s.action }))
  };

  // 3. Voiceover with Fallback
  t0 = Date.now();
  const voiceovers = [];
  for (const scene of localized.scenes_ka) {
    const voice = await generateVoiceWithFallback(scene.narration_ka, config);
    voiceovers.push({ sceneId: scene.id, text: scene.narration_ka, audioBase64: voice.audio, provider: voice.provider });
  }
  timings.voiceover_generation = Date.now() - t0;

  // 4. Sound Effects
  t0 = Date.now();
  const soundEffects = await stageSoundEffects(60, config);
  timings.sound_effects = Date.now() - t0;

  // 5. Visuals & Video Render (Pexels)
  t0 = Date.now();
  const videos: VideoRender[] = [];
  for (const scene of structure.scenes) {
      const pexelsRes = await fetch(`${config.pexels.baseUrl}/search?query=${encodeURIComponent(scene.action)}&per_page=1`, {
          headers: { Authorization: config.pexels.apiKey }
      });
      const pData = await pexelsRes.json();
      videos.push({
          sceneId: scene.id,
          imageUrl: pData.videos[0]?.image || "",
          videoUrl: pData.videos[0]?.video_files[0]?.link || ""
      });
  }
  timings.video_rendering = Date.now() - t0;

  return {
    requestId: input.requestId,
    structure,
    edited: { ...structure, globalNotes: [] },
    localized,
    voiceovers: { voiceovers },
    soundEffects,
    visualPrompts: { shots: structure.scenes.map(s => ({ sceneId: s.id, prompt: s.action, pexelsQuery: s.action })) },
    videos,
    finalVideoUrl: videos[0]?.videoUrl || "",
    meta: { startedAt, finishedAt: new Date().toISOString(), stageTimingsMs: timings }
  };
}
