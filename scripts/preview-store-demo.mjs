// Build the actual workspace for the standalone design-review server.
// Usage: node scripts/preview-store-demo.mjs [output-directory]
import * as esbuild from "esbuild";
import { copyFile, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, "work/store-demo-preview"));
await mkdir(output, { recursive: true });
await esbuild.build({
  stdin: {
    contents: `import "./app/globals.css";
import "./app/studio-foundations.css";
import React from "react";
import { createRoot } from "react-dom/client";
import Demo from "./app/store-demo/page.tsx";
import { PreferencesProvider } from "./components/PreferencesProvider";
import { OperationFeedbackProvider } from "./components/OperationFeedback";
createRoot(document.getElementById("root")).render(<PreferencesProvider><OperationFeedbackProvider><Demo /></OperationFeedbackProvider></PreferencesProvider>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  outfile: path.join(output, "full.js"),
  loader: { ".css": "css", ".woff2": "file", ".woff": "file", ".ttf": "file" },
  plugins: [{
    name: "css-modules",
    setup(build) {
      build.onResolve({ filter: /^next\/image$/ }, () => ({ path: "next-image", namespace: "workspace-preview" }));
      build.onLoad({ filter: /.*/, namespace: "workspace-preview" }, () => ({ contents: 'export { Image as default } from "next/dist/client/image-component";', resolveDir: root, loader: "js" }));
      build.onLoad({ filter: /\/app\/globals\.css$/ }, async args => {
        const css = await postcss([tailwindcss({ base: root })]).process(await readFile(args.path, "utf8"), { from: args.path });
        return { contents: css.css, loader: "css", resolveDir: path.dirname(args.path) };
      });
      build.onLoad({ filter: /\.module\.css$/ }, async args => ({ contents: await readFile(args.path, "utf8"), loader: "local-css" }));
    },
  }],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", "process.platform": '"browser"' },
  minify: true,
});
await copyFile(path.join(root, "public/xixi-agent-logo.png"), path.join(output, "xixi-agent-logo.png"));
for (const entry of await readdir(path.join(root, "public"), { withFileTypes: true })) {
  try { await symlink(path.join(root, "public", entry.name), path.join(output, entry.name), entry.isDirectory() ? "dir" : "file"); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
}
await writeFile(path.join(output, "index.html"), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>店铺经营 · 交互 Demo</title><link rel="stylesheet" href="/full.css"></head><body><div id="root"></div><script src="/full.js"></script></body></html>');
console.log(`Workspace preview built: ${output}`);
