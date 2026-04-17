#!/usr/bin/env node
import readline from "node:readline";

import { parseCliArgs } from "./cli/parseCliArgs.js";
import { createAppServer } from "./server/createAppServer.js";

async function main() {
  const options = parseCliArgs(process.argv);
  const app = await createAppServer({
    ...options,
    send: (payload) => {
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    },
  });

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    await app.processLine(line);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
