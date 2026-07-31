import test from "node:test";
import assert from "node:assert/strict";
import {
  orderPagesByView,
  queryNotionView,
  queryPublicViewOrder
} from "../src/notion.mjs";

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

test("公開 View 設定會提供畫面手動排序的 Page ID", async () => {
  const databaseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const viewId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return response({
      recordMap: {
        collection_view: {
          [viewId]: {
            value: {
              value: {
                page_sort: [
                  "22222222-2222-2222-2222-222222222222",
                  "11111111-1111-1111-1111-111111111111"
                ]
              }
            }
          }
        }
      }
    });
  };

  const pageOrder = await queryPublicViewOrder({ databaseId, viewId, fetchImpl });
  const sentBody = JSON.parse(request.options.body);

  assert.match(request.url, /loadPageChunk$/u);
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(sentBody.pageId, databaseId);
  assert.deepEqual(pageOrder, [
    "22222222-2222-2222-2222-222222222222",
    "11111111-1111-1111-1111-111111111111"
  ]);
});

test("完整頁面會依 page_sort 重排", () => {
  const pages = [
    { id: "11111111-1111-1111-1111-111111111111" },
    { id: "22222222-2222-2222-2222-222222222222" }
  ];
  const pageOrder = [
    "22222222-2222-2222-2222-222222222222",
    "11111111-1111-1111-1111-111111111111"
  ];

  assert.deepEqual(
    orderPagesByView(pages, pageOrder).map((page) => page.id),
    pageOrder
  );
});

test("缺少畫面排序時拒絕產生可能錯誤的前方人數", () => {
  assert.throws(
    () =>
      orderPagesByView(
        [{ id: "11111111-1111-1111-1111-111111111111" }],
        ["22222222-2222-2222-2222-222222222222"]
      ),
    /本次同步已停止/u
  );
});
