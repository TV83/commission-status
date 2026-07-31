const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";

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

