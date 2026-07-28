import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

async function secretFromFile(path) {
  try {
    const source = await readFile(path, "utf8");
    const line = source
      .split(/\r?\n/)
      .find((entry) => entry.startsWith("SUPABASE_SECRET_KEY="));
    if (!line) return undefined;

    const value = line.slice("SUPABASE_SECRET_KEY=".length).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    return quoted ? value.slice(1, -1) : value;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

const secret =
  process.env.SUPABASE_SECRET_KEY ??
  (await secretFromFile(".env.local")) ??
  (await secretFromFile(".env"));
if (!secret) {
  throw new Error("SUPABASE_SECRET_KEY is required for the leakage check");
}

async function filesUnder(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(path);
  }
  return files;
}

const files = await filesUnder(".next");
for (const file of files) {
  const content = await readFile(file);
  if (content.includes(Buffer.from(secret))) {
    throw new Error(`Server secret detected in build artifact: ${file}`);
  }
}

console.log("Supabase server secret is absent from build artifacts.");
