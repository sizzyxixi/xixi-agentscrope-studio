import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const target = new URL("../public/pdfjs/", import.meta.url);
mkdirSync(target, { recursive: true });
for (const name of ["cmaps", "standard_fonts", "LICENSE"]) {
  cpSync(new URL(name, source), new URL(name, target), { recursive: true, force: true });
}
cpSync(new URL("build/pdf.worker.min.mjs", source), new URL("pdf.worker.min.mjs", target));
console.log(`PDF.js preview assets synchronized: ${fileURLToPath(target)}`);
