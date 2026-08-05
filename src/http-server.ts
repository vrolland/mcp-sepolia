import "./load-env.js";

import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createSepoliaPayMcpServer } from "./mcp-server-factory.js";

/** Default 3101 so it can run alongside mcp-request-network (3100). */
const DEFAULT_PORT = 3101;

type SessionEntry = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
};

const sessions = new Map<string, SessionEntry>();
const eventStore = new InMemoryEventStore();

const app = createMcpExpressApp();

app.all("/mcp", async (req: Request, res: Response) => {
  const sessionHeader = req.headers["mcp-session-id"];
  const existingId =
    typeof sessionHeader === "string" ? sessionHeader : undefined;

  let entry = existingId ? sessions.get(existingId) : undefined;

  if (!entry) {
    // RN_CLIENT_ID / MNEMONIC come from the server .env only — not from mcp.json headers.
    const server = createSepoliaPayMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      eventStore,
      retryInterval: 2000,
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, server });
        console.error(`[mcp-http] session ${sessionId} ready`);

        transport.onclose = () => {
          sessions.delete(sessionId);
          console.error(`[mcp-http] session ${sessionId} closed`);
        };
      },
    });

    await server.connect(transport);
    entry = { transport, server };
  }

  try {
    await entry.transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[mcp-http] MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const port = Number(process.env.MCP_HTTP_PORT) || DEFAULT_PORT;

app.listen(port, () => {
  const clientId = process.env.RN_CLIENT_ID?.trim() || "(missing RN_CLIENT_ID)";
  console.error(`mcp-sepolia (HTTP) — http://127.0.0.1:${port}/mcp`);
  console.error(`RN_CLIENT_ID (server .env): ${clientId}`);
  console.error("Listening...");
});
