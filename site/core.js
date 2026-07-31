/**
 * 「正規化」是把外觀不同、實際意義相同的輸入改成一致格式。
 * 例如全形英文字、大小寫與重複空白，都會在這裡整理掉。
 */
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("zh-Hant-TW");
}

function parseKnownSocialUrl(value) {
  let candidate = String(value ?? "").trim();

  if (
    !/^[a-z][a-z\d+.-]*:\/\//iu.test(candidate) &&
    /^(?:(?:www|m)\.)?(?:facebook\.com|plurk\.com)\//iu.test(candidate)
  ) {
    candidate = `https://${candidate}`;
  }

  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function cleanPath(pathname) {
  return pathname.replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "");
}

/**
 * Set 是「不會放入重複值的集合」。同一個帳號可以有數種網址寫法，
 * 用 Set 收集後，查詢時就不會因為重複鍵值而多做工作。
 */
export function lookupKeys(value) {
  const keys = new Set();
  const normalized = normalizeText(value);

  if (!normalized) {
    return keys;
  }

  keys.add(normalized);
  const parsed = parseKnownSocialUrl(value);

  if (!parsed) {
    return keys;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const path = cleanPath(parsed.pathname);
  const segments = path.split("/").filter(Boolean);

  if (hostname === "plurk.com") {
    const rawUid = segments[0]?.toLowerCase() === "u" ? segments[1] : segments[0];
    const uid = normalizeText(rawUid);
    const reserved = new Set(["", "p", "portal", "search", "login", "signup"]);

    if (uid && !reserved.has(uid)) {
      keys.add(uid);
      keys.add(`plurk.com/${uid}`);
      keys.add(`plurk.com/u/${uid}`);
      keys.add(`https://plurk.com/${uid}`);
      keys.add(`https://plurk.com/u/${uid}`);
    }
  }

  if (hostname === "facebook.com" || hostname === "m.facebook.com") {
    if (segments[0]?.toLowerCase() === "profile.php") {
      const numericId = normalizeText(parsed.searchParams.get("id"));
      if (numericId) {
        keys.add(numericId);
        keys.add(`facebook.com/profile.php?id=${numericId}`);
        keys.add(`https://facebook.com/profile.php?id=${numericId}`);
      }
      return keys;
    }

    if (segments[0]?.toLowerCase() === "share" && segments[1]) {
      const shareCode = normalizeText(segments[1]);
      keys.add(`facebook.com/share/${shareCode}`);
      keys.add(`https://facebook.com/share/${shareCode}`);
      return keys;
    }

    const username = normalizeText(segments[0]);
    const reserved = new Set([
      "",
      "groups",
      "pages",
      "photo",
      "photos",
      "reel",
      "reels",
      "share",
      "sharer",
      "story.php",
      "watch"
    ]);

    if (username && !reserved.has(username)) {
      keys.add(username);
      keys.add(`facebook.com/${username}`);
      keys.add(`https://facebook.com/${username}`);
    }
  }

  return keys;
}

/**
 * 這個函式把相鄰且同年度、同月份的委託放進同一組。
 * 保留原本陣列順序，側欄才會和 Notion 排單由上到下完全一致。
 */
export function groupQueueRecords(records) {
  const groups = [];

  for (const record of records) {
    const month = record.month || "未分月";
    const previousGroup = groups.at(-1);

    if (previousGroup?.year === record.year && previousGroup.month === month) {
      previousGroup.records.push(record);
      continue;
    }

    groups.push({ year: record.year, month, records: [record] });
  }

  return groups;
}
