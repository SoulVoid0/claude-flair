#!/usr/bin/env bash
# Builds release files into plugins/neurolite/dist:
#   neurolite.mcpb        Claude Desktop extension (local MCP server)
#   neurolite-plugin.zip  plugin package for Customize > Plugins > Upload plugin
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist .stage && mkdir -p dist .stage/mcpb

# Desktop extension: manifest + icon + server only
cp mcpb/manifest.json icon.png .stage/mcpb/
cp -r server .stage/mcpb/server
npx -y @anthropic-ai/mcpb@2.1.2 validate .stage/mcpb/manifest.json
npx -y @anthropic-ai/mcpb@2.1.2 pack .stage/mcpb dist/neurolite.mcpb

# Plugin zip: everything Claude loads, no tests/build files
zip -qr dist/neurolite-plugin.zip .claude-plugin .mcp.json hooks scripts/hook.js scripts/neurolite.js server skills icon.png README.md LICENSE
rm -rf .stage
ls -la dist
