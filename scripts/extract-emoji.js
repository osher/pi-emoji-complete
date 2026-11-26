import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { nameToEmoji } from "gemoji";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(rootDir, "extensions", "name-to-emoji.js");

const normalized = Object.create(null);
for (const [name, emoji] of Object.entries(nameToEmoji)) {
  const key = name.toLowerCase();
  if (!(key in normalized)) {
    normalized[key] = emoji;
  }
}

const content = `// Generated from gemoji via scripts/extract-emoji.js — do not edit by hand.\nexport const nameToEmoji = ${JSON.stringify(normalized, null, 2)};\n`;

writeFileSync(outPath, content, "utf8");
console.log(`Wrote ${Object.keys(normalized).length} emoji entries to ${outPath}`);
