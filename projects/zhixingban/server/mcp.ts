/** MCP stdio JSON-RPC transport. stdout is reserved for protocol messages. */
import readline from "node:readline";
import { agentTools, runAgentTool } from "./agent";
const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
function send(value: unknown) {
  process.stdout.write(JSON.stringify(value) + "\n");
}
input.on("line", (line) => {
  void (async () => {
    let request: {
      jsonrpc: string;
      id?: string | number;
      method: string;
      params?: Record<string, unknown>;
    };
    try {
      if (Buffer.byteLength(line) > 2 * 1024 * 1024)
        throw new Error("消息过大");
      request = JSON.parse(line);
      if (
        !request ||
        Array.isArray(request) ||
        request.jsonrpc !== "2.0" ||
        typeof request.method !== "string"
      )
        throw new Error("无效请求");
    } catch {
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON-RPC request" },
      });
      return;
    }
    if (request.id === undefined) return;
    try {
      let result: unknown;
      if (request.method === "initialize")
        result = {
          protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18"].includes(
            String(request.params?.protocolVersion),
          )
            ? request.params!.protocolVersion
            : "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "zhixingban", version: "1.4.0" },
          instructions:
            "所有操作仅作用于本机数据。先查询再写入；结果记录必须来自用户明确提供的实际结果。原则支持结构化条件，manual 只供阅读。",
        };
      else if (request.method === "ping") result = {};
      else if (request.method === "tools/list") result = { tools: agentTools };
      else if (request.method === "tools/call") {
        try {
          const value = await runAgentTool(
            String(request.params?.name),
            (request.params?.arguments ?? {}) as Record<string, unknown>,
            "mcp",
          );
          result = { content: [{ type: "text", text: JSON.stringify(value) }] };
        } catch (error) {
          result = {
            isError: true,
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }
      } else {
        send({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "Method not found" },
        });
        return;
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  })();
});
