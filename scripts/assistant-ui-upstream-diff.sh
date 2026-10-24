#!/usr/bin/env bash
set -euo pipefail
version=$(npm view @assistant-ui/react dist-tags.latest); [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
jq -e '.files | type == "array" and length > 0 and all(.[]; (.upstreamPath|type=="string") and (.upstreamBlob|test("^[0-9a-f]{40}$")))' docs/assistant-ui-source.json >/dev/null
git fetch -q --no-tags --depth=1 https://github.com/assistant-ui/assistant-ui.git "refs/tags/@assistant-ui/react@$version"
changed=0
while IFS=$'\t' read -r path blob; do
  actual=$(git ls-tree FETCH_HEAD -- "$path" | awk '{print $3}'); [[ "$actual" == "$blob" ]] || { echo "DRIFT: $path"; changed=1; }
done < <(jq -r '.files[] | [.upstreamPath,.upstreamBlob] | @tsv' docs/assistant-ui-source.json)
exit "$changed"
