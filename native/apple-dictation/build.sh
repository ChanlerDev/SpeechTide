#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$ROOT_DIR/src"
BIN_DIR="$ROOT_DIR/bin"
BIN_NAME="apple-dictation-helper"

mkdir -p "$BIN_DIR"

xcrun swiftc \
  -O \
  -framework Foundation \
  -framework AVFoundation \
  -framework Speech \
  "$SRC_DIR/main.swift" \
  -o "$BIN_DIR/$BIN_NAME"

echo "Built $BIN_DIR/$BIN_NAME"
