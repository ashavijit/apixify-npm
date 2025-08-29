#!/usr/bin/env node
import { Command } from "commander";
import { runClient } from "../src/client";

const program = new Command();

program
  .name("apixify-tunnel")
  .description("Expose a local HTTP server via the Apixify tunnel server")
  .option("--server <url>", "Server base URL", "https://apixify-tunnel-server.onrender.com")
  .requiredOption("--port <number>", "Local port to expose", (v) => parseInt(v, 10))
  .option("--username <name>", "Optional username to register")
  .option("--ttl <seconds>", "Session TTL seconds", (v) => parseInt(v, 10), 21600)
  .action(async (opts) => {
    const localUrl = `http://127.0.0.1:${opts.port}`;
    await runClient(opts.server, localUrl, opts.username, opts.ttl);
  });

program.parse(process.argv);
