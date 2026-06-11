import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "client", "dist");
const uploadsDir = path.join(root, "server", "uploads");

function copyDir(source, target, options = {}) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (options.exclude?.(entry.name, path.join(source, entry.name))) continue;
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(sourcePath, targetPath, options);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
  }
}

if (!fs.existsSync(distDir)) {
  throw new Error(`Build output not found: ${distDir}`);
}

copyDir(uploadsDir, path.join(distDir, "uploads"), {
  exclude: (name, sourcePath) =>
    ["backups", "profiles"].includes(name) && fs.statSync(sourcePath).isDirectory()
});

console.log("Cloudflare Pages assets prepared.");
