'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  validateComponentScene,
  validateGeneratedPage,
  type ComponentDelta,
  type ComponentScene,
  type GeneratedPage,
} from '@/lib/contracts';
import DrawingWorkspace from './AiDrawingWorkspace';
import {
  buildExportStylesheet,
  buildHtmlDocument,
  downloadWebsiteZip,
  loadWebsiteExportDependencies,
} from '../export-html';

const previewSizes = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
] as const;

const stageLabels = {
  idle: 'Generative ready',
  recognizing: 'Recognizing components',
  comparing: 'Comparing sketch changes',
  generating: 'Writing HTML & CSS',
  success: 'Preview ready',
  error: 'Needs attention',
} as const;

type GenerationStage = keyof typeof stageLabels;
type PreviewSize = (typeof previewSizes)[number]['id'];
type OutputView = 'preview' | 'structure' | 'code';

const OUTPUT_STORAGE_KEY = 'sketchsite-output-v1';
const PNG_DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

function replacesEntireTopic(
  previousScene: ComponentScene,
  changes: ComponentDelta,
) {
  const previousIds = previousScene.components
    .filter((component) => component.type !== 'page')
    .map((component) => component.id);
  const deletedIds = new Set(changes.deleted.map(({ id }) => id));
  return (
    changes.added.length > 0 &&
    previousIds.length > 0 &&
    previousIds.every((id) => deletedIds.has(id))
  );
}

function persistGeneration(
  scene: ComponentScene,
  page: GeneratedPage,
  imageDataUrl: string,
) {
  try {
    localStorage.setItem(
      OUTPUT_STORAGE_KEY,
      JSON.stringify({ schemaVersion: '1', scene, page, imageDataUrl }),
    );
    return true;
  } catch {
    return false;
  }
}

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
        name.startsWith('aria-') ||
        name === 'data-component-id';
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
    "font-src 'self'",
    "connect-src 'none'",
    "media-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const previewFontCss = "@font-face{font-family:'Sketchly Bukhari';src:url('/fonts/bukhari-script.woff') format('woff');font-style:normal;font-weight:400;font-display:swap}@font-face{font-family:'Bukhari';src:url('/fonts/bukhari-script.woff') format('woff');font-style:normal;font-weight:400;font-display:swap}@font-face{font-family:'Bukhari Script';src:url('/fonts/bukhari-script.woff') format('woff');font-style:normal;font-weight:400;font-display:swap}";
  const editorCss = '[data-component-id]{cursor:pointer}[data-component-id]:hover,[data-editor-selected]{outline:2px solid #3ba568!important;outline-offset:2px}';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${previewFontCss}\n${safeCss}\n${editorCss}</style></head><body>${safeHtml}</body></html>`;
}

function replaceGeneratedText(html: string, componentId: string, value: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const element = Array.from(parsed.body.querySelectorAll('[data-component-id]'))
    .find((candidate) => candidate.getAttribute('data-component-id') === componentId);
  if (!element) return null;
  if (element instanceof HTMLInputElement) {
    element.setAttribute('placeholder', value);
    element.setAttribute('value', value);
  } else if (element instanceof HTMLTextAreaElement) {
    element.setAttribute('placeholder', value);
    element.textContent = value;
  } else {
    element.textContent = value;
  }
  return parsed.body.innerHTML;
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
  const [lastChanges, setLastChanges] = useState<ComponentDelta | null>(null);
  const [lastSubmittedImage, setLastSubmittedImage] = useState<string | null>(
    null,
  );
  const [stylePrompt, setStylePrompt] = useState('');
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const previewDocument = useMemo(
    () => buildPreviewDocument(generatedPage),
    [generatedPage],
  );
  const isGenerating =
    stage === 'recognizing' ||
    stage === 'comparing' ||
    stage === 'generating';
  const canGenerateIncrementally = Boolean(
    lastSubmittedImage &&
    scene?.components.some((component) => component.type !== 'page') &&
    generatedPage,
  );

  useEffect(() => {
    const restoreFrame = window.requestAnimationFrame(() => {
      try {
        const storedOutput = localStorage.getItem(OUTPUT_STORAGE_KEY);
        if (storedOutput) {
          const value = JSON.parse(storedOutput) as unknown;
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const record = value as Record<string, unknown>;
            if (record.schemaVersion === '1') {
              const restoredScene = validateComponentScene(record.scene);
              const restoredPage = validateGeneratedPage(record.page);
              const restoredImage = record.imageDataUrl;
              if (
                typeof restoredImage === 'string' &&
                restoredImage.length <= 7_000_000 &&
                PNG_DATA_URL_PATTERN.test(restoredImage)
              ) {
                setScene(restoredScene);
                setGeneratedPage(restoredPage);
                setLastSubmittedImage(restoredImage);
                setStage('success');
              }
            }
          }
        }
      } catch {
        // Ignore invalid local data and start with a clean output state.
      }
    });

    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  async function generateWebsite(imageDataUrl: string) {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    setErrorMessage(null);
    const previousScene = scene;
    const previousPage = generatedPage;
    const previousImageDataUrl = lastSubmittedImage;
    const requestedStyle = stylePrompt.trim();
    const useIncrementalGeneration = Boolean(
      previousScene?.components.some((component) => component.type !== 'page') &&
      previousPage &&
      previousImageDataUrl,
    );

    setStage(useIncrementalGeneration ? 'comparing' : 'recognizing');

    try {
      const recognition = await postJson<
        | { mode: 'full'; scene: ComponentScene }
        | {
            mode: 'delta';
            scene: ComponentScene;
            changes: ComponentDelta;
          }
      >(
        '/api/recognize',
        useIncrementalGeneration
          ? {
              imageDataUrl,
              previousImageDataUrl,
              previousScene,
            }
          : { imageDataUrl },
        controller.signal,
      );
      if (requestId !== requestSequence.current) return;

      setStage('generating');

      if (
        recognition.mode === 'delta' &&
        recognition.changes.added.length === 0 &&
        recognition.changes.updated.length === 0 &&
        recognition.changes.deleted.length === 0 &&
        previousPage &&
        !requestedStyle
      ) {
        setScene(recognition.scene);
        setLastChanges(recognition.changes);
        setLastSubmittedImage(imageDataUrl);
        if (!persistGeneration(recognition.scene, previousPage, imageDataUrl)) {
          setErrorMessage(
            'No changes found, but the browser could not save this submission for refresh recovery.',
          );
        }
        setStage('success');
        return;
      }

      const generation = await postJson<{ page: GeneratedPage }>(
        '/api/generate',
        recognition.mode === 'delta' &&
        previousScene &&
        previousPage &&
        !replacesEntireTopic(previousScene, recognition.changes)
          ? {
              changes: recognition.changes,
              previousScene,
              previousPage,
              stylePrompt: requestedStyle,
            }
          : { scene: recognition.scene, stylePrompt: requestedStyle },
        controller.signal,
      );
      if (requestId !== requestSequence.current) return;

      setScene(recognition.scene);
      setGeneratedPage(generation.page);
      setSelectedComponentId(null);
      setSelectedText('');
      setLastChanges(
        recognition.mode === 'delta' ? recognition.changes : null,
      );
      setLastSubmittedImage(imageDataUrl);
      const persisted = persistGeneration(
        recognition.scene,
        generation.page,
        imageDataUrl,
      );
      if (!persisted) {
        setErrorMessage(
          'Website generated, but the browser could not save it for refresh recovery.',
        );
      }
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

  function resetProject() {
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setScene(null);
    setGeneratedPage(null);
    setLastChanges(null);
    setLastSubmittedImage(null);
    setStylePrompt('');
    setSelectedComponentId(null);
    setSelectedText('');
    setErrorMessage(null);
    setOutputView('preview');
    setStage('idle');
    try {
      localStorage.removeItem(OUTPUT_STORAGE_KEY);
    } catch {
      // The in-memory reset still succeeds when browser storage is unavailable.
    }
  }

  function handleGeneratedTextChange(value: string) {
    if (!generatedPage || !scene || !selectedComponentId) return;
    const html = replaceGeneratedText(generatedPage.html, selectedComponentId, value);
    if (!html) return;
    const nextPage = { ...generatedPage, html };
    const nextScene = {
      ...scene,
      components: scene.components.map((component) => (
        component.id === selectedComponentId ? { ...component, text: value } : component
      )),
    };
    setSelectedText(value);
    setGeneratedPage(nextPage);
    setScene(nextScene);
    if (lastSubmittedImage) persistGeneration(nextScene, nextPage, lastSubmittedImage);
  }

  async function exportWebsite() {
    if (!generatedPage) return;
    try {
      const dependencies = await loadWebsiteExportDependencies();
      await downloadWebsiteZip('sketchly-generative-website.zip', [
        {
          name: 'index.html',
          content: buildHtmlDocument('Sketchly generated website', generatedPage.html),
        },
        { name: 'styles.css', content: buildExportStylesheet(generatedPage.css) },
        ...dependencies,
        {
          name: 'README.txt',
          content: 'Sketchly generative website export\n\nOpen index.html in a browser. All required styles and fonts are included, so no install step is needed.',
        },
      ]);
    } catch {
      setErrorMessage('Could not create the website ZIP. Please try again.');
      setStage('error');
    }
  }

  return (
    <main className="app-shell generative-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Sketchly home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-title">Sketchly</span>
          <span className="brand-mode">Generative Mode</span>
        </Link>

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

      <section className="workspace" aria-label="Sketchly workspace">
        <DrawingWorkspace
          hasPreviousSubmission={canGenerateIncrementally}
          isGenerating={isGenerating}
          onClear={resetProject}
          onExportError={handleExportError}
          onGenerate={generateWebsite}
        />

        <section className="panel preview-panel" aria-labelledby="preview-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Output</p>
              <h2 id="preview-heading">Generated website</h2>
            </div>
            <div className="panel-heading-actions">
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
              <button
                className="export-button"
                disabled={!generatedPage}
                onClick={exportWebsite}
                type="button"
              >
                Export ZIP
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
                    sandbox="allow-same-origin"
                    onLoad={(event) => {
                      const document = event.currentTarget.contentDocument;
                      document?.addEventListener('click', (clickEvent) => {
                        const target = clickEvent.target as Element | null;
                        if (!target?.closest) return;
                        const component = target.closest('[data-component-id]');
                        const componentId = component?.getAttribute('data-component-id');
                        if (!component || !componentId) return;
                        document.querySelector('[data-editor-selected]')?.removeAttribute('data-editor-selected');
                        component.setAttribute('data-editor-selected', 'true');
                        setSelectedComponentId(componentId);
                        setSelectedText(
                          component.getAttribute('value') ??
                          component.getAttribute('placeholder') ??
                          component.textContent?.trim() ??
                          '',
                        );
                        clickEvent.preventDefault();
                      });
                    }}
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
                      ? lastChanges
                        ? 'Latest component changes'
                        : 'Recognized component JSON'
                      : 'Generated HTML + CSS'}
                  </strong>
                  <span>
                    {outputView === 'structure'
                      ? lastChanges
                        ? `+${lastChanges.added.length} ~${lastChanges.updated.length} −${lastChanges.deleted.length}`
                        : `${scene?.components.length ?? 0} components`
                      : generatedPage?.style.name}
                  </span>
                </div>
                <pre>
                  {outputView === 'structure'
                    ? JSON.stringify(lastChanges ?? scene, null, 2)
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
        <div className="inspector-copy">
          <p
            className={errorMessage ? 'error-message' : undefined}
            role={errorMessage ? 'alert' : undefined}
          >
            {errorMessage ??
              generatedPage?.style.rationale ??
              'Kimi Vision compares each submission with the last one, then Kimi Code updates only the added, changed, or deleted components.'}
          </p>
          <div className="inspector-controls">
            <label className="style-prompt">
              <span>Theme</span>
              <input
                disabled={isGenerating}
                maxLength={300}
                onChange={(event) => setStylePrompt(event.target.value)}
                placeholder="e.g. warm editorial, dark sci-fi, playful pastel"
                type="text"
                value={stylePrompt}
              />
            </label>
            {selectedComponentId && (
              <label className="ai-text-editor">
                <span>Edit text</span>
                <input
                  onChange={(event) => handleGeneratedTextChange(event.target.value)}
                  type="text"
                  value={selectedText}
                />
              </label>
            )}
          </div>
        </div>
      </aside>
    </main>
  );
}
