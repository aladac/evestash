#!/usr/bin/env bash
set -euo pipefail

# ESI publishes Swagger 2.0 — convert to OpenAPI 3.0 first
SPEC_URL="https://converter.swagger.io/api/convert?url=https://esi.evetech.net/latest/swagger.json"
OUT="src/generated/esi.d.ts"

mkdir -p src/generated
echo "Converting ESI Swagger 2.0 → OpenAPI 3.0..."
curl -sf "$SPEC_URL" -o /tmp/esi-openapi3.json
echo "Generating TypeScript types..."
npx openapi-typescript /tmp/esi-openapi3.json -o "$OUT"
echo "Done → $OUT"
