import type { GeneratedProjectPage, WebsiteNode } from './model';

function collectVisibleText(node: WebsiteNode, values: string[]) {
  const value = node.content?.trim();
  if (value && !values.includes(value)) values.push(value);
  node.children.forEach((child) => collectVisibleText(child, values));
}

export function visibleProjectText(pages: GeneratedProjectPage[]) {
  const values: string[] = [];
  pages.forEach((page) => collectVisibleText(page.site.tree, values));
  return values.slice(0, 150);
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
      visibleText: visibleProjectText(pages),
    }),
    signal,
  });
  if (!response.ok) throw new Error('Kimi CSS generation unavailable');
  const result = await response.json() as { css?: unknown };
  if (typeof result.css !== 'string') throw new Error('Kimi returned invalid CSS');
  return result.css;
}
