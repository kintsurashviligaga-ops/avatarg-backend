export type IncomingWhatsAppEvent = {
  phoneNumberId: string | null;
  waId: string | null;
  messageId: string | null;
  timestamp: string | null;
  eventType: 'message' | 'status';
  messageType: string | null;
  text: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readInteractiveText(message: Record<string, unknown>): string | null {
  const interactive = asRecord(message.interactive);
  if (!interactive) {
    return null;
  }

  const buttonReply = asRecord(interactive.button_reply);
  const listReply = asRecord(interactive.list_reply);

  return asString(buttonReply?.title) || asString(listReply?.title);
}

export function extractIncomingWhatsAppEvents(payload: unknown): IncomingWhatsAppEvent[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const entries = Array.isArray(root.entry) ? root.entry : [];
  const events: IncomingWhatsAppEvent[] = [];

  for (const entryItem of entries) {
    const entry = asRecord(entryItem);
    if (!entry) {
      continue;
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const changeItem of changes) {
      const change = asRecord(changeItem);
      const value = asRecord(change?.value);
      if (!value) {
        continue;
      }

      const metadata = asRecord(value.metadata);
      const phoneNumberId = asString(metadata?.phone_number_id);

      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const messageItem of messages) {
        const message = asRecord(messageItem);
        if (!message) {
          continue;
        }

        const textRecord = asRecord(message.text);
        events.push({
          phoneNumberId,
          waId: asString(message.from),
          messageId: asString(message.id),
          timestamp: asString(message.timestamp),
          eventType: 'message',
          messageType: asString(message.type),
          text: asString(textRecord?.body) || readInteractiveText(message),
        });
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const statusItem of statuses) {
        const status = asRecord(statusItem);
        if (!status) {
          continue;
        }

        events.push({
          phoneNumberId,
          waId: asString(status.recipient_id),
          messageId: asString(status.id),
          timestamp: asString(status.timestamp),
          eventType: 'status',
          messageType: asString(status.status),
          text: null,
        });
      }
    }
  }

  return events;
}