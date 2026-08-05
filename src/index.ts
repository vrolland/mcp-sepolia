#!/usr/bin/env node
import "./load-env.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createSepoliaPayMcpServer } from "./mcp-server-factory.js";

async function main() {
  const server = createSepoliaPayMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-sepolia running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
