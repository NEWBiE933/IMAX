import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();

const statePath =
  path.join(ROOT, "data", "state.json");

const cfg = {

  theaterName:
    process.env.CGV_THEATER_NAME ||
    "용산아이파크몰",

  formatKeyword:
    process.env.CGV_FORMAT_KEYWORD ||
    "IMAX",

  bookingUrl:
    process.env.CGV_BOOKING_URL ||
    "https://cgv.co.kr/cnm/bzplcCgv/0013001"
};


async function loadState() {

  try {

    return JSON.parse(
      await fs.readFile(
        statePath,
        "utf8"
      )
    );

  } catch {

    return {
      seenDates: [],
      lastCheckedAt: null
    };

  }

}


async function saveState(state) {

  await fs.mkdir(
    path.dirname(statePath),
    {
      recursive: true
    }
  );

  await fs.writeFile(
    statePath,
    JSON.stringify(
      state,
      null,
      2
    ) + "\n",
    "utf8"
  );

}


function normalizeText(text) {

  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();

}


function extractDates(text) {

  const dates =
    new Set();


  /*
   * 2026.09.05
   * 2026-09-05
   * 2026/09/05
   */

  for (
    const m of text.matchAll(
      /\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/g
    )
  ) {

    const year =
      m[1];

    const month =
      String(m[2])
        .padStart(2, "0");

    const day =
      String(m[3])
        .padStart(2, "0");


    dates.add(
      `${year}-${month}-${day}`
    );

  }


  /*
   * 9월 5일
   */

  const now =
    new Date();


  const currentYear =
    Number(

      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: "Asia/Seoul",
          year: "numeric"
        }
      ).format(now)

    );


  for (
    const m of text.matchAll(
      /(?<!\d)(1[0-2]|0?[1-9])\s*월\s*(3[01]|[12]?\d)\s*일/g
    )
  ) {

    const month =
      String(
        Number(m[1])
      ).padStart(2, "0");


    const day =
      String(
        Number(m[2])
      ).padStart(2, "0");


    dates.add(
      `${currentYear}-${month}-${day}`
    );

  }


  return [...dates].sort();

}


async function main() {

  console.log(
    "================================"
  );

  console.log(
    "CGV YONGSAN IMAX CHECK START"
  );

  console.log(
    "================================"
  );


  console.log(
    "TARGET URL:",
    cfg.bookingUrl
  );


  const browser =
    await chromium.launch({
      headless: true
    });


  const context =
    await browser.newContext({

      locale: "ko-KR",

      timezoneId: "Asia/Seoul",

      viewport: {
        width: 1440,
        height: 1200
      }

    });


  const page =
    await context.newPage();


  try {

    console.log(
      "Opening CGV..."
    );


    await page.goto(
      cfg.bookingUrl,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          60000
      }
    );


    /*
     * JS 렌더링 대기
     */

    await page.waitForTimeout(
      7000
    );


    console.log(
      "Current URL:",
      page.url()
    );


    console.log(
      "Page title:",
      await page.title()
    );


    const bodyText =
      normalizeText(

        await page
          .locator("body")
          .innerText()

      );


    /*
     * 디버깅용
     */

    console.log(
      "BODY LENGTH:",
      bodyText.length
    );


    console.log(
      "BODY SAMPLE:"
    );

    console.log(
      bodyText.slice(
        0,
        3000
      )
    );


    /*
     * 극장 판별
     */

    const theaterFound =

      bodyText.includes(
        "용산아이파크몰"
      );


    /*
     * IMAX 판별
     *
     * CGV 페이지에서
     * 아이맥스로 표시될 수도 있음
     */

    const imaxFound =

      bodyText
        .toUpperCase()
        .includes("IMAX")

      ||

      bodyText.includes(
        "아이맥스"
      );


    /*
     * 날짜 후보
     */

    const detectedDates =
      extractDates(
        bodyText
      );


    console.log(
      "--------------------------------"
    );

    console.log(
      "theaterFound:",
      theaterFound
    );

    console.log(
      "imaxFound:",
      imaxFound
    );

    console.log(
      "detectedDates:",
      detectedDates
    );

    console.log(
      "--------------------------------"
    );


    const state =
      await loadState();


    const oldDates =
      new Set(
        state.seenDates || []
      );


    const newDates =

      detectedDates.filter(

        date =>
          !oldDates.has(date)

      );


    const nextState = {

      seenDates:
        [
          ...new Set([
            ...(state.seenDates || []),
            ...detectedDates
          ])
        ].sort(),

      lastCheckedAt:
        new Date()
          .toISOString(),

      lastObservation: {

        url:
          page.url(),

        pageTitle:
          await page.title(),

        theaterFound,

        imaxFound,

        detectedDates

      }

    };


    await saveState(
      nextState
    );


    console.log(
      JSON.stringify(
        {
          theater:
            cfg.theaterName,

          format:
            cfg.formatKeyword,

          theaterFound,

          imaxFound,

          detectedDates,

          newDates
        },
        null,
        2
      )
    );


    if (
      newDates.length > 0
    ) {

      console.log(
        `::notice title=CGV IMAX 신규 날짜 후보::${newDates.join(", ")}`
      );


      await fs.writeFile(

        path.join(
          ROOT,
          "data",
          "new_dates.txt"
        ),

        newDates.join("\n")
          + "\n",

        "utf8"

      );

    } else {

      try {

        await fs.unlink(

          path.join(
            ROOT,
            "data",
            "new_dates.txt"
          )

        );

      } catch {

        /*
         * 파일이 없으면 정상
         */

      }

    }


  } finally {

    await context.close();

    await browser.close();

  }

}


main().catch(

  error => {

    console.error(
      error
    );

    process.exit(1);

  }

);
