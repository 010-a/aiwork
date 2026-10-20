import { spawn } from "node:child_process";
import { build } from "vite";
if (!process.env.ZHIXINGBAN_BROWSER_ONLY)
  await build({ configFile: "vite.service.config.ts" });
const children = [];
if (!process.env.ZHIXINGBAN_BROWSER_ONLY)
  children.push(
    spawn(process.execPath, ["service-dist/main.mjs"], {
      stdio: "inherit",
      env: { ...process.env, ZHIXINGBAN_PORT: "5174" },
    }),
  );
children.push(
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    { stdio: "inherit" },
  ),
);
for (const child of children)
  child.on("exit", (code) => {
    for (const c of children) if (c !== child) c.kill();
    process.exitCode = code || 0;
  });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill();
  });
