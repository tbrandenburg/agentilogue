.PHONY: format lint test release

format:
	@bun run format || { bun run format:fix; git diff -- app/opencode-native-session.tsx docs/spikes/2026-10-opencode-local-boundary-issue-34.md tests/opencode-native-config.test.ts; exit 1; }

lint:
	bun run lint

test:
	bun run test

release:
	@case "$(BUMP)" in MAJOR|MINOR|PATCH) ;; *) printf 'Usage: make release BUMP=MAJOR|MINOR|PATCH\n' >&2; exit 2 ;; esac
	@test -z "$$(git status --porcelain)" || { printf 'Release requires a clean working tree.\n' >&2; exit 2; }
	bun pm version "$(shell printf '%s' "$(BUMP)" | tr '[:upper:]' '[:lower:]')"
	gh release create "v$$(bun -e 'console.log(require("./package.json").version)')" --generate-notes
