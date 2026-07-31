const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";
const NOTION_PUBLIC_PAGE_API = "https://www.notion.so/api/v3/loadPageChunk";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function notionRequest(path, { token, fetchImpl = fetch, method = "GET", body } = {}) {
  const url = `${NOTION_API_BASE}${path}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION
      },
      body: body == null ? undefined : JSON.stringify(body)
    });

    if (response.ok) {
      if (response.status === 204) return null;
      return response.json();
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 4) {
      const details = await response.text();
      throw new Error(`Notion API ${response.status}: ${details || response.statusText}`);
    }

    // 429 代表請求太快；Retry-After 是伺服器建議等待的秒數。
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter)
      ? Math.max(retryAfter * 1000, 500)
      : 750 * 2 ** attempt;
    await wait(delay);
  }

  throw new Error("Notion API request exhausted all retries.");
}

async function hydratePages(pages, options) {
  const hydrated = [];

  for (const page of pages) {
    if (page?.properties) {
      hydrated.push(page);
    } else {
      hydrated.push(await notionRequest(`/pages/${page.id}`, options));
    }
  }

  return hydrated;
}

/**
 * View Query 是 Notion 依照指定畫面順序產生的一份暫存查詢。
 * queryId 類似臨時取件號碼，讀完所有分頁後就把它刪除。
 */
export async function queryNotionView({ viewId, token, fetchImpl = fetch }) {
  const encodedViewId = encodeURIComponent(viewId);
  let queryId;

  try {
    const firstPage = await notionRequest(`/views/${encodedViewId}/queries`, {
      token,
      fetchImpl,
      method: "POST",
      body: { page_size: 100 }
    });

    queryId = firstPage.id;
    const pages = [...(firstPage.results ?? [])];
    let cursor = firstPage.next_cursor;
    let hasMore = Boolean(firstPage.has_more);

    while (hasMore) {
      const search = new URLSearchParams({ page_size: "100", start_cursor: cursor });
      const nextPage = await notionRequest(
        `/views/${encodedViewId}/queries/${encodeURIComponent(queryId)}?${search}`,
        { token, fetchImpl }
      );
      pages.push(...(nextPage.results ?? []));
      cursor = nextPage.next_cursor;
      hasMore = Boolean(nextPage.has_more);
    }

    return hydratePages(pages, { token, fetchImpl });
  } finally {
    if (queryId) {
      await notionRequest(
        `/views/${encodedViewId}/queries/${encodeURIComponent(queryId)}`,
        { token, fetchImpl, method: "DELETE" }
      );
    }
  }
}

function hyphenateNotionId(value, label) {
  const compact = String(value ?? "").replaceAll("-", "");

  if (!/^[0-9a-f]{32}$/iu.test(compact)) {
    throw new Error(`${label} 不是有效的 Notion ID。`);
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20)
  ].join("-");
}

/**
 * Notion 的 View Query 會套用篩選條件，卻不保證保留使用者拖曳的列順序。
 * 公開 Notion 頁面的 View 設定另有 page_sort；它是一份依畫面順序排列的 Page ID 清單。
 * 這裡只讀取公開設定，不需要也不會傳送 internal connection 的權杖。
 */
export async function queryPublicViewOrder({ databaseId, viewId, fetchImpl = fetch }) {
  const pageId = hyphenateNotionId(databaseId, "databaseId");
  const normalizedViewId = hyphenateNotionId(viewId, "viewId");
  const response = await fetchImpl(NOTION_PUBLIC_PAGE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `無法讀取公開 Notion View 排序（${response.status}）：${details || response.statusText}`
    );
  }

  const payload = await response.json();
  const entry = payload?.recordMap?.collection_view?.[normalizedViewId];
  const view = entry?.value?.value ?? entry?.value ?? entry;
  const pageOrder = view?.page_sort;

  if (!Array.isArray(pageOrder) || pageOrder.length === 0) {
    throw new Error(
      "公開 Notion View 沒有提供 page_sort。為避免發布錯誤的前方人數，本次同步已停止。"
    );
  }

  return pageOrder.map((id) => hyphenateNotionId(id, "page_sort Page ID"));
}

/**
 * pageOrder 像是點名簿上的座號順序；pages 則是每位同學的完整資料。
 * 程式先用 Page ID 把兩者配對，再依點名簿順序重排完整資料。
 */
export function orderPagesByView(pages, pageOrder) {
  const orderIndex = new Map(
    pageOrder.map((id, index) => [hyphenateNotionId(id, "page_sort Page ID"), index])
  );
  const missingPages = pages.filter(
    (page) => !orderIndex.has(hyphenateNotionId(page?.id, "Notion Page ID"))
  );

  if (missingPages.length > 0) {
    throw new Error(
      `有 ${missingPages.length} 筆 View 資料不在 page_sort 中。為避免發布錯誤的前方人數，本次同步已停止。`
    );
  }

  return [...pages].sort(
    (left, right) =>
      orderIndex.get(hyphenateNotionId(left.id, "Notion Page ID")) -
      orderIndex.get(hyphenateNotionId(right.id, "Notion Page ID"))
  );
}
