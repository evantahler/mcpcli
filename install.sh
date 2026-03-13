#!/usr/bin/env bash
set -euo pipefail

REPO="evantahler/mcpx"
INSTALL_DIR="${MCPX_INSTALL_DIR:-/usr/local/bin}"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *)
    echo "error: unsupported OS: $OS" >&2
    exit 1
    ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *)
    echo "error: unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

ARTIFACT="mcpx-${os}-${arch}"

# Get latest release tag
echo "Fetching latest release..."
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)

if [ -z "$TAG" ]; then
  echo "error: could not determine latest release" >&2
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ARTIFACT}"

echo "Downloading mcpx ${TAG} (${os}/${arch})..."
curl -fsSL "$URL" -o /tmp/mcpx

chmod +x /tmp/mcpx

# Install
if [ -w "$INSTALL_DIR" ]; then
  mv /tmp/mcpx "${INSTALL_DIR}/mcpx"
else
  echo "Installing to ${INSTALL_DIR} (requires sudo)..."
  sudo mv /tmp/mcpx "${INSTALL_DIR}/mcpx"
fi

echo "mcpx ${TAG} installed to ${INSTALL_DIR}/mcpx"
