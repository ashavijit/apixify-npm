import WebSocket from "ws";
import axios from "axios";
import http from "http";
import https from "https";
import { URL } from "url";
import { TunnelResponse } from "./types";

const baseURL = "https://apixify-tunnel-server.onrender.com"
export async function runClient(server: string, localUrl: string, username?: string, ttl = 21600) {
  const client = axios.create({ baseURL: server });

  const reset = "\x1b[0m";
  const bold = (s: string) => `\x1b[1m${s}${reset}`;
  const green = (s: string) => `\x1b[32m${s}${reset}`;
  const yellow = (s: string) => `\x1b[33m${s}${reset}`;
  const red = (s: string) => `\x1b[31m${s}${reset}`;
  const cyan = (s: string) => `\x1b[36m${s}${reset}`;

  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]; // dots
  function startSpinner(text: string) {
    let i = 0;
    const interval = setInterval(() => {
      process.stdout.write(`\r${cyan(frames[i = ++i % frames.length])} ${text}   `);
    }, 80);
    const stop = (finalText?: string) => {
      clearInterval(interval);
      process.stdout.write(`\r${finalText ?? ""}\n`);
    };
    return { stop };
  }

  const parsedLocal = new URL(localUrl);
  const runningPort = parsedLocal.port;
  const spinner = startSpinner(`Waiting for local server on port ${runningPort} ...`);

  while (true) {
    try {
      await axios.get(localUrl, { timeout: 1200, validateStatus: () => true });
      spinner.stop(`${green("✔")} Local server ${bold(`http://127.0.0.1:${runningPort}`)} is reachable`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  let res;
  if (username) {
    res = await client.post<TunnelResponse>("/register", { username, ttl_seconds: ttl });
  } else {
    res = await client.post<TunnelResponse>("/random", { ttl_seconds: ttl });
  }
  const { tunnel_id, public_url } = res.data;
  console.log(`${yellow("Tunnel:")}`, public_url);
  const dynamicPublicUrl = `${baseURL}/${tunnel_id}`;
  console.log(green("Your request is being proxied..."));
  console.log(`${cyan("Public URL:")} ${bold(dynamicPublicUrl)}`);

  const wsUrl = server.replace(/^http/, "ws") + "/ws";

  async function connect() {
    try {
      const ws = new WebSocket(wsUrl, { maxPayload: 16 * 1024 * 1024 });

      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "register", tunnel_id }));
        console.log("[INFO] Connected to tunnel server. Listening for traffic...");
      });

      ws.on("message", async (msg: WebSocket.RawData) => {
        const data = JSON.parse(msg.toString());
        if (data.type !== "request") return;

        const p = data.payload;
        const rid = p.id;
        const path = p.path;
        const method = p.method;
        const headers: Record<string, string> = p.headers || {};

        ["host", "connection", "transfer-encoding", "content-length"].forEach((k) => {
          delete headers[k];
        });

        let targetUrl = new URL(localUrl);
        targetUrl.pathname = path.startsWith("/") ? path : "/" + path;
        if (p.query) targetUrl.search = p.query;

        const body = p.body || "";

        try {
          const resp = await client.request({
            url: targetUrl.toString(),
            method,
            headers,
            data: body,
            timeout: 20000,
            transitional: { silentJSONParsing: false, forcedJSONParsing: false },
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
          });

          const respHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(resp.headers)) {
            if (!["transfer-encoding", "connection"].includes(k.toLowerCase())) {
              respHeaders[k] = Array.isArray(v) ? v.join(",") : (v as string);
            }
          }

          ws.send(JSON.stringify({
            type: "response",
            payload: {
              id: rid,
              status: resp.status,
              headers: respHeaders,
              body: typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data),
            },
          }));
        } catch (err: any) {
          ws.send(JSON.stringify({
            type: "response",
            payload: {
              id: rid,
              status: 502,
              headers: { "content-type": "text/plain" },
              body: `upstream error: ${err.message}`,
            },
          }));
        }
      });

      ws.on("close", () => {
        console.warn("[WARN] WebSocket closed. Reconnecting in 5s...");
        setTimeout(connect, 5000);
      });

      ws.on("error", (err) => {
        console.error("[ERROR] WebSocket error:", (err as Error).message);
        ws.close();
      });
    } catch (err) {
      console.error("[ERROR] Unexpected error:", err);
      setTimeout(connect, 5000);
    }
  }

  connect();
}
