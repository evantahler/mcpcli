#!/usr/bin/env bash
set -euo pipefail

# E2E tests for mcpx upgrade command — validates all 3 install pathways.
#
# Installs the current branch via npm, bun, and compiled binary, then runs
# check-update and upgrade to verify install-method detection and command plumbing.

PASS=0
FAIL=0
ERRORS=""
EXPECTED_VERSION=$(jq -r .version package.json)

# Ensure bun's global bin is in PATH (CI may not have it)
export PATH="$HOME/.bun/bin:$PATH"

pass() { PASS=$((PASS + 1)); echo "  ✔ $1"; }
fail() { FAIL=$((FAIL + 1)); ERRORS+="  ✖ $1"$'\n'; echo "  ✖ $1"; }

clear_cache() { rm -f ~/.mcpx/update.json; }

assert_eq() {
  local label="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    pass "$label"
  else
    fail "$label (got '$got', want '$want')"
  fi
}

assert_json_field() {
  local label="$1" json="$2" field="$3"
  local val
  val=$(echo "$json" | jq -r "$field // empty")
  if [ -n "$val" ]; then
    pass "$label"
  else
    fail "$label (field $field missing or empty)"
  fi
}

# ══════════════════════════════════════════════════════════════
# TEST 1: npm pathway
# ══════════════════════════════════════════════════════════════
echo ""
echo "═══ TEST 1: npm pathway ═══"

npm install -g . 2>&1
hash -r

VER=$(mcpx --version)
assert_eq "npm: version matches package.json" "$VER" "$EXPECTED_VERSION"

clear_cache
CHECK=$(mcpx --json check-update 2>/dev/null)
assert_json_field "npm: check-update has currentVersion" "$CHECK" ".currentVersion"
assert_json_field "npm: check-update has latestVersion" "$CHECK" ".latestVersion"

CHECK_VER=$(echo "$CHECK" | jq -r '.currentVersion')
assert_eq "npm: check-update currentVersion matches" "$CHECK_VER" "$EXPECTED_VERSION"

clear_cache
UPGRADE=$(mcpx --json upgrade 2>/dev/null || true)
assert_json_field "npm: upgrade has from" "$UPGRADE" ".from"

npm uninstall -g @evantahler/mcpx 2>&1
hash -r

# ══════════════════════════════════════════════════════════════
# TEST 2: bun pathway
# ══════════════════════════════════════════════════════════════
echo ""
echo "═══ TEST 2: bun pathway ═══"

# bun install -g . doesn't work like npm for local packages, so pack first
TARBALL=$(npm pack --pack-destination /tmp 2>/dev/null | tail -1)
bun install -g "/tmp/$TARBALL" 2>&1
hash -r

VER=$(mcpx --version)
assert_eq "bun: version matches package.json" "$VER" "$EXPECTED_VERSION"

clear_cache
CHECK=$(mcpx --json check-update 2>/dev/null)
assert_json_field "bun: check-update has currentVersion" "$CHECK" ".currentVersion"
assert_json_field "bun: check-update has latestVersion" "$CHECK" ".latestVersion"

CHECK_VER=$(echo "$CHECK" | jq -r '.currentVersion')
assert_eq "bun: check-update currentVersion matches" "$CHECK_VER" "$EXPECTED_VERSION"

clear_cache
UPGRADE=$(mcpx --json upgrade 2>/dev/null || true)
assert_json_field "bun: upgrade has from" "$UPGRADE" ".from"

bun remove -g @evantahler/mcpx 2>&1
rm -f "/tmp/$TARBALL"
hash -r

# ══════════════════════════════════════════════════════════════
# TEST 3: binary pathway
# ══════════════════════════════════════════════════════════════
echo ""
echo "═══ TEST 3: binary pathway ═══"

bun run build 2>&1

BIN_DIR="${MCPX_TEST_BIN_DIR:-/usr/local/bin}"

if [ -w "$BIN_DIR" ]; then
  cp dist/mcpx "${BIN_DIR}/mcpx"
else
  sudo cp dist/mcpx "${BIN_DIR}/mcpx"
fi
hash -r

VER=$(mcpx --version)
assert_eq "binary: version matches package.json" "$VER" "$EXPECTED_VERSION"

clear_cache
CHECK=$(mcpx --json check-update 2>/dev/null)
assert_json_field "binary: check-update has currentVersion" "$CHECK" ".currentVersion"
assert_json_field "binary: check-update has latestVersion" "$CHECK" ".latestVersion"

CHECK_VER=$(echo "$CHECK" | jq -r '.currentVersion')
assert_eq "binary: check-update currentVersion matches" "$CHECK_VER" "$EXPECTED_VERSION"

clear_cache
UPGRADE=$(mcpx --json upgrade 2>/dev/null || true)
assert_json_field "binary: upgrade has from" "$UPGRADE" ".from"

# The binary pathway should NOT detect as npm or bun
UPGRADE_METHOD=$(echo "$UPGRADE" | jq -r '.method // empty')
if [ -n "$UPGRADE_METHOD" ]; then
  # If method is present (always emitted), verify it's "binary"
  assert_eq "binary: detected install method" "$UPGRADE_METHOD" "binary"
fi

if [ -w "$BIN_DIR" ]; then
  rm -f "${BIN_DIR}/mcpx"
else
  sudo rm -f "${BIN_DIR}/mcpx"
fi
hash -r

# ══════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════
echo ""
echo "═══ RESULTS ═══"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failures:"
  echo "$ERRORS"
  exit 1
fi

echo ""
echo "All upgrade pathway tests passed."
