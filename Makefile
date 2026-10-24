.PHONY: format lint test build release assistant-ui-upstream-check

format:
	bun run format

lint:
	bun run lint

test:
	bun run test

build:
	bun run build

assistant-ui-upstream-check:
	bash scripts/assistant-ui-upstream-diff.sh

release:
	@case "$(BUMP)" in MAJOR|MINOR|PATCH) ;; *) printf 'Usage: make release BUMP=MAJOR|MINOR|PATCH\n' >&2; exit 2 ;; esac
	@test -z "$$(git status --porcelain)" || { printf 'Release requires a clean working tree.\n' >&2; exit 2; }
	bun pm version "$(shell printf '%s' "$(BUMP)" | tr '[:upper:]' '[:lower:]')"
	gh release create "v$$(bun -e 'console.log(require("./package.json").version)')" --generate-notes
