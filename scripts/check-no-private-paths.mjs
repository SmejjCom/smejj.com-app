#!/usr/bin/env node
import { failAndExit, isTextFile, listRepoFiles, readText } from "./validation-utils.mjs";

const failures = [];
const files = listRepoFiles().filter((file) => {
  if (!isTextFile(file)) return false;
  return /\.(md|json|jsonc|webmanifest)$/i.test(file);
});

const privatePathPatterns = [
  /(^|[\s"'(])\/Users\/[^"'\s)]+/,
  /(^|[\s"'(])\/home\/[^"'\s)]+/,
  /[A-Za-z]:\\Users\\/,
  // Nur echte file-URLs mit Pfad — das blosse Schema "file://" darf als
  // Code-Zitat in Lehrtexten vorkommen (Capsule job_modelle_medien_20260818).
  /file:\/\/\/[^"'\s)]/i,
  /GoogleDrive-[^"'\s)]+/i,
  /Meine Ablage/i
];

for (const file of files) {
  const text = readText(file);
  for (const pattern of privatePathPatterns) {
    if (pattern.test(text)) failures.push(`${file} contains a private local path pattern: ${pattern}`);
  }
}

failAndExit("Private path check", failures);
