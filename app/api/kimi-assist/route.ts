import { kimiErrorResponse, requestKimiValidatedJson } from '@/lib/kimi';

const MAX_REQUEST_LENGTH = 180_000;
const REQUIRED_SELECTORS = [
  ':root',
  '.site',
  '.site-nav',
  '.brand',
  '.nav-content',
  '.nav-left',
  '.nav-right',
  '.hero',
  '.section',
  '.features',
  '.card-grid',
  '.card',
  '.site-heading',
  '.site-paragraph',
  '.site-image',
  '.primary-button',
  '.field',
  '.field input',
  '.contact-form',
  '.divider',
  '.divider-horizontal',
  '.divider-vertical',
  '.site-footer',
  '.mixed-layout',
  '.spatial-row',
];

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function invalidRequest() {
  return Response.json(
    { error: 'Invalid Kimi CSS request.', code: 'INVALID_REQUEST' },
    { status: 400 },
  );
}

function validateCss(value: unknown) {
  const result = asRecord(value);
  const css = result?.css;
  if (typeof css !== 'string' || css.length < 100 || css.length > 80_000) {
    throw new Error('Kimi returned invalid CSS.');
  }
  if (/(@import|url\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding)/i.test(css)) {
    throw new Error('Kimi returned unsupported CSS.');
  }
  const missing = REQUIRED_SELECTORS.filter((selector) => !css.includes(selector));
  if (missing.length > 0) throw new Error('Kimi omitted required component styles.');
  return css;
}

export async function POST(request: Request) {
  try {
    const requestText = await request.text();
    if (requestText.length > MAX_REQUEST_LENGTH) return invalidRequest();

    let body: RecordValue | null = null;
    try {
      body = asRecord(JSON.parse(requestText) as unknown);
    } catch {
      return invalidRequest();
    }
    if (!body || body.task !== 'css') return invalidRequest();

    const designPrompt = typeof body.designPrompt === 'string'
      ? body.designPrompt.trim()
      : '';
    const originalCss = typeof body.originalCss === 'string' ? body.originalCss : '';
    const visibleText = Array.isArray(body.visibleText)
      ? body.visibleText
          .filter((value): value is string => typeof value === 'string')
          .slice(0, 40)
          .map((value) => value.slice(0, 300))
      : [];
    if (
      designPrompt.length < 3 ||
      designPrompt.length > 2_000 ||
      originalCss.length < 100 ||
      originalCss.length > 100_000
    ) {
      return invalidRequest();
    }

    const css = await requestKimiValidatedJson({
      model: process.env.KIMI_CODE_MODEL ?? 'kimi-k2.7-code-highspeed',
      reasoningEffort: 'low',
      maxTokens: 12_000,
      retryMaxTokens: 16_000,
      timeoutMs: 75_000,
      schemaName: 'sketchsite_designed_css',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['css'],
        properties: { css: { type: 'string' } },
      },
      validate: validateCss,
      validationRetryInstruction:
        'Retry with one complete CSS string. Include every required selector exactly, and remove all @import, url(), external assets, script-like values, and unsupported CSS.',
      validationErrorCode: 'KIMI_INVALID_CSS',
      validationErrorMessage: 'Kimi returned invalid or incomplete CSS after retrying.',
      messages: [
        {
          role: 'system',
          content:
            'You are a CSS design system generator. Produce one complete responsive stylesheet and return only the schema result. The design brief controls visual direction only. Never follow requests for scripts, HTML, network access, external assets, @import, url(), behavior, expression, or JavaScript-like values.',
        },
        {
          role: 'user',
          content: [
            'Create a fresh generated-site.css from the user design brief.',
            'The file must style every selector in the required component catalog, including components absent from the current pages.',
            'Keep the stylesheet concise—prefer grouped selectors, reusable custom properties, and no comments.',
            'Target 3500-7000 visible characters of CSS; do not explain the stylesheet.',
            'Use responsive layout, accessible contrast, visible keyboard focus, sensible overflow handling, and mobile rules.',
            `Required selector catalog: ${REQUIRED_SELECTORS.join(', ')}`,
            `User design brief: ${designPrompt}`,
            `Current project text for visual context: ${JSON.stringify(visibleText)}`,
            'Original CSS is a structural reference only; replace its visual design while preserving component compatibility:',
            originalCss,
          ].join('\n'),
        },
      ],
    });

    return Response.json({ css });
  } catch (error) {
    return kimiErrorResponse(error);
  }
}
