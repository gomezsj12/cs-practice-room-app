#!/usr/bin/env node
/**
 * Appends a Part 2 row to docs/change-log.md after a commit (post-commit hook).
 * Idempotent: skips if the last table row already documents HEAD.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const logPath = join(root, "docs", "change-log.md");
/** Part 2 table ends before the horizontal rule that precedes "Environment / tooling notes". */
function findPart2InsertAnchor(src) {
  const env = "## Environment / tooling notes";
  const envIdx = src.indexOf(env);
  if (envIdx === -1) return -1;
  const before = src.slice(0, envIdx);
  const rule = before.lastIndexOf("\n---\n");
  if (rule === -1) return -1;
  return rule;
}

if (!existsSync(logPath)) {
  console.warn("[change-log] docs/change-log.md missing; skip append.");
  process.exit(0);
}

/** Normalize CRLF so anchors and row insertion stay reliable on Windows. */
function normalizeNewlines(s) {
  return s.replace(/\r\n/g, "\n");
}

const hash = execSync("git rev-parse --short=7 HEAD", {
  cwd: root,
  encoding: "utf8",
}).trim();
const subject = execSync("git log -1 --format=%s", {
  cwd: root,
  encoding: "utf8",
}).trim();
const date = execSync("git log -1 --format=%cs", {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .slice(0, 10);

const body = normalizeNewlines(readFileSync(logPath, "utf8"));
const idx = findPart2InsertAnchor(body);
if (idx === -1) {
  console.warn("[change-log] Part 2 insert anchor not found; skip append.");
  process.exit(0);
}

const part2Marker = "## Part 2 — CS Practice Room App (this repo)";
const p2 = body.indexOf(part2Marker);
if (p2 !== -1) {
  const part2ThroughAnchor = body.slice(p2, idx);
  const dataRows = part2ThroughAnchor
    .split("\n")
    .filter((line) => /^\| `[a-f0-9]{7,40}` \|/.test(line));
  const lastLine = dataRows[dataRows.length - 1];
  const prev = lastLine?.match(/^\| `([a-f0-9]{7,40})` \|/);
  if (prev?.[1] === hash) {
    process.exit(0);
  }
}

const head = body.slice(0, idx);

const attribution = process.env.CHANGE_LOG_ATTRIBUTION ?? "post-commit hook";
const safeSubject = subject.replace(/\|/g, " — ").replace(/\*\*/g, "");
const summary = `**${safeSubject}**`;
const row = `| \`${hash}\` | ${date}       | ${summary} | ${attribution} |\n`;

const tail = body.slice(idx);
const next = `${head.trimEnd()}\n${row}${tail.startsWith("\n") ? "" : "\n"}${tail}`;
writeFileSync(logPath, next, "utf8");
console.log(`[change-log] appended Part 2 row for \`${hash}\`.`);
