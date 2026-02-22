type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AiExecutionInput = {
  fallbackChain: Array<{ provider: 'openai' | 'gemini' | 'mock'; model: string }>;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
};

export type AiExecutionResult = {
  provider: 'openai' | 'gemini' | 'mock';
  model: string;
  content: string;
  usageTokens: number;
  fallbackUsed: boolean;
};

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function callOpenAi(model: string, input: AiExecutionInput): Promise<AiExecutionResult> {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('openai_unavailable');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`openai_http_${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  } | null;

  const content = String(payload?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    throw new Error('openai_empty_response');
  }

  return {
    provider: 'openai',
    model,
    content,
    usageTokens: Number(payload?.usage?.total_tokens || estimateTokens(content)),
    fallbackUsed: false,
  };
}

async function callGemini(model: string, input: AiExecutionInput): Promise<AiExecutionResult> {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('gemini_unavailable');
  }

  const prompt = input.messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: input.maxTokens,
          temperature: input.temperature,
        },
      }),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(`gemini_http_${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { totalTokenCount?: number };
  } | null;

  const content = String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (!content) {
    throw new Error('gemini_empty_response');
  }

  return {
    provider: 'gemini',
    model,
    content,
    usageTokens: Number(payload?.usageMetadata?.totalTokenCount || estimateTokens(content)),
    fallbackUsed: false,
  };
}

function callMock(model: string, input: AiExecutionInput): AiExecutionResult {
  const prompt = input.messages[input.messages.length - 1]?.content || 'No input';
  const content = `Mock response for: ${prompt.slice(0, 280)}`;
  return {
    provider: 'mock',
    model,
    content,
    usageTokens: estimateTokens(content),
    fallbackUsed: false,
  };
}

export async function executeAiWithFallback(input: AiExecutionInput): Promise<AiExecutionResult> {
  let lastError: unknown;
  for (let index = 0; index < input.fallbackChain.length; index += 1) {
    const candidate = input.fallbackChain[index];
    try {
      const result = candidate.provider === 'openai'
        ? await callOpenAi(candidate.model, input)
        : candidate.provider === 'gemini'
          ? await callGemini(candidate.model, input)
          : callMock(candidate.model, input);

      return {
        ...result,
        fallbackUsed: index > 0,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'ai_execution_failed');
}
