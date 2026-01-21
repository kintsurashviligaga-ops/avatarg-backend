// lib/orchestrator/coordinator.ts - Avatar G Professional Orchestrator
import { Buffer } from 'node:buffer';

export type PipelineStage =
  | "structure_generation"
  | "georgian_localization"
  | "voiceover_generation"
  | "sound_effects"
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

export interface VideoRender {
  sceneId: string;
  imageUrl: string;
  videoUrl: string;
}

export interface PentagonOutput {
  requestId: string;
  structure: VideoStructure;
  localized: LocalizedStructureKA;
  voiceovers: VoiceoverPack;
  soundEffects: SoundEffectsPack;
  videos: VideoRender[];
  finalVideoUrl: string;
  meta: {
    startedAt: string;
    finishedAt: string;
    stageTimingsMs: Partial<Record<PipelineStage, number>>;
  };
}

interface EnvConfig {
  openai: { apiKey: string; baseUrl: string; model: string };
  elevenlabs: { apiKey: string; voiceId: string; soundKey: string };
  google: { ttsKey: string };
  pexels: { apiKey: string; baseUrl: string };
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
    pexels: { 
        apiKey: process.env.PEXELS_API_KEY || "", 
        baseUrl: "https://api.pexels.com/videos" 
    },
  };
}

const cleanJsonString = (text: string) => text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

// --- Stages ---

async function stageStructure(input: PentagonInput, config: EnvConfig): Promise<VideoStructure> {
  const prompt = `Create a video script for: ${input.userPrompt}. Return ONLY valid JSON with 'title', 'logline', and 'scenes' array. Each scene must have 'id', 'beat', 'durationSec', 'camera', 'setting', 'characters', and 'action'.`;
  
  const res = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ 
      model: config.openai.model, 
      messages: [{ role: "system", content: "You are a specialized JSON generator." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" } 
    })
  });
  
  const data = await res.json();
  const parsed = JSON.parse(cleanJsonString(data.choices[0].message.content));
  if (!parsed.scenes || !Array.isArray(parsed.scenes)) throw new Error("Invalid scenes structure");
  return parsed;
}

async function generateVoice(text: string, config: EnvConfig): Promise<{ audio: string; provider: "elevenlabs" | "google" }> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.elevenlabs.voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': config.elevenlabs.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" })
    });
    if (!res.ok) throw new Error("EL_LIMIT");
    const buffer = await res.arrayBuffer();
    return { audio: Buffer.from(buffer).toString('base64'), provider: "elevenlabs" };
  } catch {
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

async function stageSoundEffects(config: EnvConfig): Promise<SoundEffectsPack> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-effects/generate", {
      method: "POST",
      headers: { "xi-api-key": config.elevenlabs.soundKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Cinematic ambient music", duration_seconds: 30 })
    });
    if (!res.ok) throw new Error();
    const buffer = await res.arrayBuffer();
    return { backgroundMusicUrl: `data:audio/mpeg;base64,${Buffer.from(buffer).toString('base64')}`, provider: "elevenlabs" };
  } catch {
    return { backgroundMusicUrl: "https://cdn.pixabay.com/audio/2022/03/15/audio_8a6bdc2d44.mp3", provider: "fallback" };
  }
}

export async function runPentagonPipeline(input: PentagonInput): Promise<PentagonOutput> {
  const startedAt = new Date().toISOString();
  const timings: Partial<Record<PipelineStage, number>> = {};
  const config = loadEnvConfig();

  // 1. Structure
  let t0 = Date.now();
  const structure = await stageStructure(input, config);
  timings.structure_generation = Date.now() - t0;

  // 2. Localization
  const localized: LocalizedStructureKA = {
    title_ka: "ვიდეო",
    logline_ka: structure.logline,
    scenes_ka: structure.scenes.map(s => ({ 
        ...s, 
        beat_ka: s.beat, camera_ka: s.camera, setting_ka: s.setting, characters_ka: s.characters, action_ka: s.action,
        narration_ka: s.action // იყენებს ვიზუალურ აღწერას ნარაციისთვის
    }))
  };

  // 3. Voiceover
  t0 = Date.now();
  const voiceovers = [];
  for (const scene of localized.scenes_ka) {
    const v = await generateVoice(scene.narration_ka, config);
    voiceovers.push({ sceneId: s.id, text: scene.narration_ka, audioBase64: v.audio, provider: v.provider });
  }
  timings.voiceover_generation = Date.now() - t0;

  // 4. Sound
  const soundEffects = await stageSoundEffects(config);

  // 5. Video Render (Pexels)
  const videos: VideoRender[] = [];
  for (const scene of structure.scenes) {
    const pRes = await fetch(`${config.pexels.baseUrl}/search?query=${encodeURIComponent(scene.action)}&per_page=1`, {
      headers: { Authorization: config.pexels.apiKey }
    });
    const pData = await pRes.json();
    videos.push({
      sceneId: scene.id,
      imageUrl: pData.videos?.[0]?.image || "",
      videoUrl: pData.videos?.[0]?.video_files?.[0]?.link || ""
    });
  }

  return {
    requestId: input.requestId,
    structure,
    localized,
    voiceovers: { voiceovers },
    soundEffects,
    videos,
    finalVideoUrl: videos[0]?.videoUrl || "",
    meta: { startedAt, finishedAt: new Date().toISOString(), stageTimingsMs: timings }
  };
}
