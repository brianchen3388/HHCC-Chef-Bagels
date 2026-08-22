import JSZip from 'jszip';

export type WebsiteExportFile = {
  name: string;
  content: string;
};

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
