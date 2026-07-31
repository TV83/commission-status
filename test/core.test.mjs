import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDataset,
  lookupKeys,
  normalizeStatus,
  normalizeText
} from "../src/core.mjs";

function page({ name, contact = "", item = "半身", status = "未着手" }) {
  return {
    id: `${name}-${item}`,
    properties: {
      委託人: { type: "title", title: [{ plain_text: name }] },
      聯絡方式: { type: "url", url: contact || null },
      委託項目: {
        type: "multi_select",
        multi_select: item.split("、").map((value) => ({ name: value }))
      },
      進度: { type: "status", status: { name: status } }
    }
  };
}

test("正規化全形字元、大小寫與多餘空白", () => {
  assert.equal(normalizeText("  ＡＢＣ   Test  "), "abc test");
});

test("Plurk 的常見網址都會產生相同 UID 查詢鍵", () => {
  const direct = lookupKeys("https://www.plurk.com/Ryan_uu");
  const withU = lookupKeys("https://plurk.com/u/Ryan_uu?ref=profile");
  assert.ok(direct.has("ryan_uu"));
  assert.ok(withU.has("ryan_uu"));
  assert.ok(withU.has("plurk.com/u/ryan_uu"));
});

test("Facebook username、numeric ID 與 share URL 都可正規化", () => {
  assert.ok(lookupKeys("https://m.facebook.com/AsaoiTsumugi/?ref=x").has("asaoitsumugi"));
  assert.ok(
    lookupKeys("https://www.facebook.com/profile.php?id=100014454815084&mibextid=x").has(
      "100014454815084"
    )
  );
  assert.ok(
    lookupKeys("https://www.facebook.com/share/1CtFywokB8/?mibextid=x").has(
      "facebook.com/share/1ctfywokb8"
    )
  );
});

test("狀態只接受未著手與進行中", () => {
  assert.equal(normalizeStatus("未着手"), "未著手");
  assert.equal(normalizeStatus("未著手"), "未著手");
  assert.equal(normalizeStatus("進行中"), "進行中");
  assert.equal(normalizeStatus("完了"), null);
});

test("前方人數排除進行中、完成與同一委託人，且每人只算一次", () => {
  const dataset = buildDataset(
    [
      {
        year: 2026,
        pages: [
          page({ name: "甲", contact: "https://plurk.com/alpha" }),
          page({ name: "甲", contact: "https://plurk.com/alpha", item: "第二件" }),
          page({ name: "乙", contact: "https://plurk.com/beta", status: "進行中" }),
          page({ name: "丙", contact: "https://plurk.com/gamma", status: "完了" }),
          page({ name: "丁", contact: "https://plurk.com/delta" })
        ]
      }
    ],
    "2026-07-31T00:00:00.000Z"
  );

  assert.equal(dataset.records.length, 4);
  assert.deepEqual(
    dataset.records.map((record) => record.peopleAhead),
    [0, 0, 1, 1]
  );
});

test("多年度資料各自重新計算排隊人數", () => {
  const dataset = buildDataset([
    { year: 2026, pages: [page({ name: "甲" }), page({ name: "乙" })] },
    { year: 2027, pages: [page({ name: "丙" }), page({ name: "丁" })] }
  ]);

  assert.deepEqual(
    dataset.records.map(({ year, peopleAhead }) => [year, peopleAhead]),
    [
      [2026, 0],
      [2026, 1],
      [2027, 0],
      [2027, 1]
    ]
  );
});

