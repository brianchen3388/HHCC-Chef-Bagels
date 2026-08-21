# HHCC-Chef-Bagels · SketchSite

SketchSite is a hackathon prototype that turns a digital wireframe into a static website:

1. Draw the page with Pen, Line, Frame, or Text.
2. Click **Generate website**.
3. Kimi Vision converts the canvas PNG into validated component JSON.
4. Kimi Code chooses a visual style and returns static HTML/CSS.
5. The app shows the result in an isolated preview, with Structure and Code tabs for inspection.

This prototype intentionally does not generate JavaScript or website functionality yet.

## Add your Kimi API Key

Open `.env.local` in the project root and paste the key after the equals sign:

```dotenv
MOONSHOT_API_KEY=your_real_kimi_api_key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_VISION_MODEL=kimi-k3
KIMI_CODE_MODEL=kimi-k2.7-code-highspeed
```

`.env.local` is ignored by Git. Do not add `NEXT_PUBLIC_` or `VITE_` to the key name; the browser must never receive it.

The defaults use Kimi K3 for visual recognition and Kimi K2.7 Code Highspeed for HTML/CSS. Model access depends on the Kimi account. If K3 is unavailable, try `KIMI_VISION_MODEL=kimi-k2.6` as a prototype fallback.

For an international Kimi account, use its matching key and set:

```dotenv
KIMI_BASE_URL=https://api.moonshot.ai/v1
```

China and international API keys are not interchangeable.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by the development server.

## Validate

```bash
npm run lint
npm run build
```

Kimi API references: [quickstart](https://platform.kimi.com/docs/overview), [vision input](https://platform.kimi.com/docs/guide/use-kimi-vision-model), and [structured output](https://platform.kimi.com/docs/guide/response_format).
