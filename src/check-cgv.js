import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const statePath = path.join(ROOT, "data", "state.json");

const cfg = {
  theaterName: process.env.CGV_THEATER_NAME || "용산아이파크몰",
  formatKeyword: process.env.CGV_FORMAT_KEYWORD || "IMAX",
  bookingUrl: process.env.CGV_BOOKING_URL || "https://cgv.co.kr/",
  knownDateWindowDays: Number(process.env.CGV_DATE_WINDOW_DAYS || "21")
};

function normalizeDateText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDateCandidates(text) {
  const out = new Set();

  // 2026.09.03 / 2026-09-03 / 2026/09/03
  for (const m of text.matchAll(/\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/g)) {
    const [, y, mo, d] = m;
    out.add(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  // 9월 3일 형태. 연도는 현재 한국시간 기준 연도로 보정.
  const now = new Date();
  const kstYear = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" }).format(now)
  );
  for (const m of text.matchAll(/(?<!\d)(1[0-2]|0?[1-9])\s*월\s*(3[01]|[12]?\d)\s*일/g)) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    out.add(`${kstYear}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  return [...out].sort();
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch {
    return { seenDates: [], lastCheckedAt: null };
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 1200 }
  });
  const page = await context.newPage();

  try {
    await page.goto(cfg.bookingUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);

    // 1차 버전은 CGV 화면 텍스트 기반의 보수적 감지 골격입니다.
    // 실제 예매 페이지 DOM이 확정되면 이 부분을 '예매 가능한 날짜 버튼' 셀렉터로 교체합니다.
    const bodyText = normalizeDateText(await page.locator("body").innerText());

    // 용산/IMAX 키워드가 페이지에 모두 있는 경우에만 날짜 후보를 채택.
    const theaterFound = bodyText.includes(cfg.theaterName);
    const imaxFound = bodyText.toUpperCase().includes(cfg.formatKeyword.toUpperCase());

    const dates = theaterFound && imaxFound ? extractDateCandidates(bodyText) : [];

    const state = await loadState();
    const oldDates = new Set(state.seenDates || []);
    const newDates = dates.filter(d => !oldDates.has(d));

    const nextState = {
      seenDates: [...new Set([...(state.seenDates || []), ...dates])].sort(),
      lastCheckedAt: new Date().toISOString(),
      lastObservation: {
        theaterFound,
        imaxFound,
        detectedDates: dates
      }
    };
    await saveState(nextState);

    console.log(JSON.stringify({
      theater: cfg.theaterName,
      format: cfg.formatKeyword,
      theaterFound,
      imaxFound,
      detectedDates: dates,
      newDates
    }, null, 2));

    if (newDates.length > 0) {
      // GitHub Actions가 이 값을 읽어 Issue를 생성합니다.
      console.log(`::notice title=CGV IMAX 신규 예매일::${newDates.join(", ")}`);
      await fs.writeFile(
        path.join(ROOT, "data", "new_dates.txt"),
        newDates.join("\n") + "\n",
        "utf8"
      );
    } else {
      try { await fs.unlink(path.join(ROOT, "data", "new_dates.txt")); } catch {}
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
