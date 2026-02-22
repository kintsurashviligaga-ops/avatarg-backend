import type { NormalizedMessage } from '@/lib/messaging/normalize';
import { logStructured } from '@/lib/logging/logger';

export interface MemoryStore {
  saveMessage(msg: NormalizedMessage): Promise<void>;
  getRecent(chatId: string, limit: number): Promise<NormalizedMessage[]>;
}

type SupabaseRow = {
  id?: string;
  platform: string;
  chat_id: string;
  message_id: string;
  from: string;
  text: string | null;
  created_at?: string;
  raw: unknown;
};

class InMemoryStore implements MemoryStore {
  private byChat = new Map<string, NormalizedMessage[]>();

  async saveMessage(msg: NormalizedMessage): Promise<void> {
    const existing = this.byChat.get(msg.chatId) || [];
    existing.push(msg);
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }
    this.byChat.set(msg.chatId, existing);
  }

  async getRecent(chatId: string, limit: number): Promise<NormalizedMessage[]> {
    const existing = this.byChat.get(chatId) || [];
    return existing.slice(-Math.max(1, limit));
  }
}

class SupabaseMemoryStore implements MemoryStore {
  constructor(private readonly baseUrl: string, private readonly serviceRoleKey: string) {}

  private headers(): HeadersInit {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    };
  }

  async saveMessage(msg: NormalizedMessage): Promise<void> {
    const row: SupabaseRow = {
      platform: msg.platform,
      chat_id: msg.chatId,
      message_id: msg.messageId,
      from: msg.from,
      text: msg.text || null,
      raw: msg.raw,
    };

    const response = await fetch(`${this.baseUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(row),
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`supabase_save_failed:${response.status}:${body.slice(0, 200)}`);
    }
  }

  async getRecent(chatId: string, limit: number): Promise<NormalizedMessage[]> {
    const query = new URLSearchParams({
      select: 'platform,chat_id,message_id,from,text,raw,created_at',
      chat_id: `eq.${chatId}`,
      order: 'created_at.desc',
      limit: String(Math.max(1, limit)),
    });

    const response = await fetch(`${this.baseUrl}/rest/v1/chat_messages?${query.toString()}`, {
      method: 'GET',
      headers: this.headers(),
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    const rows = (await response.json().catch(() => [])) as SupabaseRow[];
    return rows.map((row) => ({
      platform: row.platform === 'telegram' ? 'telegram' : 'whatsapp',
      chatId: row.chat_id,
      messageId: row.message_id,
      from: row.from,
      text: row.text || undefined,
      timestamp: row.created_at ? Date.parse(row.created_at) : Date.now(),
      raw: row.raw,
    }));
  }
}

let singleton: MemoryStore | null = null;
let warnedFallback = false;

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    return null;
  }

  return { url: url.replace(/\/$/, ''), key };
}

export function getMemoryStore(): MemoryStore {
  if (singleton) {
    return singleton;
  }

  const cfg = getSupabaseConfig();
  if (cfg) {
    singleton = new SupabaseMemoryStore(cfg.url, cfg.key);
    return singleton;
  }

  if (!warnedFallback) {
    warnedFallback = true;
    logStructured('warn', 'memory.in_memory_fallback', { event: 'memory_fallback' });
  }

  singleton = new InMemoryStore();
  return singleton;
}

export async function checkMemoryConnectivity(): Promise<{ ok: boolean; mode: 'supabase' | 'memory' }> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return { ok: true, mode: 'memory' };
  }

  const response = await fetch(`${cfg.url}/rest/v1/chat_messages?select=id&limit=1`, {
    method: 'GET',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
    cache: 'no-store',
  });

  return { ok: response.ok, mode: 'supabase' };
}
