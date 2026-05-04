#!/usr/bin/env bash
set -euo pipefail

# Apply the @huggingface/transformers patch to node_modules so that
# `bun build --compile` produces a binary using the WASM backend
# (onnxruntime-web) instead of onnxruntime-node, whose native bindings
# can't be bundled into a single-binary distribution.
#
# We apply the patch imperatively (rather than via package.json
# `patchedDependencies`) because that field, when present in a
# published package, breaks `bun install` from a tarball: bun looks for
# the patch file relative to the install root, which doesn't exist for
# tarball-installed packages.

PATCH="patches/@huggingface%2Ftransformers@4.2.0.patch"
TARGET="node_modules/@huggingface/transformers"
MARKER="$TARGET/.mcpx-transformers-patch-applied"

if [ ! -d "$TARGET" ]; then
	echo "error: $TARGET not found — run \`bun install\` first" >&2
	exit 1
fi

if [ ! -f "$PATCH" ]; then
	echo "error: $PATCH not found" >&2
	exit 1
fi

if [ -f "$MARKER" ]; then
	echo "transformers patch already applied — skipping"
	exit 0
fi

echo "Applying transformers patch ($PATCH) to $TARGET..."
# Use git apply with --directory so the diff paths in the patch
# (a/dist/..., a/src/...) resolve relative to the package root.
git apply --directory="$TARGET" "$PATCH"
touch "$MARKER"
echo "Patch applied."
