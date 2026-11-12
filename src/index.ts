#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadDotEnv } from "./env.js";
import { startHttp } from "./http.js";
import { createMcpServer } from "./server.js";

loadDotEnv();

const http = process.argv.includes("--http") || (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase() === "http";

if (http) {
  await startHttp();
} else {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
