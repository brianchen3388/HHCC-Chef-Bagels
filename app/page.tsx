'use client';

import { useMemo, useRef, useState } from 'react';
import type { ComponentScene, GeneratedPage } from '@/lib/contracts';
import DrawingWorkspace from './DrawingWorkspace';

const previewSizes = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
] as const;

const stageLabels = {
  idle: 'AI ready',
  recognizing: 'Recognizing components',
  generating: 'Writing HTML & CSS',
  success: 'Preview ready',
  error: 'Needs attention',
} as const;

type GenerationStage = keyof typeof stageLabels;
type PreviewSize = (typeof previewSizes)[number]['id'];
type OutputView = 'preview' | 'structure' | 'code';

const allowedPreviewTags = new Set([
  'main',
  'header',
  'nav',
  'footer',
  'section',
  'article',
  'aside',
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'figure',
  'figcaption',
  'strong',
  'em',
  'small',
  'label',
  'form',
  'input',
  'textarea',
  'button',
  'a',
  'img',
  'hr',
  'br',
]);

function sanitizeGeneratedHtml(html: string) {
  const documentFragment = new DOMParser().parseFromString(html, 'text/html');

  for (const element of Array.from(documentFragment.body.querySelectorAll('*'))) {
    const tagName = element.tagName.toLowerCase();
    if (!allowedPreviewTags.has(tagName)) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const isGlobalAttribute =
        name === 'class' ||
        name === 'id' ||
        name === 'title' ||
        name === 'role' ||
        name.startsWith('aria-');
      const isInputAttribute =
        (tagName === 'input' || tagName === 'textarea') &&
        ['type', 'placeholder', 'value', 'rows', 'cols'].includes(name);
      const isImageAttribute =
        tagName === 'img' &&
        (name === 'alt' ||
          (name === 'src' && attribute.value.startsWith('data:image/')));

      if (!isGlobalAttribute && !isInputAttribute && !isImageAttribute) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) {
      element.disabled = true;
    }
    if (element instanceof HTMLTextAreaElement) {
      element.disabled = true;
    }
  }

  return documentFragment.body.innerHTML;
}

function buildPreviewDocument(page: GeneratedPage | null) {
  if (!page || typeof DOMParser === 'undefined') {
    return '';
  }

  const safeHtml = sanitizeGeneratedHtml(page.html);
  const safeCss = page.css.replace(/<\/style/gi, '<\\/style');
  const csp = [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "font-src 'none'",
    "connect-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${safeCss}</style></head><body>${safeHtml}</body></html>`;
}

async function postJson<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw new Error('服务器返回了无法解析的结果。');
  }

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).error === 'string'
        ? (payload as Record<string, string>).error
        : '生成失败，请重试。';
    throw new Error(errorMessage);
  }

  return payload as T;
}

export default function Home() {
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop');
  const [outputView, setOutputView] = useState<OutputView>('preview');
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scene, setScene] = useState<ComponentScene | null>(null);
  const [generatedPage, setGeneratedPage] = useState<GeneratedPage | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const previewDocument = useMemo(
    () => buildPreviewDocument(generatedPage),
    [generatedPage],
  );
  const isGenerating = stage === 'recognizing' || stage === 'generating';

  async function generateWebsite(imageDataUrl: string) {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    setErrorMessage(null);
    setStage('recognizing');

    try {
      const recognition = await postJson<{ scene: ComponentScene }>(
        '/api/recognize',
        { imageDataUrl },
        controller.signal,
      );
      if (requestId !== requestSequence.current) return;

      setScene(recognition.scene);
      setStage('generating');

      const generation = await postJson<{ page: GeneratedPage }>(
        '/api/generate',
        { scene: recognition.scene },
        controller.signal,
      );
      if (requestId !== requestSequence.current) return;

      setGeneratedPage(generation.page);
      setOutputView('preview');
      setStage('success');
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestSequence.current) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : '生成失败，请重试。',
      );
      setStage('error');
    } finally {
      if (requestId === requestSequence.current) {
        activeRequest.current = null;
      }
    }
  }

  function handleExportError(message: string) {
    setErrorMessage(message);
    setStage('error');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="SketchSite home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SketchSite</span>
        </div>

        <div className={`status stage-${stage}`} aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {stageLabels[stage]}
        </div>

        <nav className="preview-sizes" aria-label="Preview size">
          {previewSizes.map((size) => (
            <button
              aria-pressed={previewSize === size.id}
              className={previewSize === size.id ? 'segment active' : 'segment'}
              key={size.id}
              onClick={() => setPreviewSize(size.id)}
              type="button"
            >
              {size.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="workspace" aria-label="SketchSite workspace">
        <DrawingWorkspace
          isGenerating={isGenerating}
          onExportError={handleExportError}
          onGenerate={generateWebsite}
        />

        <section className="panel preview-panel" aria-labelledby="preview-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Output</p>
              <h2 id="preview-heading">Generated website</h2>
            </div>
            <div className="view-tabs" aria-label="Output view">
              <button
                aria-pressed={outputView === 'preview'}
                className={outputView === 'preview' ? 'active' : ''}
                onClick={() => setOutputView('preview')}
                type="button"
              >
                Preview
              </button>
              <button
                aria-pressed={outputView === 'structure'}
                className={outputView === 'structure' ? 'active' : ''}
                disabled={!scene}
                onClick={() => setOutputView('structure')}
                type="button"
              >
                Structure
              </button>
              <button
                aria-pressed={outputView === 'code'}
                className={outputView === 'code' ? 'active' : ''}
                disabled={!generatedPage}
                onClick={() => setOutputView('code')}
                type="button"
              >
                Code
              </button>
            </div>
          </div>

          <div className="preview-stage">
            {outputView === 'preview' ? (
              <div className={`browser-frame preview-${previewSize}`}>
                <div className="browser-bar" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <div>your-site.local</div>
                </div>
                {generatedPage ? (
                  <iframe
                    className="website-preview"
                    referrerPolicy="no-referrer"
                    sandbox=""
                    srcDoc={previewDocument}
                    title="Kimi generated website preview"
                  />
                ) : (
                  <div className="preview-empty">
                    <div className="spark" aria-hidden="true">✦</div>
                    <h2>Your website will appear here</h2>
                    <p>
                      Draw a wireframe, then click Generate website. Kimi will
                      recognize its components before writing the page.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="output-document">
                <div className="output-document-heading">
                  <strong>
                    {outputView === 'structure'
                      ? 'Recognized component JSON'
                      : 'Generated HTML + CSS'}
                  </strong>
                  <span>
                    {outputView === 'structure'
                      ? `${scene?.components.length ?? 0} components`
                      : generatedPage?.style.name}
                  </span>
                </div>
                <pre>
                  {outputView === 'structure'
                    ? JSON.stringify(scene, null, 2)
                    : `<!-- HTML -->\n${generatedPage?.html ?? ''}\n\n/* CSS */\n${generatedPage?.css ?? ''}`}
                </pre>
              </div>
            )}
          </div>

          <footer className="panel-footer">
            <span>{generatedPage?.style.name ?? 'Style chosen by Kimi'}</span>
            <span>
              {scene
                ? `${scene.components.length} components recognized`
                : 'No components recognized'}
            </span>
          </footer>
        </section>
      </section>

      <aside className="inspector" aria-label="Generation status">
        <div>
          <p className="eyebrow">
            {generatedPage ? 'Selected style' : 'Pipeline'}
          </p>
          <h2>{generatedPage?.style.name ?? stageLabels[stage]}</h2>
        </div>
        <p
          className={errorMessage ? 'error-message' : undefined}
          role={errorMessage ? 'alert' : undefined}
        >
          {errorMessage ??
            generatedPage?.style.rationale ??
            'Kimi Vision reads the sketch into JSON, then Kimi Code chooses a style and writes static HTML/CSS.'}
        </p>
        {generatedPage ? (
          <div
            className="style-characteristics"
            aria-label="Generated style characteristics"
          >
            {generatedPage.style.characteristics.slice(0, 4).map((item) => (
              <span key={item}>{item}</span>
            ))}
            <small>{generatedPage.style.palette.join(' · ')}</small>
          </div>
        ) : (
          <div className="pipeline-steps" aria-label="Generation pipeline">
            <span className={scene ? 'complete' : ''}>1 · JSON</span>
            <span aria-hidden="true">→</span>
            <span className={generatedPage ? 'complete' : ''}>2 · HTML/CSS</span>
          </div>
        )}
      </aside>
    </main>
  );
}
