'use client';

/* eslint-disable @next/next/no-html-link-for-pages */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import DrawingWorkspace from './DrawingWorkspace';
import {
  buildExportStylesheet,
  buildHtmlDocument,
  downloadWebsiteZip,
  loadWebsiteExportDependencies,
} from './export-html';
import { generateCss, generateReact, generateStaticPages } from './sketch/codegen';
import type {
  CanvasItem,
  ElementCustomization,
  ElementCustomizations,
  GeneratedProjectPage,
  GeneratedWebsite,
  RecognizedPrimitive,
  StructureLayout,
  StructureOverrides,
  StructureOverrideType,
  WebsiteNode,
} from './sketch/model';
import { CANVAS_PAGE_RATIO } from './sketch/model';
import { inferWebsite, recognizeCanvas } from './sketch/recognition';
import { generateKimiCss } from './sketch/kimi-assist';

type PreviewSize = 'desktop' | 'tablet' | 'mobile';
type OutputView = 'preview' | 'structure' | 'code';
type CodeView = 'react' | 'css';
type RecognitionStatus = 'idle' | 'analyzing' | 'ready';
type CssGenerationStatus = 'idle' | 'generating' | 'ready' | 'error';

type ProjectPage = {
  id: string;
  name: string;
  slug: string;
  canvasItems: CanvasItem[];
  primitives: RecognizedPrimitive[];
  overrides: StructureOverrides;
  layout: StructureLayout;
  customizations: ElementCustomizations;
};

const emptyLayout = (): StructureLayout => ({
  parentByPrimitiveId: {},
  orderByParentId: {},
});

const createProjectPage = (index: number): ProjectPage => ({
  id: index === 1 ? 'page-home' : `page-${Date.now()}-${index}`,
  name: index === 1 ? 'Home' : `Page ${index}`,
  slug: index === 1 ? '' : `page-${index}`,
  canvasItems: [],
  primitives: [],
  overrides: {},
  layout: emptyLayout(),
  customizations: {},
});

const initialPage = createProjectPage(1);

const previewSizes: Array<{ id: PreviewSize; label: string }> = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
];

const outputViews: Array<{ id: OutputView; label: string }> = [
  { id: 'preview', label: 'Preview' },
  { id: 'structure', label: 'Structure' },
  { id: 'code', label: 'Code' },
];

const correctionTypes: Array<{ value: StructureOverrideType; label: string }> = [
  { value: 'navbar', label: 'Navbar' },
  { value: 'hero', label: 'Hero section' },
  { value: 'section', label: 'Section' },
  { value: 'cardGrid', label: 'Card grid' },
  { value: 'card', label: 'Card' },
  { value: 'heading', label: 'Heading' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'image', label: 'Image' },
  { value: 'button', label: 'Button' },
  { value: 'input', label: 'Input' },
  { value: 'form', label: 'Form' },
  { value: 'divider', label: 'Divider' },
  { value: 'footer', label: 'Footer' },
];

const containerTypes = new Set<WebsiteNode['type']>([
  'navbar',
  'hero',
  'section',
  'cardGrid',
  'card',
  'form',
  'footer',
]);

function generatedNodeClass(node: WebsiteNode, base: string, selectedId: string | null) {
  return [
    base,
    'generated-style-target',
    node.styleVariant === 'alternate' ? 'variant-alternate' : '',
    selectedId === node.id ? 'selected' : '',
  ].filter(Boolean).join(' ');
}

const previewLayoutLockCss = `
.generated-site-preview .generated-page-layout { display: block; width: 100%; max-width: 100%; min-height: 100%; overflow-x: hidden; }
.generated-site-preview .generated-nav { display: flex; width: 100%; max-width: 100%; height: 64px; max-height: 64px; align-items: center; flex-flow: row nowrap; gap: 18px; overflow: hidden; padding: 20px 5%; }
.generated-site-preview .generated-nav-content { display: flex; min-width: 0; max-width: 100%; align-items: center; flex-flow: row nowrap; gap: 12px; }
.generated-site-preview .generated-nav-content.nav-left { justify-content: flex-start; }
.generated-site-preview .generated-nav-content.nav-right { justify-content: flex-end; margin-left: auto; }
.generated-site-preview .generated-hero { display: grid; width: 100%; max-width: 100%; grid-template-columns: 1.05fr 0.95fr; align-items: center; gap: 8%; min-height: 310px; padding: 54px 7%; }
.generated-site-preview .generated-hero h1 { max-width: 11ch; margin: 0; font-size: clamp(26px, 4vw, 52px); line-height: 0.98; overflow-wrap: anywhere; }
.generated-site-preview .generated-section { display: flex; width: 100%; max-width: 100%; flex-wrap: wrap; align-items: center; gap: 18px; padding: 38px 7%; }
.generated-site-preview .generated-features { width: 100%; max-width: 100%; padding: 44px 7%; }
.generated-site-preview .generated-card-grid { display: grid; width: 100%; max-width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.generated-site-preview .generated-card { min-width: 0; max-width: 100%; padding: 18px; }
.generated-site-preview .generated-image { width: 100%; min-width: 0; max-width: 100%; min-height: 0; aspect-ratio: 16 / 9; flex: 1 1 0; overflow: hidden; background-position: center; background-repeat: no-repeat; background-size: contain; }
.generated-site-preview .generated-nav .generated-image { width: min(96px, 18vw); height: 32px; min-height: 0; max-height: 32px; aspect-ratio: auto; flex: 0 1 96px; }
.generated-site-preview .generated-button { display: inline-flex; min-width: 0; max-width: 100%; align-items: center; justify-content: center; padding: 9px 13px; overflow-wrap: anywhere; white-space: normal; }
.generated-site-preview .generated-form { display: grid; width: 100%; max-width: 100%; gap: 9px; padding: 38px 7%; }
.generated-site-preview .generated-field { display: grid; min-width: 0; max-width: 100%; gap: 5px; }
.generated-site-preview .generated-field input { width: 100%; max-width: 100%; min-height: 34px; padding: 0 9px; }
.generated-site-preview .generated-footer { display: flex; width: 100%; max-width: 100%; align-items: center; gap: 20px; padding: 24px 7%; }
.generated-site-preview .generated-mixed-layout { display: flex; width: 100%; max-width: 100%; flex-direction: column; gap: 14px; }
.generated-site-preview .generated-spatial-row { display: flex; width: 100%; max-width: 100%; flex-flow: row nowrap; align-items: center; gap: 18px; }
.generated-site-preview .generated-spatial-row.single { display: block; }
.generated-site-preview .generated-spatial-row:not(.single) > * { min-width: 0; max-width: 100%; flex: 1 1 0; }
.generated-site-preview .generated-spatial-row:not(.single) > .generated-button { width: 100%; }
.preview-viewport.tablet .generated-site-preview .generated-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.preview-viewport.mobile .generated-site-preview .generated-nav { height: 52px; max-height: 52px; gap: 8px; padding: 12px 4%; }
.preview-viewport.mobile .generated-site-preview .generated-nav-content { min-width: 0; max-width: 48%; overflow-x: auto; }
.preview-viewport.mobile .generated-site-preview .generated-nav-content .generated-mixed-layout { width: max-content; max-width: none; flex-direction: row; gap: 6px; }
.preview-viewport.mobile .generated-site-preview .generated-nav-content .generated-spatial-row { width: auto; flex: 0 0 auto; gap: 6px; }
.preview-viewport.mobile .generated-site-preview .generated-nav .generated-button { width: auto; max-width: 108px; flex: 0 1 auto; padding: 7px 8px; overflow: hidden; font-size: 7px; white-space: nowrap; }
.preview-viewport.mobile .generated-site-preview .generated-nav .generated-image { width: min(64px, 18vw); height: 28px; max-height: 28px; flex-basis: 64px; }
.preview-viewport.mobile .generated-site-preview .generated-hero { grid-template-columns: 1fr; gap: 28px; padding: 40px 8%; }
.preview-viewport.mobile .generated-site-preview .generated-card-grid { grid-template-columns: 1fr; }
.preview-viewport.mobile .generated-site-preview .generated-spatial-row:not(.single) { flex-wrap: wrap; }
`;

function scopeGeneratedCss(css: string) {
  const scopedSelectors = css
    .replaceAll(':root', '&')
    .replace(/(^|[,\s>+~])body\b(?=\s*[{,:.#>+~\[])/gm, '$1&');
  return `.generated-site-preview {\n${scopedSelectors}\n}\n${previewLayoutLockCss}`;
}

function GeneratedRows({
  node,
  insideForm,
  onImageSelect,
  onNavigate,
  onSelect,
  selectedId,
}: {
  node: WebsiteNode;
  insideForm: boolean;
  onImageSelect: (node: WebsiteNode) => void;
  onNavigate: (pageId: string) => void;
  onSelect: (node: WebsiteNode) => void;
  selectedId: string | null;
}) {
  const childById = new Map(node.children.map((child) => [child.id, child]));
  const rows = node.childRows ?? node.children.map((child) => [child.id]);
  if (rows.length === 0) return null;

  return (
    <div className="generated-mixed-layout mixed-layout">
      {rows.map((row, index) => (
        <div
          className={row.length > 1 ? 'generated-spatial-row spatial-row' : 'generated-spatial-row spatial-row single'}
          key={`${node.id}-row-${index}`}
        >
          {row.map((childId) => {
            const child = childById.get(childId);
            return child ? (
              <GeneratedNode
                insideForm={insideForm}
                key={child.id}
                node={child}
                onImageSelect={onImageSelect}
                onNavigate={onNavigate}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            ) : null;
          })}
        </div>
      ))}
    </div>
  );
}

function GeneratedNode({
  node,
  insideForm = false,
  onImageSelect,
  onNavigate,
  onSelect,
  selectedId,
}: {
  node: WebsiteNode;
  insideForm?: boolean;
  onImageSelect: (node: WebsiteNode) => void;
  onNavigate: (pageId: string) => void;
  onSelect: (node: WebsiteNode) => void;
  selectedId: string | null;
}) {
  const childIsInsideForm = insideForm || node.type === 'form';
  const directChildren = node.children.map((child) => (
    <GeneratedNode
      insideForm={childIsInsideForm}
      key={child.id}
      node={child}
      onImageSelect={onImageSelect}
      onNavigate={onNavigate}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  ));
  const groupedChildren = (
    <GeneratedRows
      insideForm={childIsInsideForm}
      node={node}
      onImageSelect={onImageSelect}
      onNavigate={onNavigate}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  );
  const selectNode = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation();
    onSelect(node);
  };
  const editableProps = {
    className: `${generatedNodeClass(node, 'generated-editable', selectedId)}`,
    onClick: selectNode,
    style: node.fontSize ? { fontSize: `${node.fontSize}px` } : undefined,
  };

  if (node.type === 'navbar') {
    const navbarMidpoint = node.bounds.x + node.bounds.width / 2;
    const orderedChildren = [...node.children].sort(
      (first, second) => first.bounds.x - second.bounds.x || first.bounds.y - second.bounds.y,
    );
    const leftChildren = orderedChildren.filter(
      (child) => child.bounds.x + child.bounds.width / 2 < navbarMidpoint,
    );
    const rightChildren = orderedChildren.filter(
      (child) => child.bounds.x + child.bounds.width / 2 >= navbarMidpoint,
    );
    const renderNavbarChildren = (children: WebsiteNode[]) => children.map((child) => (
      <GeneratedNode
        insideForm={childIsInsideForm}
        key={child.id}
        node={child}
        onImageSelect={onImageSelect}
        onNavigate={onNavigate}
        onSelect={onSelect}
        selectedId={selectedId}
      />
    ));
    return (
      <nav className={generatedNodeClass(node, 'generated-nav site-nav', selectedId)} onClick={selectNode}>
        <div className="generated-nav-content nav-content nav-left">
          {node.content && <strong className="brand" onClick={selectNode} style={node.fontSize ? { fontSize: `${node.fontSize}px` } : undefined}>{node.content}</strong>}
          {renderNavbarChildren(leftChildren)}
        </div>
        <div className="generated-nav-content nav-content nav-right">
          {renderNavbarChildren(rightChildren)}
        </div>
      </nav>
    );
  }
  if (node.type === 'hero') return <section className={generatedNodeClass(node, 'generated-hero hero', selectedId)} onClick={selectNode}>{groupedChildren}</section>;
  if (node.type === 'section') return <section className={generatedNodeClass(node, 'generated-section section', selectedId)} onClick={selectNode}>{groupedChildren}</section>;
  if (node.type === 'cardGrid') {
    return <section className={generatedNodeClass(node, 'generated-features features', selectedId)} onClick={selectNode}><div className="generated-card-grid card-grid">{directChildren}</div></section>;
  }
  if (node.type === 'card') {
    return (
      <article className={generatedNodeClass(node, 'generated-card card', selectedId)} onClick={selectNode}>
        {node.children.length > 0 ? groupedChildren : <><h2>{node.content ?? 'Feature'}</h2><p>Generated from your wireframe.</p></>}
      </article>
    );
  }
  if (node.type === 'heading') return <h1 {...editableProps} className={`${editableProps.className} site-heading`}>{node.content ?? 'Your headline'}</h1>;
  if (node.type === 'paragraph') return <p {...editableProps} className={`${editableProps.className} site-paragraph`}>{node.content ?? 'Your supporting copy.'}</p>;
  const nestedLabel = node.children
    .map((child) => child.content)
    .filter(Boolean)
    .join(' ');
  if (node.type === 'image') {
    return (
      <div
        aria-label={node.imageDataUrl ? 'Imported image' : 'Generated visual placeholder'}
        className={generatedNodeClass(node, node.imageDataUrl ? 'generated-image site-image imported' : 'generated-image site-image', selectedId)}
        onClick={(event) => {
          selectNode(event);
          onImageSelect(node);
        }}
        role="img"
        style={node.imageDataUrl ? { backgroundImage: `url(${node.imageDataUrl})` } : undefined}
      >
        {!node.imageDataUrl && <span>Image</span>}
      </div>
    );
  }
  if (node.type === 'button') {
    const label = node.content || nestedLabel || 'Get started';
    return (
      <button
        className={generatedNodeClass(node, 'generated-button generated-editable primary-button', selectedId)}
        onClick={(event) => {
          event.stopPropagation();
          if (node.linkPageId && selectedId === node.id) {
            onNavigate(node.linkPageId);
          } else {
            onSelect(node);
          }
        }}
        style={node.fontSize ? { fontSize: `${node.fontSize}px` } : undefined}
        title={node.linkPageId && selectedId === node.id ? 'Open linked page' : 'Edit button'}
        type="button"
      >
        {label}
      </button>
    );
  }
  if (node.type === 'input') {
    return <label className={generatedNodeClass(node, 'generated-field field', selectedId)} onClick={selectNode}>{nestedLabel || node.content || 'Your details'}<input placeholder={nestedLabel || node.content} /></label>;
  }
  if (node.type === 'form') {
    return <form className={generatedNodeClass(node, 'generated-form contact-form', selectedId)} onClick={selectNode} onSubmit={(event) => event.preventDefault()}>{groupedChildren}</form>;
  }
  if (node.type === 'divider') {
    const orientation = node.orientation ?? (
      node.bounds.width >= node.bounds.height * CANVAS_PAGE_RATIO ? 'horizontal' : 'vertical'
    );
    return <div aria-orientation={orientation} className={generatedNodeClass(node, `generated-divider divider divider-${orientation} ${orientation}`, selectedId)} onClick={selectNode} role="separator" />;
  }
  if (node.type === 'footer') return <footer className={generatedNodeClass(node, 'generated-footer site-footer', selectedId)} onClick={selectNode}>{node.children.length > 0 ? groupedChildren : node.content}</footer>;
  return null;
}

function GeneratedPreview({
  customCss,
  onImageSelect,
  onSelect,
  onNavigate,
  selectedId,
  site,
}: {
  customCss: string | null;
  onImageSelect: (node: WebsiteNode) => void;
  onSelect: (node: WebsiteNode) => void;
  onNavigate: (pageId: string) => void;
  selectedId: string | null;
  site: GeneratedWebsite;
}) {
  const hasContent = site.tree.children.length > 0;

  if (!hasContent) {
    return (
      <div className="preview-empty">
        <div className="spark" aria-hidden="true">✦</div>
        <h2>Your website will appear here</h2>
        <p>
          Draw a frame, text line, button, input, or image placeholder to start
          generating a page.
        </p>
      </div>
    );
  }

  return (
    <div className="generated-site-preview" id="geometric-export-root">
      {customCss && <style>{scopeGeneratedCss(customCss)}</style>}
      <div className="generated-page-layout site">
        <GeneratedRows
          insideForm={false}
          node={site.tree}
          onImageSelect={onImageSelect}
          onNavigate={onNavigate}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      </div>
    </div>
  );
}

function StructureBranch({
  node,
  onSelect,
  overrides,
  selectedSourceIds,
}: {
  node: WebsiteNode;
  onSelect: (node: WebsiteNode) => void;
  overrides: StructureOverrides;
  selectedSourceIds: string[];
}) {
  const editable = node.type !== 'page' && node.sourcePrimitiveIds.length > 0;
  const manuallyCorrected = node.sourcePrimitiveIds.some((id) => overrides[id]);
  const selected =
    editable &&
    selectedSourceIds.length === node.sourcePrimitiveIds.length &&
    selectedSourceIds.every((id) => node.sourcePrimitiveIds.includes(id));

  return (
    <li>
      <button
        aria-pressed={selected}
        className={selected ? 'structure-node selected' : 'structure-node'}
        disabled={!editable}
        onClick={() => editable && onSelect(node)}
        type="button"
      >
        <span>{node.type}</span>
        <small>{manuallyCorrected ? 'Manual' : `${Math.round(node.confidence * 100)}%`}</small>
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <StructureBranch
              key={child.id}
              node={child}
              onSelect={onSelect}
              overrides={overrides}
              selectedSourceIds={selectedSourceIds}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function findStructureNode(node: WebsiteNode, sourceIds: string[]): WebsiteNode | null {
  for (const child of node.children) {
    const match = findStructureNode(child, sourceIds);
    if (match) return match;
  }

  const sameSources =
    node.type !== 'page' &&
    sourceIds.length === node.sourcePrimitiveIds.length &&
    sourceIds.every((id) => node.sourcePrimitiveIds.includes(id));
  return sameSources ? node : null;
}

function findNodeBySourceId(node: WebsiteNode, sourceId: string): WebsiteNode | null {
  if (node.sourcePrimitiveIds.includes(sourceId) && node.type !== 'page') return node;
  for (const child of node.children) {
    const match = findNodeBySourceId(child, sourceId);
    if (match) return match;
  }
  return null;
}

function findParentNode(node: WebsiteNode, childId: string): WebsiteNode | null {
  if (node.children.some((child) => child.id === childId)) return node;
  for (const child of node.children) {
    const match = findParentNode(child, childId);
    if (match) return match;
  }
  return null;
}

function flattenStructure(node: WebsiteNode): WebsiteNode[] {
  return [node, ...node.children.flatMap(flattenStructure)];
}

function descendantIds(node: WebsiteNode) {
  return new Set(node.children.flatMap((child) => flattenStructure(child).map((item) => item.id)));
}

type OutputPanelProps = {
  activePageId: string;
  canExport: boolean;
  codeView: CodeView;
  copiedLabel: string;
  cssCode: string;
  cssLabel: string;
  customCss: string | null;
  outputView: OutputView;
  previewSize: PreviewSize;
  primitives: RecognizedPrimitive[];
  reactCode: string;
  setCodeView: (view: CodeView) => void;
  setOutputView: (view: OutputView) => void;
  site: GeneratedWebsite;
  pages: Array<{ id: string; name: string; slug: string }>;
  onCopy: () => void;
  onExport: () => void;
  onCreateLinkedPage: (sourceId: string) => void;
  onElementEdit: (sourceId: string, patch: ElementCustomization) => void;
  onPageChange: (pageId: string) => void;
  onStructureOverride: (sourceIds: string[], type: StructureOverrideType | 'automatic') => void;
  onStructureParent: (primitiveIds: string[], parentId: string) => void;
  onStructureMove: (primitiveId: string, direction: -1 | 1) => void;
  layout: StructureLayout;
  overrides: StructureOverrides;
};

function OutputPanel({
  activePageId,
  canExport,
  codeView,
  copiedLabel,
  cssCode,
  cssLabel,
  customCss,
  onCopy,
  onExport,
  onCreateLinkedPage,
  onElementEdit,
  onPageChange,
  onStructureOverride,
  onStructureParent,
  onStructureMove,
  outputView,
  pages,
  previewSize,
  primitives,
  layout,
  overrides,
  reactCode,
  setCodeView,
  setOutputView,
  site,
}: OutputPanelProps) {
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectedPreviewSourceId, setSelectedPreviewSourceId] = useState<string | null>(null);
  const previewImageInputRef = useRef<HTMLInputElement>(null);
  const previewImageSourceIdRef = useRef<string | null>(null);
  const selectedStructureNode = findStructureNode(site.tree, selectedSourceIds);
  const selectedPreviewNode = selectedPreviewSourceId
    ? findNodeBySourceId(site.tree, selectedPreviewSourceId)
    : null;
  const contentEditable = selectedPreviewNode
    ? ['navbar', 'heading', 'paragraph', 'button', 'card', 'footer'].includes(selectedPreviewNode.type)
    : false;
  const fontSizeEditable = selectedPreviewNode
    ? ['navbar', 'heading', 'paragraph', 'button'].includes(selectedPreviewNode.type)
    : false;
  const activePage = pages.find((page) => page.id === activePageId);
  const selectedOverride = selectedStructureNode?.sourcePrimitiveIds
    .map((id) => overrides[id])
    .find((type) => type === selectedStructureNode.type);
  const selectedPrimitiveId = selectedStructureNode?.sourcePrimitiveIds[0];
  const currentParent = selectedStructureNode
    ? findParentNode(site.tree, selectedStructureNode.id)
    : null;
  const currentSiblingIndex = currentParent && selectedStructureNode
    ? currentParent.children.findIndex((child) => child.id === selectedStructureNode.id)
    : -1;
  const excludedParentIds = selectedStructureNode
    ? new Set([selectedStructureNode.id, ...descendantIds(selectedStructureNode)])
    : new Set<string>();
  const parentOptions = flattenStructure(site.tree).filter(
    (node) =>
      (node.type === 'page' || containerTypes.has(node.type)) &&
      !excludedParentIds.has(node.id),
  );
  const manualParentId = selectedPrimitiveId
    ? layout.parentByPrimitiveId[selectedPrimitiveId]
    : undefined;
  const parentSelection = manualParentId && parentOptions.some((node) => node.id === manualParentId)
    ? manualParentId
    : 'automatic';

  function choosePreviewImage(node: WebsiteNode) {
    const sourceId = node.sourcePrimitiveIds[0];
    if (!sourceId) return;
    previewImageSourceIdRef.current = sourceId;
    previewImageInputRef.current?.click();
  }

  async function replacePreviewImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const sourceId = previewImageSourceIdRef.current;
    if (!file || !sourceId) return;

    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => (
          typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image'))
        ));
        reader.addEventListener('error', () => reject(reader.error));
        reader.readAsDataURL(file);
      });
      onElementEdit(sourceId, { imageDataUrl });
    } catch {
      // Keep the current image when the selected file cannot be read.
    } finally {
      input.value = '';
    }
  }

  return (
    <section className="panel preview-panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Output</p>
          <h2 id="preview-heading">Live website</h2>
        </div>
        <div className="panel-heading-actions">
          <div className="view-tabs" aria-label="Output view">
            {outputViews.map((view) => (
              <button
                aria-pressed={outputView === view.id}
                className={outputView === view.id ? 'active' : ''}
                key={view.id}
                onClick={() => setOutputView(view.id)}
                type="button"
              >
                {view.label}
              </button>
            ))}
          </div>
          <button
            className="export-button"
            disabled={!canExport}
            onClick={onExport}
            type="button"
          >
            Export ZIP
          </button>
        </div>
      </div>

      {outputView === 'preview' && (
        <div className="preview-stage">
          <input
            accept="image/*"
            hidden
            onChange={(event) => void replacePreviewImage(event)}
            ref={previewImageInputRef}
            type="file"
          />
          <div className="live-content-editor">
            {selectedPreviewNode && selectedPreviewSourceId ? (
              <>
                {contentEditable && (
                  <label>
                    {selectedPreviewNode.type === 'navbar' ? 'Navbar name' : 'Text'}
                    <input
                      onChange={(event) => onElementEdit(selectedPreviewSourceId, { content: event.target.value })}
                      type="text"
                      value={selectedPreviewNode.content ?? ''}
                    />
                  </label>
                )}
                {fontSizeEditable && (
                  <label className="font-size-control">
                    Font size
                    <input
                      max="96"
                      min="8"
                      onChange={(event) => onElementEdit(selectedPreviewSourceId, { fontSize: Number(event.target.value) })}
                      type="number"
                      value={selectedPreviewNode.fontSize ?? (selectedPreviewNode.type === 'heading' ? 32 : 10)}
                    />
                  </label>
                )}
                <label>
                  Style
                  <select
                    onChange={(event) => onElementEdit(selectedPreviewSourceId, { styleVariant: event.target.value as 'default' | 'alternate' })}
                    value={selectedPreviewNode.styleVariant ?? 'default'}
                  >
                    <option value="default">Default</option>
                    <option value="alternate">Alternate</option>
                  </select>
                </label>
                {selectedPreviewNode.type === 'image' && (
                  <button onClick={() => choosePreviewImage(selectedPreviewNode)} type="button">
                    Replace image
                  </button>
                )}
                {selectedPreviewNode.type === 'button' && (
                  <>
                    <label>
                      Link to page
                      <select
                        onChange={(event) => onElementEdit(selectedPreviewSourceId, { linkPageId: event.target.value })}
                        value={selectedPreviewNode.linkPageId ?? ''}
                      >
                        <option value="">No page link</option>
                        {pages.map((page) => (
                          <option key={page.id} value={page.id}>{page.name}</option>
                        ))}
                      </select>
                    </label>
                    <button onClick={() => onCreateLinkedPage(selectedPreviewSourceId)} type="button">
                      New linked page
                    </button>
                    {selectedPreviewNode.linkPageId && (
                      <button onClick={() => onPageChange(selectedPreviewNode.linkPageId!)} type="button">
                        Open linked page
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <p>Click any item in the website to edit its style and content.</p>
            )}
          </div>
          <div className={`preview-viewport ${previewSize}`}>
            <div className="browser-frame">
              <div className="browser-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <div>your-site.local/{activePage?.slug ?? ''}</div>
              </div>
              <GeneratedPreview
                customCss={customCss}
                onImageSelect={choosePreviewImage}
                onNavigate={onPageChange}
                onSelect={(node) => setSelectedPreviewSourceId(node.sourcePrimitiveIds[0] ?? null)}
                selectedId={selectedPreviewNode?.id ?? null}
                site={site}
              />
            </div>
          </div>
        </div>
      )}

      {outputView === 'structure' && (
        <div className="structure-stage">
          {site.tree.children.length > 0 ? (
            <div className="structure-layout">
              <div className="structure-editor">
                <div>
                  <p className="eyebrow">Selected element</p>
                  <h3>{selectedStructureNode ? selectedStructureNode.type : 'Choose an element'}</h3>
                  <p>
                    {selectedStructureNode
                      ? 'Change its type, place it inside another element, or adjust its order.'
                      : 'Click any element in the tree to edit its role and placement.'}
                  </p>
                </div>
                <label>
                  Element type
                  <select
                    disabled={!selectedStructureNode}
                    onChange={(event) => {
                      if (!selectedStructureNode) return;
                      onStructureOverride(
                        selectedStructureNode.sourcePrimitiveIds,
                        event.target.value as StructureOverrideType | 'automatic',
                      );
                    }}
                    value={selectedOverride ?? 'automatic'}
                  >
                    <option value="automatic">Automatic ({selectedStructureNode?.type ?? 'detected type'})</option>
                    {correctionTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Place inside
                  <select
                    disabled={!selectedPrimitiveId}
                    onChange={(event) => {
                      if (selectedStructureNode) {
                        onStructureParent(
                          selectedStructureNode.sourcePrimitiveIds,
                          event.target.value,
                        );
                      }
                    }}
                    value={parentSelection}
                  >
                    <option value="automatic">Automatic ({currentParent?.type ?? 'page'})</option>
                    {parentOptions.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.type === 'page' ? 'Page (top level)' : `${parent.type} · ${parent.content ?? 'element'}`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="structure-order" aria-label="Element order">
                  <button
                    disabled={!selectedPrimitiveId || currentSiblingIndex <= 0}
                    onClick={() => selectedPrimitiveId && onStructureMove(selectedPrimitiveId, -1)}
                    type="button"
                  >
                    Move up
                  </button>
                  <button
                    disabled={!selectedPrimitiveId || !currentParent || currentSiblingIndex >= currentParent.children.length - 1}
                    onClick={() => selectedPrimitiveId && onStructureMove(selectedPrimitiveId, 1)}
                    type="button"
                  >
                    Move down
                  </button>
                </div>
              </div>
              <ul className="structure-tree">
                <StructureBranch
                  node={site.tree}
                  onSelect={(node) => setSelectedSourceIds(node.sourcePrimitiveIds)}
                  overrides={overrides}
                  selectedSourceIds={selectedSourceIds}
                />
              </ul>
            </div>
          ) : (
            <div className="preview-empty compact">
              <h2>No structure yet</h2>
              <p>Recognized sections will appear here as a semantic tree.</p>
            </div>
          )}
        </div>
      )}

      {outputView === 'code' && (
        <div className="code-stage">
          <div className="code-toolbar">
            <div>
              <button
                className={codeView === 'react' ? 'active' : ''}
                onClick={() => setCodeView('react')}
                type="button"
              >
                React
              </button>
              <button
                className={codeView === 'css' ? 'active' : ''}
                onClick={() => setCodeView('css')}
                type="button"
              >
                CSS
              </button>
              {codeView === 'css' && <span className="css-source-badge">{cssLabel}</span>}
            </div>
            <div>
              <button disabled={site.tree.children.length === 0} onClick={onCopy} type="button">
                {copiedLabel}
              </button>
            </div>
          </div>
          <pre>
            <code>{codeView === 'react' ? reactCode : cssCode}</code>
          </pre>
        </div>
      )}

      <footer className="panel-footer">
        <span>Modern SaaS</span>
        <span>
          {primitives.length} {primitives.length === 1 ? 'element' : 'elements'} recognized
        </span>
      </footer>
    </section>
  );
}

export default function SketchSiteApp() {
  const [pages, setPages] = useState<ProjectPage[]>([initialPage]);
  const [activePageId, setActivePageId] = useState(initialPage.id);
  const [recognitionStatus, setRecognitionStatus] =
    useState<RecognitionStatus>('idle');
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop');
  const [outputView, setOutputView] = useState<OutputView>('preview');
  const [codeView, setCodeView] = useState<CodeView>('react');
  const [copiedLabel, setCopiedLabel] = useState('Copy code');
  const [designPrompt, setDesignPrompt] = useState('');
  const [kimiCss, setKimiCss] = useState<string | null>(null);
  const [cssGenerationError, setCssGenerationError] = useState<string | null>(null);
  const [cssGenerationStatus, setCssGenerationStatus] =
    useState<CssGenerationStatus>('idle');
  const recognitionRevision = useRef(0);
  const cssGenerationAbort = useRef<AbortController | null>(null);
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const originalCss = useMemo(() => generateCss(), []);

  function updateActivePage(updater: (page: ProjectPage) => ProjectPage) {
    setPages((current) => current.map((page) => (
      page.id === activePageId ? updater(page) : page
    )));
  }

  useEffect(() => {
    const revision = recognitionRevision.current + 1;
    recognitionRevision.current = revision;

    if (activePage.canvasItems.length === 0) {
      return;
    }

    const pageId = activePage.id;
    const canvasItems = activePage.canvasItems;
    const timer = window.setTimeout(() => {
      const primitives = recognizeCanvas(canvasItems);
      if (recognitionRevision.current !== revision) return;
      setPages((current) => current.map((page) => (
        page.id === pageId ? { ...page, primitives } : page
      )));
      setRecognitionStatus('ready');
    }, 500);

    return () => window.clearTimeout(timer);
    // Recognition should restart only for a canvas or page change, not for its own result updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage.canvasItems, activePageId]);

  const generatedPages = useMemo<GeneratedProjectPage[]>(
    () => pages.map((page) => ({
      id: page.id,
      name: page.name,
      slug: page.slug,
      site: inferWebsite(page.primitives, page.overrides, page.layout, page.customizations),
    })),
    [pages],
  );
  const site = generatedPages.find((page) => page.id === activePageId)?.site ?? generatedPages[0].site;
  const canExport = generatedPages.some((page) => page.site.tree.children.length > 0);
  const reactCode = useMemo(() => generateReact(generatedPages), [generatedPages]);
  const cssCode = kimiCss ?? originalCss;
  const cssLabel = kimiCss ? 'Kimi CSS active' : 'Original CSS';

  function handleCanvasItemsChange(nextItems: CanvasItem[]) {
    updateActivePage((page) => ({
      ...page,
      canvasItems: nextItems,
      ...(nextItems.length === 0
        ? { primitives: [], overrides: {}, layout: emptyLayout(), customizations: {} }
        : {}),
    }));
    setRecognitionStatus(nextItems.length > 0 ? 'analyzing' : 'idle');
    if (nextItems.length === 0) {
      recognitionRevision.current += 1;
    }
  }

  function handlePageChange(pageId: string) {
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return;
    recognitionRevision.current += 1;
    setActivePageId(pageId);
    setRecognitionStatus(page.canvasItems.length === 0 ? 'idle' : page.primitives.length > 0 ? 'ready' : 'analyzing');
  }

  function handleElementEdit(sourceId: string, patch: ElementCustomization) {
    updateActivePage((page) => ({
      ...page,
      customizations: {
        ...page.customizations,
        [sourceId]: { ...page.customizations[sourceId], ...patch },
      },
    }));
  }

  function handleCreateLinkedPage(sourceId: string) {
    const nextPage = createProjectPage(pages.length + 1);
    setPages((current) => [
      ...current.map((page) => page.id === activePageId
        ? {
            ...page,
            customizations: {
              ...page.customizations,
              [sourceId]: { ...page.customizations[sourceId], linkPageId: nextPage.id },
            },
          }
        : page),
      nextPage,
    ]);
    recognitionRevision.current += 1;
    setActivePageId(nextPage.id);
    setRecognitionStatus('idle');
  }

  function handleStructureParent(primitiveIds: string[], parentId: string) {
    updateActivePage((page) => {
      const parentByPrimitiveId = { ...page.layout.parentByPrimitiveId };
      primitiveIds.forEach((primitiveId) => {
        if (parentId === 'automatic') {
          delete parentByPrimitiveId[primitiveId];
        } else {
          parentByPrimitiveId[primitiveId] = parentId;
        }
      });
      return { ...page, layout: { ...page.layout, parentByPrimitiveId } };
    });
  }

  function handleStructureMove(primitiveId: string, direction: -1 | 1) {
    const selectedNode = findNodeBySourceId(site.tree, primitiveId);
    if (!selectedNode) return;
    const parent = findParentNode(site.tree, selectedNode.id);
    if (!parent) return;
    const siblingIds = parent.children.map((child) => child.sourcePrimitiveIds[0]);
    const index = siblingIds.indexOf(primitiveId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblingIds.length) return;
    [siblingIds[index], siblingIds[targetIndex]] = [siblingIds[targetIndex], siblingIds[index]];
    updateActivePage((page) => ({
      ...page,
      layout: {
        ...page.layout,
        orderByParentId: { ...page.layout.orderByParentId, [parent.id]: siblingIds },
      },
    }));
  }

  function handleStructureOverride(
    sourceIds: string[],
    type: StructureOverrideType | 'automatic',
  ) {
    updateActivePage((page) => {
      const next = { ...page.overrides };
      sourceIds.forEach((sourceId) => {
        if (type === 'automatic') {
          delete next[sourceId];
        } else {
          next[sourceId] = type;
        }
      });
      return { ...page, overrides: next };
    });
  }

  async function handleGenerateCss() {
    const brief = designPrompt.trim();
    if (brief.length < 3) return;
    cssGenerationAbort.current?.abort();
    const controller = new AbortController();
    cssGenerationAbort.current = controller;
    setCssGenerationError(null);
    setCssGenerationStatus('generating');
    try {
      const nextCss = await generateKimiCss(
        generatedPages,
        originalCss,
        brief,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setKimiCss(nextCss);
      setCssGenerationStatus('ready');
      setCodeView('css');
    } catch (error) {
      if (!controller.signal.aborted) {
        setCssGenerationError(
          error instanceof Error ? error.message : 'Kimi CSS generation failed.',
        );
        setCssGenerationStatus('error');
      }
    }
  }

  function handleResetCss() {
    cssGenerationAbort.current?.abort();
    setKimiCss(null);
    setCssGenerationError(null);
    setCssGenerationStatus('idle');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeView === 'react' ? reactCode : cssCode);
      setCopiedLabel('Copied');
      window.setTimeout(() => setCopiedLabel('Copy code'), 1400);
    } catch {
      setCopiedLabel('Copy failed');
    }
  }

  async function exportWebsite() {
    const staticPages = generateStaticPages(generatedPages);
    if (!canExport || staticPages.length === 0) return;
    try {
      const dependencies = await loadWebsiteExportDependencies();
      await downloadWebsiteZip('sketchly-website.zip', [
        ...staticPages.map((page) => ({
          name: page.filename,
          content: buildHtmlDocument(page.name, page.bodyHtml),
        })),
        {
          name: 'styles.css',
          content: buildExportStylesheet(cssCode, kimiCss ? originalCss : undefined),
        },
        ...dependencies,
        {
          name: 'README.txt',
          content: 'Sketchly website export\n\nOpen index.html in a browser. Linked buttons use the other HTML files in this folder. All required styles and fonts are included, so no install step is needed.',
        },
      ]);
    } catch {
      setCssGenerationError('Could not create the website ZIP. Please try again.');
      setCssGenerationStatus('error');
    }
  }

  const confidentCount = activePage.primitives.filter(
    (primitive) => primitive.confidence >= 0.75,
  ).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Sketchly home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-title">Sketchly</span>
          <span className="brand-mode">Realtime Mode</span>
        </a>

        <div className={`status ${recognitionStatus}`} aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {recognitionStatus === 'analyzing'
            ? 'Analyzing sketch'
            : recognitionStatus === 'ready'
              ? 'Recognition ready'
              : 'Canvas ready'}
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
          items={activePage.canvasItems}
          onItemsChange={handleCanvasItemsChange}
          onPageChange={handlePageChange}
          pageId={activePageId}
          pages={pages.map(({ id, name }) => ({ id, name }))}
          recognizedPrimitives={activePage.primitives}
        />
        <OutputPanel
          activePageId={activePageId}
          canExport={canExport}
          codeView={codeView}
          copiedLabel={copiedLabel}
          cssCode={cssCode}
          cssLabel={cssLabel}
          customCss={kimiCss}
          onCopy={copyCode}
          onExport={exportWebsite}
          onCreateLinkedPage={handleCreateLinkedPage}
          onElementEdit={handleElementEdit}
          onPageChange={handlePageChange}
          onStructureOverride={handleStructureOverride}
          onStructureParent={handleStructureParent}
          onStructureMove={handleStructureMove}
          outputView={outputView}
          pages={pages.map(({ id, name, slug }) => ({ id, name, slug }))}
          previewSize={previewSize}
          primitives={activePage.primitives}
          layout={activePage.layout}
          overrides={activePage.overrides}
          reactCode={reactCode}
          setCodeView={setCodeView}
          setOutputView={setOutputView}
          site={site}
        />
      </section>

      <aside className="inspector" aria-label="Recognition summary">
        <div>
          <p className="eyebrow">Recognition</p>
          <h2>
            {activePage.primitives.length > 0
              ? `${activePage.primitives.length} elements found`
              : 'Nothing recognized yet'}
          </h2>
        </div>
        <div className="realtime-inspector-copy">
          <p className={cssGenerationStatus === 'error' ? 'error-message' : undefined} aria-live="polite">
            {cssGenerationStatus === 'generating'
              ? 'Generating complete CSS · may take up to a minute…'
              : cssGenerationStatus === 'ready'
                ? 'Kimi CSS applied'
                : cssGenerationStatus === 'error'
                  ? cssGenerationError ?? 'Could not generate · current CSS kept'
                  : activePage.primitives.length > 0
                    ? `${confidentCount} confident · ${activePage.primitives.length - confidentCount} need review`
                    : 'Draw a few website elements, then pause for automatic recognition.'}
          </p>
          <form
            className="realtime-theme-control"
            onSubmit={(event) => {
              event.preventDefault();
              void handleGenerateCss();
            }}
          >
            <label>
              <span>Theme</span>
              <input
                disabled={cssGenerationStatus === 'generating'}
                maxLength={2000}
                onChange={(event) => setDesignPrompt(event.target.value)}
                placeholder="e.g. warm editorial, dark sci-fi, playful pastel"
                type="text"
                value={designPrompt}
              />
            </label>
            <button
              disabled={designPrompt.trim().length < 3 || cssGenerationStatus === 'generating'}
              type="submit"
            >
              {cssGenerationStatus === 'generating' ? 'Generating…' : 'Apply theme'}
            </button>
            {kimiCss && (
              <button onClick={handleResetCss} type="button">Reset</button>
            )}
          </form>
        </div>
      </aside>
    </main>
  );
}
