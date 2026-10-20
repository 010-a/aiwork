import os from "node:os";
import path from "node:path";
export function dataDirectory(): string {
  return path.resolve(
    process.env.ZHIXINGBAN_DATA_DIR ||
      (process.platform === "win32"
        ? path.join(
            process.env.LOCALAPPDATA ||
              path.join(os.homedir(), "AppData", "Local"),
            "Zhixingban",
          )
        : path.join(
            process.env.XDG_DATA_HOME ||
              path.join(os.homedir(), ".local", "share"),
            "zhixingban",
          )),
  );
}
