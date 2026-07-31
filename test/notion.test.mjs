import test from "node:test";
import assert from "node:assert/strict";
import { queryNotionView } from "../src/notion.mjs";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

test("View Query 依序讀取所有分頁並刪除暫存查詢", async () => {
  const calls = [];
  const queued = [
    response({
      id: "query-1",
      results: [{ id: "page-1", properties: {} }],
      has_more: true,
      next_cursor: "cursor-1"
    }),
    response({
      results: [{ id: "page-2", properties: {} }],
      has_more: false,
      next_cursor: null
    }),
    response({ deleted: true })
  ];

  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    return queued.shift();
  };

  const pages = await queryNotionView({
    viewId: "view-1",
    token: "test-token",
    fetchImpl
  });

  assert.deepEqual(
    pages.map((page) => page.id),
    ["page-1", "page-2"]
  );
  assert.deepEqual(
    calls.map((call) => call.method),
    ["POST", "GET", "DELETE"]
  );
  assert.match(calls[1].url, /start_cursor=cursor-1/u);
});

