# cargo-scan

EVE Online cargo/multibuy appraisal tool. Paste multibuy text, get market prices.

## Tech Stack

- Vanilla HTML/CSS/TS frontend (Vite)
- Cloudflare Pages + Pages Functions (API)
- Cloudflare KV for caching (type IDs: no expiry, prices: 300s TTL)
- openapi-typescript + openapi-fetch for type-safe ESI client
- ESI (EVE Swagger Interface) for market data

## Development

```bash
just generate        # Pull ESI spec, generate types
just dev             # Wrangler Pages dev server
just build           # Vite production build
just preview         # Vite preview
just deploy          # Build + deploy to CF Pages
```

## Architecture

- `src/index.html` + `src/main.ts` + `src/style.css` — frontend
- `src/lib/parser.ts` — multibuy text parser
- `src/lib/constants.ts` — trade hub definitions
- `src/lib/types.ts` — shared types
- `src/functions/api/appraise.ts` — POST /api/appraise (Pages Function)
