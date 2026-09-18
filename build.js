// Bundles the extension into dist/. Run with `node build.js` or `node build.js --watch`.
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");

const entryPoints = [
  "src/background/index.ts",
  "src/content/index.ts",
  "src/popup/index.ts",
  "src/options/index.ts",
];

const staticFiles = [
  ["src/manifest.json", "dist/manifest.json"],
  ["src/shared/theme.css", "dist/shared/theme.css"],
  ["src/popup/index.html", "dist/popup/index.html"],
  ["src/popup/style.css", "dist/popup/style.css"],
  ["src/options/index.html", "dist/options/index.html"],
  ["src/options/style.css", "dist/options/style.css"],
  ["icons", "dist/icons"],
];

async function copyStatic() {
  for (const [from, to] of staticFiles) {
    await mkdir(new URL(to + "/..", `file://${process.cwd()}/`), { recursive: true }).catch(() => {});
    await cp(from, to, { recursive: true });
  }
}

async function main() {
  await rm("dist", { recursive: true, force: true });
  await copyStatic();

  const buildOptions = {
    entryPoints,
    outdir: "dist",
    outbase: "src",
    bundle: true,
    format: "iife",
    target: "chrome110",
    sourcemap: true,
    logLevel: "info",
  };

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes... (static files are copied once at startup)");
  } else {
    await esbuild.build(buildOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
