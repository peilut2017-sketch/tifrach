#!/usr/bin/env bash
# Transpiles the Supabase Edge Functions (Deno TS) to plain ES2022 for the
# Node-based unit test in test-edge.js. The functions import supabase-js from
# a URL (Deno-style), which esbuild cannot bundle and Node can't execute as a
# bare specifier — so after transpiling we replace that import line with a
# comment; test-edge.js supplies its own fake createClient() instead via
# `new Function('createClient', src)(createClient)`.
set -euo pipefail
cd "$(dirname "$0")"

build() {
  local name="$1"
  npx --yes esbuild "../supabase/functions/$name/index.ts" --format=esm --target=es2022 --log-level=warning --outfile="fn-$name.js"
  sed -i '1s#^import .*#// import stripped#' "fn-$name.js"
}

build self-service
build yemot-ivr
build admin-users
