generate:
    bash scripts/generate-types.sh

check:
    npx tsc --noEmit
    npx tsc --noEmit -p tsconfig.worker.json

dev:
    npx wrangler pages dev dist

build:
    npx vite build

deploy: build
    npx wrangler pages deploy dist

preview: build
    npx vite preview
