import { lookupKeys, normalizeText } from "../site/core.js";

export { lookupKeys, normalizeText };

export function notionPropertyText(property) {
  if (!property || typeof property !== "object") {
    return "";
  }

  const richText = (parts) =>
    Array.isArray(parts)
      ? parts.map((part) => part?.plain_text ?? part?.text?.content ?? "").join("")
      : "";

  switch (property.type) {
    case "title":
      return richText(property.title);
    case "rich_text":
      return richText(property.rich_text);
    case "url":
      return property.url ?? "";
    case "select":
      return property.select?.name ?? "";
    case "status":
      return property.status?.name ?? "";
    case "multi_select":
      return (property.multi_select ?? []).map((option) => option.name).join("、");
    case "number":
      return property.number == null ? "" : String(property.number);
    case "formula": {
      const formula = property.formula;
      if (!formula) return "";
      if (formula.type === "string") return formula.string ?? "";
      if (formula.type === "number") return formula.number == null ? "" : String(formula.number);
      if (formula.type === "boolean") return formula.boolean ? "是" : "否";
      if (formula.type === "date") return formula.date?.start ?? "";
      return "";
    }
    default:
      return "";
  }
}

export function pagePropertyText(page, propertyName) {
  return notionPropertyText(page?.properties?.[propertyName]);
}

export function normalizeStatus(value) {
  const status = normalizeText(value);

  if (status === "未着手" || status === "未著手") {
    return "未著手";
  }

  if (status === "進行中") {
    return "進行中";
  }

  return null;
}

function rowFromPage(page, year) {
  const clientName = pagePropertyText(page, "委託人").trim();
  const contact = pagePropertyText(page, "聯絡方式").trim();
  const item = pagePropertyText(page, "委託項目").trim() || "未標示項目";
  const status = normalizeStatus(pagePropertyText(page, "進度"));

  if (!status || !clientName) {
    return null;
  }

  const keys = new Set(lookupKeys(contact));
  const normalizedName = normalizeText(clientName);
  if (normalizedName) keys.add(normalizedName);

  return {
    year,
    item,
    status,
    keys: [...keys],
    // personKey 只在同步時計算人數使用，不會輸出成網站欄位。
    personKey: normalizedName || [...keys][0] || page.id
  };
}

/**
 * pages 的陣列順序就是 Notion View 顯示的順序。
 * 程式先保留有效列，再逐列往前查看尚未著手的不同委託人。
 */
export function buildDataset(sources, updatedAt = new Date().toISOString()) {
  const records = [];

  for (const source of sources) {
    const activeRows = source.pages
      .map((page) => rowFromPage(page, source.year))
      .filter(Boolean);

    for (let index = 0; index < activeRows.length; index += 1) {
      const current = activeRows[index];
      const peopleAhead = new Set();

      for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
        const previous = activeRows[previousIndex];
        if (previous.status === "未著手" && previous.personKey !== current.personKey) {
          peopleAhead.add(previous.personKey);
        }
      }

      records.push({
        keys: current.keys,
        year: current.year,
        item: current.item,
        status: current.status,
        peopleAhead: peopleAhead.size
      });
    }
  }

  return {
    schemaVersion: 1,
    updatedAt,
    records
  };
}

