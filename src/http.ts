import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { readEnv } from "./env.js";

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > 1_000_000) throw new Error("Request body too large");
    chunks.push(buf);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as unknown;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

export async function startHttp(): Promise<void> {
  const env = readEnv();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${env.host}:${env.port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, name: "ui-kit-aggregator-mcp" });
      return;
    }
    if (url.pathname !== "/mcp") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
      return;
    }
    const mcp = createMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        enableDnsRebindingProtection: true,
        allowedHosts: ["127.0.0.1", "localhost", `${env.host}:${env.port}`],
      });
      const body = await readBody(req);
      res.on("close", () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      console.error("HTTP MCP error", error instanceof Error ? error.message : error);
      if (!res.headersSent) {
        sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.port, env.host, () => resolve());
  });
  console.error(`ui-kit-aggregator-mcp listening on http://${env.host}:${env.port}/mcp`);
}
