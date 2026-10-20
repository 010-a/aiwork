import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const lock = await readFile("package-lock.json");
const signature = createHash("sha256").update(lock).digest("hex");
const marker = "node_modules/.zhixingban-lock";
if ((await readFile(marker, "utf8").catch(() => "")) !== signature) {
  console.log(
    "Installing or updating dependencies. This step may need internet access.",
  );
  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          ["/d", "/s", "/c", "npm ci --no-audit --no-fund"],
          { stdio: "inherit" },
        )
      : spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
          stdio: "inherit",
        });
  if (result.status !== 0) process.exit(result.status || 1);
  await writeFile(marker, signature);
}
