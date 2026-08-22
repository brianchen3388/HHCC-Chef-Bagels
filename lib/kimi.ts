type TextMessage = {
  role: 'system' | 'user';
  content: string;
};

type VisionMessage = {
  role: 'user';
  content: Array<
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'text'; text: string }
  >;
};

type KimiMessage = TextMessage | VisionMessage;

type KimiJsonRequest = {
  model: string;
  messages: KimiMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  retryMaxTokens?: number;
  reasoningEffort?: 'low' | 'high' | 'max';
};

type KimiChatResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
    };
  }>;
};

export class KimiRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'KimiRequestError';
  }
}

function getApiKey() {
  const apiKey = process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY;
  if (!apiKey) {
    throw new KimiRequestError(
      'KIMI_NOT_CONFIGURED',
      503,
      'Kimi API Key 尚未配置。请先在 .env.local 中填写。',
    );
  }
  return apiKey;
}

function getBaseUrl() {
  const configuredUrl = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new KimiRequestError(
      'KIMI_BAD_CONFIG',
      503,
      'Kimi API 地址配置无效。',
    );
  }

  const allowedHosts = new Set(['api.moonshot.cn', 'api.moonshot.ai']);
  if (parsedUrl.protocol !== 'https:' || !allowedHosts.has(parsedUrl.hostname)) {
    throw new KimiRequestError(
      'KIMI_BAD_CONFIG',
      503,
      'Kimi API 地址必须使用 Moonshot 官方 HTTPS 地址。',
    );
  }
  return configuredUrl.replace(/\/+$/, '');
}

function mapUpstreamError(status: number) {
  if (status === 401 || status === 403) {
    return new KimiRequestError(
      'KIMI_AUTH_FAILED',
      502,
      'Kimi API Key 无效或无权使用所选模型。',
    );
  }
  if (status === 429) {
    return new KimiRequestError(
      'KIMI_RATE_LIMITED',
      429,
      'Kimi 请求过于频繁，请稍后重试。',
    );
  }
  return new KimiRequestError(
    'KIMI_UPSTREAM_ERROR',
    502,
    'Kimi 暂时无法完成请求，请重试。',
  );
}

function parseStructuredContent(content: string) {
  const trimmedContent = content.trim();

  try {
    return JSON.parse(trimmedContent) as unknown;
  } catch {
    const fencedJsonMatch =
      /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i.exec(trimmedContent);

    if (fencedJsonMatch) {
      try {
        return JSON.parse(fencedJsonMatch[1]) as unknown;
      } catch {
        // The complete outer fence is tolerated, but incomplete JSON is not repaired.
      }
    }

    throw new KimiRequestError(
      'KIMI_INVALID_JSON',
      502,
      'Kimi 返回的结构化结果无效，请重试。',
    );
  }
}

async function requestKimiJsonAttempt({
  model,
  messages,
  schemaName,
  schema,
  maxTokens,
  reasoningEffort,
}: Omit<KimiJsonRequest, 'retryMaxTokens'>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw mapUpstreamError(response.status);
    }

    const rawResponse = await response.text();
    if (rawResponse.length > 800000) {
      throw new KimiRequestError(
        'KIMI_RESPONSE_TOO_LARGE',
        502,
        'Kimi 返回内容过大，请简化草图后重试。',
      );
    }

    let payload: KimiChatResponse;
    try {
      payload = JSON.parse(rawResponse) as KimiChatResponse;
    } catch {
      throw new KimiRequestError(
        'KIMI_INVALID_RESPONSE',
        502,
        'Kimi 返回了无法解析的结果，请重试。',
      );
    }

    const choice = payload.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new KimiRequestError(
        'KIMI_OUTPUT_TRUNCATED',
        502,
        'Kimi 输出被截断，请简化草图后重试。',
      );
    }

    const content = choice?.message?.content;
    if (!content) {
      throw new KimiRequestError(
        'KIMI_EMPTY_RESPONSE',
        502,
        'Kimi 没有返回有效内容，请重试。',
      );
    }

    return parseStructuredContent(content);
  } catch (error) {
    if (error instanceof KimiRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new KimiRequestError(
        'KIMI_TIMEOUT',
        504,
        'Kimi 响应超时，请重试。',
      );
    }
    throw new KimiRequestError(
      'KIMI_NETWORK_ERROR',
      502,
      '无法连接 Kimi，请检查网络后重试。',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestKimiJson({
  model,
  messages,
  schemaName,
  schema,
  maxTokens,
  retryMaxTokens,
  reasoningEffort,
}: KimiJsonRequest) {
  const retryableCodes = new Set([
    'KIMI_INVALID_JSON',
    'KIMI_OUTPUT_TRUNCATED',
    'KIMI_EMPTY_RESPONSE',
  ]);

  try {
    return await requestKimiJsonAttempt({
      model,
      messages,
      schemaName,
      schema,
      maxTokens,
      reasoningEffort,
    });
  } catch (error) {
    if (!(error instanceof KimiRequestError) || !retryableCodes.has(error.code)) {
      throw error;
    }

    return requestKimiJsonAttempt({
      model,
      messages,
      schemaName,
      schema,
      maxTokens: Math.max(maxTokens, retryMaxTokens ?? maxTokens),
      reasoningEffort,
    });
  }
}

export function kimiErrorResponse(error: unknown) {
  if (error instanceof KimiRequestError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  return Response.json(
    { error: '处理模型结果时发生错误，请重试。', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}
