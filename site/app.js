import { lookupKeys, normalizeText } from "./core.js";

const form = document.querySelector("#lookup-form");
const input = document.querySelector("#lookup-input");
const button = document.querySelector("#lookup-button");
const statusBox = document.querySelector("#lookup-status");
const resultsBox = document.querySelector("#results");
const resultCount = document.querySelector("#result-count");
const updatedAt = document.querySelector("#updated-at");

let dataset = null;

function setStatus(message) {
  statusBox.querySelector("span:last-child").textContent = message;
}

function formatUpdatedAt(value) {
  if (!value) return "尚未完成首次同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "同步時間格式錯誤";

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei"
  }).format(date);
}

function clearResults() {
  resultsBox.replaceChildren();
  resultCount.textContent = "";
  resultCount.hidden = true;
}

function makeResultCard(record) {
  const article = document.createElement("article");
  article.className = "result-card";

  const top = document.createElement("div");
  top.className = "result-card-top";

  const identity = document.createElement("div");
  const year = document.createElement("p");
  year.className = "result-year";
  year.textContent = `${record.year} COMMISSION`;
  const item = document.createElement("p");
  item.className = "result-item";
  item.textContent = record.item;
  identity.append(year, item);

  const badge = document.createElement("span");
  badge.className = `status-badge ${record.status === "進行中" ? "is-active" : "is-waiting"}`;
  badge.textContent = record.status;
  top.append(identity, badge);

  const ahead = document.createElement("div");
  ahead.className = "ahead-row";
  const number = document.createElement("span");
  number.className = "ahead-number";
  number.textContent = String(record.peopleAhead);
  const label = document.createElement("span");
  label.className = "ahead-label";
  label.textContent =
    record.peopleAhead === 0
      ? "目前前方沒有尚未著手的委託人"
      : "位前方尚未著手的委託人";
  ahead.append(number, label);

  article.append(top, ahead);
  return article;
}

function runLookup(rawQuery) {
  clearResults();
  const query = normalizeText(rawQuery);

  if (!query) {
    setStatus("請先輸入 ID、網址或委託名稱。");
    input.focus();
    return;
  }

  const candidates = lookupKeys(rawQuery);
  const matches = dataset.records.filter((record) =>
    record.keys.some((key) => candidates.has(key))
  );

  if (matches.length === 0) {
    setStatus("沒有找到相符的有效委託，請確認輸入是否與委託時使用的資料一致。");
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "Facebook share 網址若無法辨識，也可以改用 Notion 排單上的委託名稱查詢。";
    resultsBox.append(empty);
    return;
  }

  setStatus(`找到 ${matches.length} 筆有效委託。`);
  resultCount.textContent = String(matches.length);
  resultCount.hidden = false;
  resultsBox.append(...matches.map(makeResultCard));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!dataset) {
    setStatus("資料仍在讀取中，請稍候再試。");
    return;
  }
  runLookup(input.value);
});

async function loadDataset() {
  button.disabled = true;

  try {
    const response = await fetch(`./data/commissions.json?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const loaded = await response.json();
    if (loaded.schemaVersion !== 1 || !Array.isArray(loaded.records)) {
      throw new Error("Unsupported dataset schema");
    }

    dataset = loaded;
    updatedAt.textContent = `最近同步：${formatUpdatedAt(dataset.updatedAt)}`;
    setStatus("資料已準備好，請輸入查詢資料。");
  } catch (error) {
    console.error("Failed to load commission data", error);
    setStatus("目前無法讀取排單資料，請稍後再試。");
    updatedAt.textContent = "最近同步：讀取失敗";
  } finally {
    button.disabled = false;
  }
}

loadDataset();
