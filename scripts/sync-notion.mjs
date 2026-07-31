import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDataset } from "../src/core.mjs";
import {
  orderPagesByView,
  queryNotionView,
  queryPublicViewOrder
} from "../src/notion.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "site", "data", "commissions.json");

function parseSources(value) {
  let sources;

  try {
    sources = JSON.parse(value);
  } catch (error) {
    throw new Error(`NOTION_SOURCES_JSON 不是有效的 JSON：${error.message}`);
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("NOTION_SOURCES_JSON 至少需要一個年度來源。");
  }

  return sources.map((source, index) => {
    const year = Number(source.year);
    if (!Number.isInteger(year) || !source.databaseId || !source.viewId) {
      throw new Error(`第 ${index + 1} 個來源缺少有效的 year、databaseId 或 viewId。`);
    }
    return {
      ...source,
      year,
      databaseId: String(source.databaseId),
      viewId: String(source.viewId)
    };
  });
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  const sources = parseSources(process.env.NOTION_SOURCES_JSON ?? "");

  if (!token) {
    throw new Error("缺少 NOTION_TOKEN。請在 GitHub Actions Secret 中設定它。");
  }

  const resolvedSources = [];
  for (const source of sources) {
    // 兩個讀取工作彼此獨立，所以同時執行可以縮短 GitHub Actions 的等待時間。
    const [pages, pageOrder] = await Promise.all([
      queryNotionView({ viewId: source.viewId, token }),
      queryPublicViewOrder({
        databaseId: source.databaseId,
        viewId: source.viewId
      })
    ]);
    resolvedSources.push({
      year: source.year,
      pages: orderPagesByView(pages, pageOrder)
    });
  }

  const dataset = buildDataset(resolvedSources);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.log(`Synced ${dataset.records.length} active commission records.`);
}

await main();
