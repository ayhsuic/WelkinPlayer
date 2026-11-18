#!/usr/bin/env node
/**
 * Copyright 2026 Atemukesu
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Build the GitHub Release body from the staged Android APKs: an optional
// changelog followed by a per-ABI "which file should I download?" guide
// generated from the actual uploaded filenames.
//
// Usage: node scripts/compose-release-notes.mjs --dist dist --tag v1.0.1 \
//          [--changelog changelog.md] [--out release-notes.md]

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : fallback;
}

const dist = arg("dist", "dist");
const tag = arg("tag");
const changelogFile = arg("changelog", "changelog.md");
const out = arg("out", "release-notes.md");

if (!tag) {
  console.error("usage: node scripts/compose-release-notes.mjs --dist dist --tag v1.0.1 [--changelog changelog.md] [--out release-notes.md]");
  process.exit(1);
}

/** Every uploaded file, by base name (signatures and the manifest excluded). */
function collect(dir) {
  if (!existsSync(dir)) return [];
  const names = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) names.push(...collect(full));
    else if (entry.isFile()) names.push(basename(full));
  }
  return names;
}

/** Canonical Android ABIs with their sort rank and human description. */
const ANDROID_ABIS = {
  "arm64-v8a": { rank: 0, hint: "绝大多数现代 64 位手机与平板" },
  "armeabi-v7a": { rank: 1, hint: "较旧的 32 位设备" },
  "x86_64": { rank: 2, hint: "模拟器或少数 x86 设备" },
  "x86": { rank: 2, hint: "模拟器或少数 x86 设备" },
  universal: { rank: 3, hint: "通用包，兼容多数设备但体积更大" },
};

function canonicalAbi(raw) {
  const token = String(raw).toLowerCase();
  if (token === "arm64-v8a" || token === "arm64") return "arm64-v8a";
  if (token === "armeabi-v7a" || token === "armeabi" || token === "arm") return "armeabi-v7a";
  if (token === "x86_64") return "x86_64";
  if (token === "x86") return "x86";
  return "universal";
}

/**
 * Resolve the canonical Android ABI of an APK asset name. The ABI token may
 * itself contain a hyphen (`arm64-v8a`), so substring scans for the known
 * long names first; the short token right before `.apk` (e.g. `-arm64.apk`)
 * is the fallback.
 */
function androidAbi(name) {
  const lower = name.toLowerCase();
  if (lower.includes("arm64-v8a") || lower.includes("aarch64") || /\barm64\b/.test(lower)) return "arm64-v8a";
  if (lower.includes("armeabi-v7a") || lower.includes("armeabi") || /\barmv7\b/.test(lower) || /\barm\b/.test(lower)) return "armeabi-v7a";
  if (lower.includes("x86_64")) return "x86_64";
  if (lower.includes("x86")) return "x86";
  const end = lower.match(/-([a-z0-9_]+)\.apk$/);
  if (end) return canonicalAbi(end[1]);
  return "universal";
}

const rows = [];
for (const name of collect(dist)) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".sig") || lower === "latest.json") continue;
  if (!lower.endsWith(".apk")) continue;
  const abi = androidAbi(name);
  const info = ANDROID_ABIS[abi];
  rows.push({ name, rank: info.rank, hint: info.hint });
}
rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

const changelog =
  changelogFile && existsSync(changelogFile) ? readFileSync(changelogFile, "utf8").trim() : "";

const guide = [
  "## 下载指引",
  "",
  "请根据你的设备选择对应 APK。文件名以 `.sig` 结尾的以及 `latest.json` 仅供自动更新使用，**无需下载**。",
  "",
];

if (rows.length > 0) {
  guide.push("| 平台 | 文件 | 说明 |", "| --- | --- | --- |");
  for (const file of rows) {
    const badge = file.rank === 0 ? "**推荐** — " : "";
    guide.push(`| Android | \`${file.name}\` | ${badge}${file.hint} |`);
  }
  guide.push("");
} else {
  guide.push("> 未在本次构建产物中找到可下载的安装包。", "");
}

guide.push("> 提示：不清楚该选哪个时，标有「**推荐**」的文件即为首选。", "");

const sections = [];
if (changelog) sections.push(changelog, "");
sections.push("---", "", ...guide);

writeFileSync(out, `${sections.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`);
console.log(`[notes] wrote ${out} (${rows.length} APK(s) listed) for ${tag}`);
