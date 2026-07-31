import {
  groupQueueRecords,
  lookupKeys,
  normalizeText
} from "./core.js?v=20260731-2";

const form = document.querySelector("#lookup-form");
const input = document.querySelector("#lookup-input");
const button = document.querySelector("#lookup-button");
const resultsPanel = document.querySelector("#results-panel");
const statusBox = document.querySelector("#lookup-status");
const resultsBox = document.querySelector("#results");
const resultCount = document.querySelector("#result-count");
const updatedAt = document.querySelector("#updated-at");
const queueTotal = document.querySelector("#queue-total");
const queueScroll = document.querySelector("#queue-scroll");
const queueLoading = document.querySelector("#queue-loading");
const queueList = document.querySelector("#queue-list");

let dataset = null;
const queueElements = new Map();

function setStatus(message) {
  statusBox.querySelector("span:last-child").textContent = message;
}

function showResultsPanel() {
  resultsPanel.hidden = false;
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

function formatDeadline(value) {
  if (!value) return "尚未設定";

  // Notion 的純日期格式是 YYYY-MM-DD；拆開顯示可避免跨時區後日期少一天。
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  if (match) {
    return `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日`;
  }

  return value;
}

function statusClass(status) {
  return status === "進行中" ? "is-active" : "is-waiting";
}

function clearResults() {
  resultsBox.replaceChildren();
  resultCount.textContent = "";
  resultCount.hidden = true;
}

function makeDetail(labelText, valueText) {
  const wrapper = document.createElement("div");
  wrapper.className = "result-detail";
  const label = document.createElement("dt");
  label.textContent = labelText;
  const value = document.createElement("dd");
  value.textContent = valueText;
  wrapper.append(label, value);
  return wrapper;
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
  badge.className = `status-badge ${statusClass(record.status)}`;
  badge.textContent = record.status;
  top.append(identity, badge);

  const details = document.createElement("dl");
  details.className = "result-details";
  details.append(
    makeDetail("最晚截稿日", formatDeadline(record.deadline)),
    makeDetail("付款狀態", record.paymentStatus)
  );

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

  article.append(top, details, ahead);
  return article;
}

function makeQueueItem(record, position) {
  const row = document.createElement("div");
  row.className = "queue-item";
  row.dataset.queueId = record.queueId;
  row.setAttribute("role", "listitem");

  const positionLabel = document.createElement("span");
  positionLabel.className = "queue-item-position";
  positionLabel.textContent = `#${String(position).padStart(2, "0")}`;

  const copy = document.createElement("div");
  copy.className = "queue-item-copy";
  const title = document.createElement("p");
  title.className = "queue-item-title";
  title.textContent = record.item;
  copy.append(title);

  const status = document.createElement("span");
  status.className = `queue-item-status ${statusClass(record.status)}`;
  status.textContent = record.status;

  row.append(positionLabel, copy, status);
  queueElements.set(record.queueId, row);
  return row;
}

function renderQueue(records) {
  queueList.replaceChildren();
  queueElements.clear();
  queueLoading.hidden = true;
  queueTotal.textContent = `${records.length} 筆`;

  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "queue-empty";
    empty.textContent = "目前沒有進行中或未著手的排單。";
    queueList.append(empty);
    return;
  }

  let position = 0;
  const groups = groupQueueRecords(records);

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "queue-month";

    const heading = document.createElement("div");
    heading.className = "queue-month-heading";
    const title = document.createElement("h3");
    title.textContent = `${group.year}・${group.month}`;
    const count = document.createElement("span");
    count.textContent = `${group.records.length} 筆`;
    heading.append(title, count);

    const list = document.createElement("div");
    list.className = "queue-items";
    list.setAttribute("role", "list");
    for (const record of group.records) {
      position += 1;
      list.append(makeQueueItem(record, position));
    }

    section.append(heading, list);
    queueList.append(section);
  }
}

function clearQueueHighlights() {
  for (const element of queueElements.values()) {
    element.classList.remove("is-highlighted");
    element.removeAttribute("aria-current");
  }
}

function highlightQueueRows(matches) {
  let firstMatch = null;

  for (const record of matches) {
    const element = queueElements.get(record.queueId);
    if (!element) continue;
    element.classList.add("is-highlighted");
    element.setAttribute("aria-current", "true");
    firstMatch ??= element;
  }

  if (!firstMatch) return;

  // 只捲動側欄本身，不把使用者從搜尋結果區域強制帶走。
  const itemBox = firstMatch.getBoundingClientRect();
  const scrollBox = queueScroll.getBoundingClientRect();
  const targetTop =
    queueScroll.scrollTop +
    itemBox.top -
    scrollBox.top -
    (scrollBox.height - itemBox.height) / 2;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  queueScroll.scrollTo({
    top: Math.max(0, targetTop),
    behavior: reduceMotion ? "auto" : "smooth"
  });
}

function runLookup(rawQuery) {
  showResultsPanel();
  clearResults();
  clearQueueHighlights();
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
  highlightQueueRows(matches);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!dataset) {
    showResultsPanel();
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
    if (loaded.schemaVersion !== 2 || !Array.isArray(loaded.records)) {
      throw new Error("Unsupported dataset schema");
    }

    dataset = loaded;
    renderQueue(dataset.records);
    updatedAt.textContent = `最近同步：${formatUpdatedAt(dataset.updatedAt)}`;
    setStatus("資料已準備好，請輸入查詢資料。");
  } catch (error) {
    console.error("Failed to load commission data", error);
    queueLoading.textContent = "目前無法讀取排單資料，請稍後再試。";
    queueTotal.textContent = "讀取失敗";
    setStatus("目前無法讀取排單資料，請稍後再試。");
    updatedAt.textContent = "最近同步：讀取失敗";
  } finally {
    button.disabled = false;
  }
}

loadDataset();
