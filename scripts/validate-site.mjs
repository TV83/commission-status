import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "site/index.html",
  "site/styles.css",
  "site/app.js",
  "site/core.js",
  "site/data/commissions.json",
  "site/og.png"
];

for (const relativePath of requiredFiles) {
  await access(resolve(projectRoot, relativePath));
}

const dataset = JSON.parse(
  await readFile(resolve(projectRoot, "site/data/commissions.json"), "utf8")
);

if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.records)) {
  throw new Error("commissions.json 的資料格式不符合 schemaVersion 1。");
}

for (const record of dataset.records) {
  if (
    !Array.isArray(record.keys) ||
    !Number.isInteger(record.year) ||
    !record.item ||
    !["未著手", "進行中"].includes(record.status) ||
    !Number.isInteger(record.peopleAhead)
  ) {
    throw new Error("commissions.json 含有格式不完整的委託資料。");
  }
}

console.log(`Validated static site with ${dataset.records.length} records.`);

