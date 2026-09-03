import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const outputDirectory = resolve(repositoryRoot, "sake-cost-accounting-mockup");
const outputPath = "sake-cost-accounting-mockup";
const publicBase = "/staff-portal/sake-cost-accounting-mockup/";
const assetBase = `${publicBase}assets/`;
const indexFile = resolve(outputDirectory, "index.html");

function fail(message) {
  throw new Error(`[verify:pages] ${message}`);
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolute) : [relative(outputDirectory, absolute).split(sep).join("/")];
  });
}

function runGit(args) {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8", shell: false });
  if (result.error) fail(`gitを実行できません: ${result.error.message}`);
  return result;
}

if (!existsSync(indexFile)) fail("sake-cost-accounting-mockup/index.html がありません。");

const html = readFileSync(indexFile, "utf8");
const scriptSources = [...html.matchAll(/<script\b[^>]*>/gi)].map(([tag]) => attribute(tag, "src")).filter(Boolean);
const stylesheetHrefs = [...html.matchAll(/<link\b[^>]*>/gi)]
  .filter(([tag]) => (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
  .map(([tag]) => attribute(tag, "href"))
  .filter(Boolean);

if (scriptSources.length === 0) fail("index.htmlにscript資産の参照がありません。");
if (stylesheetHrefs.length === 0) fail("index.htmlにstylesheet資産の参照がありません。");

const references = [...scriptSources, ...stylesheetHrefs];
for (const reference of scriptSources) {
  if (!reference.endsWith(".js")) fail(`script参照が.jsではありません: ${reference}`);
}
for (const reference of stylesheetHrefs) {
  if (!reference.endsWith(".css")) fail(`stylesheet参照が.cssではありません: ${reference}`);
}
for (const reference of references) {
  if (!reference.startsWith(assetBase)) fail(`資産参照が公開base path外です: ${reference}`);
}

const actualFiles = new Set(filesBelow(outputDirectory));
const referencedFiles = new Set(references.map((reference) => new URL(reference, "https://example.invalid").pathname.slice(publicBase.length)));
for (const referencedFile of referencedFiles) {
  if (!actualFiles.has(referencedFile)) fail(`HTML参照資産が存在しません: ${referencedFile}`);
}

const staleAssets = [...actualFiles].filter((file) => /^assets\/index-.*\.(?:js|css)$/.test(file) && !referencedFiles.has(file));
if (staleAssets.length > 0) fail(`未参照の旧資産があります: ${staleAssets.join(", ")}`);

const robotsTag = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag).find((tag) => (attribute(tag, "name") ?? "").toLowerCase() === "robots");
const robots = new Set((robotsTag ? attribute(robotsTag, "content") ?? "" : "").toLowerCase().split(/[\s,]+/).filter(Boolean));
for (const directive of ["noindex", "nofollow", "noarchive"]) {
  if (!robots.has(directive)) fail(`robots metaに ${directive} がありません。`);
}

const trackedDiff = runGit(["diff", "--exit-code", "HEAD", "--", outputPath]);
if (trackedDiff.status !== 0) {
  const summary = runGit(["diff", "--name-status", "HEAD", "--", outputPath]);
  const indexDiff = runGit(["diff", "--", `${outputPath}/index.html`]);
  process.stderr.write(summary.stdout || trackedDiff.stderr);
  if (indexDiff.stdout) process.stderr.write(indexDiff.stdout);
  fail("ビルド後のPages成果物がHEADのコミット内容と一致しません。");
}

const untracked = runGit(["ls-files", "--others", "--exclude-standard", "-z", "--", outputPath]);
if (untracked.status !== 0) fail(untracked.stderr.trim() || "未追跡ファイルを確認できませんでした。");
const untrackedFiles = untracked.stdout.split("\0").filter(Boolean);
if (untrackedFiles.length > 0) fail(`未追跡のPages成果物があります: ${untrackedFiles.join(", ")}`);

console.log(`[verify:pages] OK: ${references.length}件の参照資産、robots meta、生成物差分を確認しました。`);
