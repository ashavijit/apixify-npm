#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const client_1 = require("../src/client");
const program = new commander_1.Command();
program
    .name("apixify-tunnel")
    .description("Expose your local server via Apixify Tunnel")
    .version("0.1.0");
program
    .option("-p, --port <number>", "Local port to expose", "5000")
    .option("-u, --username <string>", "Custom username")
    .option("-s, --server <url>", "Tunnel server URL", "http://localhost:9000")
    .action((options) => {
    const localUrl = `http://127.0.0.1:${options.port}`;
    const client = new client_1.ApixifyClient({
        username: options.username,
        localUrl,
        serverUrl: options.server,
    });
    client.connect();
});
program.parse(process.argv);
