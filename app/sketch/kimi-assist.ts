import type { GeneratedProjectPage, WebsiteNode } from './model';

function collectVisibleText(node: WebsiteNode, values: string[]) {
  const value = node.content?.trim();
  if (value && !values.includes(value)) values.push(value);
  node.children.forEach((child) => collectVisibleText(child, values));
}

export function visibleProjectText(pages: GeneratedProjectPage[]) {
  const values: string[] = [];
  pages.forEach((page) => collectVisibleText(page.site.tree, values));
  return values.slice(0, 40);
}

function summarizeNode(node: WebsiteNode): unknown {
  return {
    id: node.id,
    type: node.type,
    layout: node.layout,
    bounds: node.bounds,
    childRows: node.childRows,
    children: node.children.map(summarizeNode),
  };
}

export function projectStructure(pages: GeneratedProjectPage[]) {
  return JSON.stringify({
    pages: pages.map((page) => ({
      name: page.name,
      slug: page.slug,
      structure: summarizeNode(page.site.tree),
    })),
  });
}

export async function generateKimiCss(
  pages: GeneratedProjectPage[],
  originalCss: string,
  designPrompt: string,
  signal: AbortSignal,
) {
  const response = await fetch('/api/kimi-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'css',
      designPrompt,
      originalCss,
      structure: projectStructure(pages),
      visibleText: visibleProjectText(pages),
    }),
    signal,
  });
  const result = await response.json() as { css?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(
      typeof result.error === 'string' ? result.error : 'Kimi CSS generation unavailable',
    );
  }
  if (typeof result.css !== 'string') throw new Error('Kimi returned invalid CSS');
  return result.css;
}
