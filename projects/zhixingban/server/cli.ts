import { readFile } from "node:fs/promises";
import { api } from "./client";
import { agentTools, runAgentTool } from "./agent";
const [action, argument, file] = process.argv.slice(2);
try {
  if (action === "stop")
    console.log(
      JSON.stringify(
        await api("shutdown", { method: "POST", body: "{}" }, false),
      ),
    );
  else if (action === "schema")
    console.log(JSON.stringify(agentTools, null, 2));
  else if (["query", "apply", "backup"].includes(action)) {
    const source =
      argument === "--file" ? await readFile(file, "utf8") : (argument ?? "{}");
    const value = JSON.parse(source.replace(/^\uFEFF/, ""));
    const args = action === "apply" && value.type ? { command: value } : value;
    console.log(
      JSON.stringify(
        await runAgentTool(`zhixingban_${action}`, args, "cli"),
        null,
        2,
      ),
    );
  } else {
    console.log(
      '知行办本地 CLI\n  node service-dist/cli.mjs schema\n  node service-dist/cli.mjs query \'{"resource":"tasks"}\'\n  node service-dist/cli.mjs apply --file command.json\n  node service-dist/cli.mjs backup\n  node service-dist/cli.mjs stop\nWindows 建议 --file 读取 UTF-8 JSON。无需打开浏览器；自动启动本地服务。',
    );
    if (action) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}
