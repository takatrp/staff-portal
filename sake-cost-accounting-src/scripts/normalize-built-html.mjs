import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputFile = resolve("../sake-cost-accounting-mockup/index.html");
const html = readFileSync(outputFile, "utf8");
writeFileSync(outputFile, html.replace(/\r\n?/g, "\n"), "utf8");
