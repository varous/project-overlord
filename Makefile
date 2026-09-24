SHELL := /bin/sh

.PHONY: verify typecheck lint test zero-deps

# Acceptance gate. Runs in order and stops at the first failure.
verify:
	npm run typecheck
	npm run lint
	npm test
	node scripts/check-zero-deps.mjs
	npm run build -w @overlord/web
	node scripts/check-web-build.mjs
	npm run build -w @overlord/web-sp
	npm run smoke

typecheck:
	npm run typecheck

lint:
	npm run lint

test:
	npm test

zero-deps:
	node scripts/check-zero-deps.mjs
