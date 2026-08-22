export function downloadHtmlFile(
  filename: string,
  bodyHtml: string,
  css: string,
) {
  const source = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sketchly export</title>
  <style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
