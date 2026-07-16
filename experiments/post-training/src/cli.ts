#!/usr/bin/env -S node --experimental-strip-types

import { readFileSync } from "node:fs";
import { auditMarginDatabase } from "./audit.ts";
import { validateCaptureExample } from "./contract.ts";
import { probeFireworksCapabilities } from "./fireworks.ts";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`missing required option ${name}`);
  return value;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): never {
  process.stderr.write(
    [
      "Usage:",
      "  cli.ts audit --db <path>",
      "  cli.ts validate --file <capture-example.json>",
      "  cli.ts fireworks --model <resource> --expected-hf <url> --expected-revision <revision>",
      "",
      "The Fireworks command makes one read-only GET request and never starts a job.",
    ].join("\n"),
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (command === "audit") {
    print(auditMarginDatabase(requiredOption(args, "--db")));
    return;
  }
  if (command === "validate") {
    const value = JSON.parse(readFileSync(requiredOption(args, "--file"), "utf8")) as unknown;
    print(validateCaptureExample(value));
    return;
  }
  if (command === "fireworks") {
    const result = await probeFireworksCapabilities({
      apiKey: process.env.FIREWORKS_API_KEY,
      models: [
        {
          resourceName: requiredOption(args, "--model"),
          expectedHuggingFaceUrl: requiredOption(args, "--expected-hf"),
          expectedRevision: requiredOption(args, "--expected-revision"),
        },
      ],
    });
    print(result);
    return;
  }
  usage();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
