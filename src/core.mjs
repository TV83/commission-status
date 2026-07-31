import { groupQueueRecords, lookupKeys, normalizeText } from "../site/core.js";

export { groupQueueRecords, lookupKeys, normalizeText };

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
    case "files":
      return (property.files ?? [])
        .map((file) => file?.external?.url ?? file?.name ?? "")
        .filter(Boolean)
        .join("\n");
    case "date":
      return property.date?.start ?? "";
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
  const contacts = pagePropertyText(page, "聯絡方式")
    .split(/\r?\n/gu)
    .map((value) => value.trim())
    .filter(Boolean);
  const item = pagePropertyText(page, "委託項目").trim() || "未標示項目";
  const status = normalizeStatus(pagePropertyText(page, "進度"));
  const month = pagePropertyText(page, "月份").trim() || "未分月";
  const deadline = pagePropertyText(page, "最晚截稿日").trim() || null;
  const paymentStatus = pagePropertyText(page, "付款狀態").trim() || "未標示";

  if (!status || !clientName) {
    return null;
  }

  // files 欄位可能放入多個外部網址；逐一解析，才能讓每個社群 ID 都可查詢。
  const keys = new Set(contacts.flatMap((contact) => [...lookupKeys(contact)]));
  const normalizedName = normalizeText(clientName);
  if (normalizedName) keys.add(normalizedName);

  return {
    queueId: `${year}-${page.id}`,
    year,
    month,
    item,
    status,
    deadline,
    paymentStatus,
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
        queueId: current.queueId,
        keys: current.keys,
        year: current.year,
        month: current.month,
        item: current.item,
        status: current.status,
        deadline: current.deadline,
        paymentStatus: current.paymentStatus,
        peopleAhead: peopleAhead.size
      });
    }
  }

  return {
    schemaVersion: 2,
    updatedAt,
    records
  };
}
