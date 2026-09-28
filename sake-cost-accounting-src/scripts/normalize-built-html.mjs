import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputFile = resolve("../sake-cost-accounting-mockup/index.html");
const html = readFileSync(outputFile, "utf8");
const normalizedHtml = html
  .replace(/\r\n?/g, "\n")
  .replace(/\n[ \t]*\n(?=[ \t]*<\/body>)/g, "\n")
  .replace(/\n*$/, "\n");

writeFileSync(outputFile, normalizedHtml, "utf8");
