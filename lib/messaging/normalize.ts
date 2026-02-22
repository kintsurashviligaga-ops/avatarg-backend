export type NormalizedMessage = {
  platform: 'whatsapp' | 'telegram';
  messageId: string;
  from: string;
  chatId: string;
  timestamp: number;
  text?: string;
  media?: {
    type: 'image' | 'audio' | 'video' | 'document';
    url?: string;
    mime?: string;
  };
  raw: unknown;
};

function toStringSafe(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return fallback;
}

export function normalizeWhatsApp(payload: unknown): NormalizedMessage[] {
  const root = payload as Record<string, unknown> | null;
  if (!root || !Array.isArray(root.entry)) {
    return [];
  }

  const messages: NormalizedMessage[] = [];

  for (const entry of root.entry) {
    const entryObj = entry as Record<string, unknown> | null;
    if (!entryObj || !Array.isArray(entryObj.changes)) {
      continue;
    }

    for (const change of entryObj.changes) {
      const changeObj = change as Record<string, unknown> | null;
      const value = (changeObj?.value || null) as Record<string, unknown> | null;
      if (!value || !Array.isArray(value.messages)) {
        continue;
      }

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const firstContact = (contacts[0] || null) as Record<string, unknown> | null;
      const waFrom = toStringSafe(firstContact?.wa_id, 'unknown');

      for (let index = 0; index < value.messages.length; index += 1) {
        const item = value.messages[index];
        const msg = item as Record<string, unknown> | null;
        if (!msg) {
          continue;
        }

        const from = toStringSafe(msg.from, waFrom);
        const stableFallbackId = `wa:${from}:${toStringSafe(msg.timestamp, '0')}:${index}`;
        const msgId = toStringSafe(msg.id, stableFallbackId);
        const timestamp = Number(msg.timestamp || Math.floor(Date.now() / 1000)) * 1000;
        const type = toStringSafe(msg.type, 'text');
        const textBody = ((msg.text || null) as Record<string, unknown> | null)?.body;

        let media: NormalizedMessage['media'];
        if (['image', 'audio', 'video', 'document'].includes(type)) {
          const mediaObj = (msg[type] || null) as Record<string, unknown> | null;
          media = {
            type: type as 'image' | 'audio' | 'video' | 'document',
            mime: typeof mediaObj?.mime_type === 'string' ? mediaObj.mime_type : undefined,
          };
        }

        messages.push({
          platform: 'whatsapp',
          messageId: msgId,
          from,
          chatId: from,
          timestamp,
          text: typeof textBody === 'string' ? textBody : undefined,
          media,
          raw: msg,
        });
      }
    }
  }

  return messages;
}

export function normalizeTelegram(payload: unknown): NormalizedMessage[] {
  const root = payload as Record<string, unknown> | null;
  if (!root) {
    return [];
  }

  const message = ((root.message || root.edited_message || root.channel_post || null) as Record<string, unknown> | null);
  if (!message) {
    return [];
  }

  const from = (message.from || null) as Record<string, unknown> | null;
  const chat = (message.chat || null) as Record<string, unknown> | null;

  const messageId = toStringSafe(message.message_id, `tg-${Date.now()}`);
  const fromId = toStringSafe(from?.id, 'unknown');
  const chatId = toStringSafe(chat?.id, fromId);
  const timestamp = Number(message.date || Math.floor(Date.now() / 1000)) * 1000;

  let media: NormalizedMessage['media'];
  if (message.photo) {
    media = { type: 'image' };
  } else if (message.audio) {
    media = { type: 'audio' };
  } else if (message.video) {
    media = { type: 'video' };
  } else if (message.document) {
    media = { type: 'document' };
  }

  return [
    {
      platform: 'telegram',
      messageId,
      from: fromId,
      chatId,
      timestamp,
      text: typeof message.text === 'string' ? message.text : undefined,
      media,
      raw: root,
    },
  ];
}
