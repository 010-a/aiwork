import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const url = "http://127.0.0.1:5173";
const deadline = Date.now() + 20_000;

function ready(timeout) {
  return new Promise((resolve) => {
    const request = http.get(
      url,
      {
        agent: false,
        signal: AbortSignal.timeout(timeout),
      },
      (response) => {
        const success = response.statusCode === 200;
        response.destroy();
        resolve(success);
      },
    );
    request.on("error", () => resolve(false));
  });
}

function openBrowser() {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd.exe", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {});
  child.unref();
}

while (Date.now() < deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) break;
  if (await ready(Math.min(700, remaining))) {
    openBrowser();
    break;
  }
  const wait = Math.min(300, deadline - Date.now());
  if (wait > 0) await delay(wait);
}
