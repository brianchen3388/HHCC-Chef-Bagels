import JSZip from 'jszip';

export type WebsiteExportFile = {
  name: string;
  content: string | Uint8Array;
};

const bundledExportAssets = [
  {
    source: '/fonts/bukhari-script.woff',
    name: 'assets/bukhari-script.woff',
    binary: true,
  },
  {
    source: '/fonts/bukhari-script-license.txt',
    name: 'assets/bukhari-script-license.txt',
    binary: false,
  },
] as const;

const bundledFontCss = `/* Font packaged with this export for offline use. */
@font-face {
  font-family: 'Sketchly Bukhari';
  src: url('./assets/bukhari-script.woff') format('woff');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'Bukhari';
  src: url('./assets/bukhari-script.woff') format('woff');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'Bukhari Script';
  src: url('./assets/bukhari-script.woff') format('woff');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}`;

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
