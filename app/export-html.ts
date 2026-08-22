import JSZip from 'jszip';
import {
  buildGeneratedSiteFontCss,
  GENERATED_SITE_FONTS,
} from '@/lib/generated-fonts';

export type WebsiteExportFile = {
  name: string;
  content: string | Uint8Array;
};

const bundledExportAssets = [
  ...GENERATED_SITE_FONTS.map((font) => ({
    source: `/fonts/generated/${font.filename}`,
    name: `assets/fonts/${font.filename}`,
    binary: true,
  } as const)),
  {
    source: '/fonts/generated/OFL-1.1.txt',
    name: 'assets/fonts/OFL-1.1.txt',
    binary: false,
  },
  {
    source: '/fonts/generated/font-notices.txt',
    name: 'assets/fonts/FONT-NOTICES.txt',
    binary: false,
  },
] as const;

const bundledFontCss = `/* Fonts packaged with this export for offline use. */
${buildGeneratedSiteFontCss((filename) => `./assets/fonts/${filename}`)}`;

export function buildExportStylesheet(css: string, baseCss?: string) {
  const layers = baseCss && baseCss.trim() !== css.trim()
    ? `${baseCss.trim()}\n\n/* Generated visual theme overrides. */\n${css.trim()}`
    : css.trim();
  return `${bundledFontCss}\n\n${layers}\n`;
}

export async function loadWebsiteExportDependencies(): Promise<WebsiteExportFile[]> {
  return Promise.all(bundledExportAssets.map(async (asset) => {
    const response = await fetch(asset.source);
    if (!response.ok) {
      throw new Error(`Could not load export dependency: ${asset.name}`);
    }
    return {
      name: asset.name,
      content: asset.binary
        ? new Uint8Array(await response.arrayBuffer())
        : await response.text(),
    };
  }));
}

export function buildHtmlDocument(
  title: string,
  bodyHtml: string,
  stylesheet = './styles.css',
) {
  const safeTitle = title
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const safeStylesheet = stylesheet.replaceAll('"', '&quot;');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="${safeStylesheet}">
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export async function createWebsiteZip(files: WebsiteExportFile[]) {
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.content));
  return zip.generateAsync({ type: 'blob' });
}

export async function downloadWebsiteZip(
  filename: string,
  files: WebsiteExportFile[],
) {
  const blob = await createWebsiteZip(files);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
