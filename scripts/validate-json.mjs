#!/usr/bin/env node
import { failAndExit, listRepoFiles, parseJsonOrJsonc } from "./validation-utils.mjs";

const failures = [];
const files = listRepoFiles().filter((file) => /\.(json|jsonc|webmanifest)$/i.test(file));

for (const file of files) {
  try {
    parseJsonOrJsonc(file);
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
  }
}

if (!files.length) failures.push("No JSON files found to validate.");

failAndExit("JSON validation", failures);

