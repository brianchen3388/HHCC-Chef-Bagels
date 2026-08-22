export const GENERATED_SITE_FONTS = [
  { family: 'Inter', filename: 'inter-latin-variable.woff2', weight: '100 900' },
  { family: 'Manrope', filename: 'manrope-latin-variable.woff2', weight: '200 800' },
  { family: 'DM Sans', filename: 'dm-sans-latin-variable.woff2', weight: '100 1000' },
  { family: 'Space Grotesk', filename: 'space-grotesk-latin-variable.woff2', weight: '300 700' },
  { family: 'Lora', filename: 'lora-latin-variable.woff2', weight: '400 700' },
  { family: 'Playfair Display', filename: 'playfair-display-latin-variable.woff2', weight: '400 900' },
  { family: 'Bitter', filename: 'bitter-latin-variable.woff2', weight: '100 900' },
  { family: 'JetBrains Mono', filename: 'jetbrains-mono-latin-variable.woff2', weight: '100 800' },
] as const;

export const GENERATED_SITE_FONT_GUIDANCE =
  'The locally bundled named fonts are Inter, Manrope, DM Sans, Space Grotesk, Lora, Playfair Display, Bitter, and JetBrains Mono. Arial, Helvetica, Georgia, Times New Roman, Verdana, Trebuchet MS, and Courier New are also safe system fonts. Use only these named fonts plus an appropriate generic fallback. Never use Sketchly Bukhari, Bukhari, Bukhari Script, or any other cursive/handwriting font in a generated website.';

export function buildGeneratedSiteFontCss(
  sourceFor: (filename: string) => string,
) {
  return GENERATED_SITE_FONTS.map((font) => `@font-face {
  font-family: '${font.family}';
  src: url('${sourceFor(font.filename)}') format('woff2');
  font-style: normal;
  font-weight: ${font.weight};
  font-display: swap;
}`).join('\n\n');
}
