'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DrawingWorkspace from './DrawingWorkspace';
import { generateCss, generateReact } from './sketch/codegen';
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

type PreviewSize = 'desktop' | 'tablet' | 'mobile';
type OutputView = 'preview' | 'structure' | 'code';
type CodeView = 'react' | 'css';
type RecognitionStatus = 'idle' | 'analyzing' | 'ready';

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
  'button',
  'input',
  'image',
  'form',
  'footer',
]);

function GeneratedRows({
  node,
  insideForm,
  onNavigate,
  onSelect,
  selectedId,
}: {
  node: WebsiteNode;
  insideForm: boolean;
  onNavigate: (pageId: string) => void;
  onSelect: (node: WebsiteNode) => void;
  selectedId: string | null;
}) {
  const childById = new Map(node.children.map((child) => [child.id, child]));
  const rows = node.childRows ?? node.children.map((child) => [child.id]);
  if (rows.length === 0) return null;

  return (
    <div className="generated-mixed-layout">
      {rows.map((row, index) => (
        <div
          className={row.length > 1 ? 'generated-spatial-row' : 'generated-spatial-row single'}
          key={`${node.id}-row-${index}`}
        >
          {row.map((childId) => {
            const child = childById.get(childId);
            return child ? (
              <GeneratedNode
                insideForm={insideForm}
                key={child.id}
                node={child}
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
  onNavigate,
  onSelect,
  selectedId,
}: {
  node: WebsiteNode;
  insideForm?: boolean;
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
      onNavigate={onNavigate}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  ));
  const groupedChildren = (
    <GeneratedRows
      insideForm={childIsInsideForm}
      node={node}
      onNavigate={onNavigate}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  );
  const editableClass = selectedId === node.id ? 'generated-editable selected' : 'generated-editable';
  const editableProps = {
    className: editableClass,
    onClick: () => onSelect(node),
    style: node.fontSize ? { fontSize: `${node.fontSize}px` } : undefined,
  };

  if (node.type === 'navbar') {
    return (
      <nav className="generated-nav">
        <strong>{node.content ?? 'Studio'}</strong>
        <div className="generated-nav-content">{groupedChildren}</div>
      </nav>
    );
  }
  if (node.type === 'hero') return <section className="generated-hero">{groupedChildren}</section>;
  if (node.type === 'section') return <section className="generated-section">{groupedChildren}</section>;
  if (node.type === 'cardGrid') {
    return <section className="generated-features"><div className="generated-card-grid">{directChildren}</div></section>;
  }
  if (node.type === 'card') {
    return (
      <article className="generated-card">
        {node.children.length > 0 ? groupedChildren : <><h2>{node.content ?? 'Feature'}</h2><p>Generated from your wireframe.</p></>}
      </article>
    );
  }
  if (node.type === 'heading') return <h1 {...editableProps}>{node.content ?? 'Your headline'}</h1>;
  if (node.type === 'paragraph') return <p {...editableProps}>{node.content ?? 'Your supporting copy.'}</p>;
  const nestedLabel = node.children
    .map((child) => child.content)
    .filter(Boolean)
    .join(' ');
  if (node.type === 'image') {
    return (
      <div
        aria-label={node.imageDataUrl ? 'Imported black and white image' : 'Generated visual placeholder'}
        className={node.imageDataUrl ? 'generated-image imported' : 'generated-image'}
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
        className={selectedId === node.id
          ? 'generated-button generated-editable selected'
          : 'generated-button generated-editable'}
        onClick={() => {
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
    return <label className="generated-field">{nestedLabel || node.content || 'Your details'}<input placeholder={nestedLabel || node.content} /></label>;
  }
  if (node.type === 'form') {
    return <form className="generated-form" onSubmit={(event) => event.preventDefault()}>{groupedChildren}</form>;
  }
  if (node.type === 'divider') {
    const orientation = node.orientation ?? (
      node.bounds.width >= node.bounds.height * CANVAS_PAGE_RATIO ? 'horizontal' : 'vertical'
    );
    return <div aria-orientation={orientation} className={`generated-divider ${orientation}`} role="separator" />;
  }
  if (node.type === 'footer') return <footer>{node.children.length > 0 ? groupedChildren : node.content}</footer>;
  return null;
}

function GeneratedPreview({
  onSelect,
  onNavigate,
  selectedId,
  site,
}: {
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
    <div className="generated-site-preview">
      <div className="generated-page-layout">
        <GeneratedRows
          insideForm={false}
          node={site.tree}
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
  codeView: CodeView;
  copiedLabel: string;
  cssCode: string;
  outputView: OutputView;
  previewSize: PreviewSize;
  primitives: RecognizedPrimitive[];
  reactCode: string;
  setCodeView: (view: CodeView) => void;
  setOutputView: (view: OutputView) => void;
  site: GeneratedWebsite;
  pages: Array<{ id: string; name: string; slug: string }>;
  onCopy: () => void;
  onCreateLinkedPage: (sourceId: string) => void;
  onElementEdit: (sourceId: string, patch: ElementCustomization) => void;
  onPageChange: (pageId: string) => void;
  onStructureOverride: (sourceIds: string[], type: StructureOverrideType | 'automatic') => void;
  onStructureParent: (primitiveId: string, parentId: string) => void;
  onStructureMove: (primitiveId: string, direction: -1 | 1) => void;
  layout: StructureLayout;
  overrides: StructureOverrides;
};

function OutputPanel({
  activePageId,
  codeView,
  copiedLabel,
  cssCode,
  onCopy,
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
  const selectedStructureNode = findStructureNode(site.tree, selectedSourceIds);
  const selectedPreviewNode = selectedPreviewSourceId
    ? findNodeBySourceId(site.tree, selectedPreviewSourceId)
    : null;
  const editablePreviewNode = selectedPreviewNode && ['heading', 'paragraph', 'button'].includes(selectedPreviewNode.type)
    ? selectedPreviewNode
    : null;
  const activePage = pages.find((page) => page.id === activePageId);
  const selectedOverride = selectedStructureNode?.sourcePrimitiveIds
    .map((id) => overrides[id])
    .find(Boolean);
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

  return (
    <section className="panel preview-panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Output</p>
          <h2 id="preview-heading">Live website</h2>
        </div>
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
      </div>

      {outputView === 'preview' && (
        <div className="preview-stage">
          <div className="live-content-editor">
            {editablePreviewNode && selectedPreviewSourceId ? (
              <>
                <label>
                  Text
                  <input
                    onChange={(event) => onElementEdit(selectedPreviewSourceId, { content: event.target.value })}
                    type="text"
                    value={editablePreviewNode.content ?? ''}
                  />
                </label>
                <label className="font-size-control">
                  Font size
                  <input
                    max="96"
                    min="8"
                    onChange={(event) => onElementEdit(selectedPreviewSourceId, { fontSize: Number(event.target.value) })}
                    type="number"
                    value={editablePreviewNode.fontSize ?? (editablePreviewNode.type === 'heading' ? 32 : 10)}
                  />
                </label>
                {editablePreviewNode.type === 'button' && (
                  <>
                    <label>
                      Link to page
                      <select
                        onChange={(event) => onElementEdit(selectedPreviewSourceId, { linkPageId: event.target.value })}
                        value={editablePreviewNode.linkPageId ?? ''}
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
                    {editablePreviewNode.linkPageId && (
                      <button onClick={() => onPageChange(editablePreviewNode.linkPageId!)} type="button">
                        Open linked page
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <p>Click a heading, paragraph, or button in the website to edit it.</p>
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
                      if (selectedPrimitiveId) onStructureParent(selectedPrimitiveId, event.target.value);
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
            </div>
            <button disabled={site.tree.children.length === 0} onClick={onCopy} type="button">
              {copiedLabel}
            </button>
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
  const recognitionRevision = useRef(0);
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];

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

    const timer = window.setTimeout(() => {
      const result = recognizeCanvas(activePage.canvasItems);
      if (recognitionRevision.current === revision) {
        setPages((current) => current.map((page) => (
          page.id === activePageId ? { ...page, primitives: result } : page
        )));
        setRecognitionStatus('ready');
      }
    }, 500);

    return () => window.clearTimeout(timer);
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
  const reactCode = useMemo(() => generateReact(generatedPages), [generatedPages]);
  const cssCode = useMemo(() => generateCss(), []);

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

  function handleStructureParent(primitiveId: string, parentId: string) {
    updateActivePage((page) => {
      const parentByPrimitiveId = { ...page.layout.parentByPrimitiveId };
      if (parentId === 'automatic') {
        delete parentByPrimitiveId[primitiveId];
      } else {
        parentByPrimitiveId[primitiveId] = parentId;
      }
      return { ...page, layout: { ...page.layout, parentByPrimitiveId } };
    });
  }

  function handleStructureMove(primitiveId: string, direction: -1 | 1) {
    const selectedNode = findStructureNode(site.tree, [primitiveId]);
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

  function recognizeNow() {
    recognitionRevision.current += 1;
    updateActivePage((page) => ({ ...page, primitives: recognizeCanvas(page.canvasItems) }));
    setRecognitionStatus(activePage.canvasItems.length > 0 ? 'ready' : 'idle');
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

  const confidentCount = activePage.primitives.filter(
    (primitive) => primitive.confidence >= 0.75,
  ).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="SketchSite home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SketchSite</span>
        </div>

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

      <section className="workspace" aria-label="SketchSite workspace">
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
          codeView={codeView}
          copiedLabel={copiedLabel}
          cssCode={cssCode}
          onCopy={copyCode}
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
        <p>
          {activePage.primitives.length > 0
            ? `${confidentCount} confident · ${activePage.primitives.length - confidentCount} need review`
            : 'Draw a few website elements, then pause for automatic recognition.'}
        </p>
        <button disabled={activePage.canvasItems.length === 0} onClick={recognizeNow} type="button">
          Recognize now
        </button>
      </aside>
    </main>
  );
}
