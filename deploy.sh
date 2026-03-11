#!/bin/bash
# Deploy Cortex plugin to local Obsidian vault

PLUGIN_DIR="/Users/lukasebner/Library/Mobile Documents/iCloud~md~obsidian/Documents/.obsidian/plugins/cortex"

echo "🔨 Building..."
npm run build || exit 1

echo "📦 Copying to Obsidian vault..."
cp main.js "$PLUGIN_DIR/main.js"
cp manifest.json "$PLUGIN_DIR/manifest.json"
cp styles.css "$PLUGIN_DIR/styles.css" 2>/dev/null || true

echo "✅ Done! Reload the plugin in Obsidian:"
echo "   Settings → Community Plugins → Cortex → Disable → Enable"
