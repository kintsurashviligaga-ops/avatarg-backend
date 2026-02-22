import type { NormalizedMessage } from '@/lib/messaging/normalize';

export type RouteDecision = {
  agentName: string;
  action: string;
  responseText: string;
  metadata: Record<string, unknown>;
};

const keywordMap: Array<{ key: string; action: string; responseText: string }> = [
  { key: 'avatar', action: 'avatar_assist', responseText: 'Avatar flow selected. Share your idea and style.' },
  { key: 'music', action: 'music_assist', responseText: 'Music flow selected. Tell me mood, genre, and duration.' },
  { key: 'video', action: 'video_assist', responseText: 'Video flow selected. Send your concept and preferred format.' },
  { key: 'order', action: 'order_support', responseText: 'Order support selected. Share your order ID to continue.' },
];

function commandDecision(command: string): RouteDecision | null {
  if (command === '/help') {
    return {
      agentName: 'AgentG',
      action: 'help',
      responseText: 'Commands: /start /help /agent /lang',
      metadata: { command },
    };
  }

  if (command === '/start') {
    return {
      agentName: 'AgentG',
      action: 'start',
      responseText: 'Welcome to Agent G. Ask about avatar, video, music, or orders.',
      metadata: { command },
    };
  }

  if (command === '/agent') {
    return {
      agentName: 'AgentG',
      action: 'agent_info',
      responseText: 'Agent G is active and ready to route your request.',
      metadata: { command },
    };
  }

  if (command === '/lang') {
    return {
      agentName: 'AgentG',
      action: 'language_switch',
      responseText: 'Language options are available. Reply with your preferred language code.',
      metadata: { command },
    };
  }

  return null;
}

export function routeMessage(msg: NormalizedMessage): RouteDecision {
  const text = String(msg.text || '').trim();
  if (!text) {
    return {
      agentName: 'AgentG',
      action: 'no_text',
      responseText: 'Message received. Please send text for routing.',
      metadata: { hasMedia: Boolean(msg.media) },
    };
  }

  if (text.startsWith('/')) {
    const command = text.split(/\s+/)[0].toLowerCase();
    const decision = commandDecision(command);
    if (decision) {
      return decision;
    }
  }

  const lowered = text.toLowerCase();
  const match = keywordMap.find((item) => lowered.includes(item.key));
  if (match) {
    return {
      agentName: 'AgentG',
      action: match.action,
      responseText: match.responseText,
      metadata: { matchedKeyword: match.key },
    };
  }

  return {
    agentName: 'AgentG',
    action: 'default_chat',
    responseText: 'Agent G received your message and is ready to help.',
    metadata: { fallback: true },
  };
}
