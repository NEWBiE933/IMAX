function parseHHMM(value) {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
}

export function validatePartySize(partySize) {
  const n = Number(partySize);
  if (!Number.isInteger(n) || n < 1 || n > 4) {
    throw new Error(`partySize must be an integer from 1 to 4. Received: ${partySize}`);
  }
  return n;
}

export function isWeekend(dateLike) {
  const d = new Date(`${dateLike}T12:00:00+09:00`);
  const day = d.getUTCDay();
  // UTC conversion can shift the hour, but not the KST calendar date here due to explicit noon.
  return day === 0 || day === 6;
}

export function scoreShowtime(showtime, prefs) {
  const minutes = parseHHMM(showtime.startTime);
  const weekend = isWeekend(showtime.date);

  if (weekend) {
    const excluded = new Set(prefs.time.weekend.excludeStartHours || [23]);
    const hour = Math.floor(minutes / 60);
    if (excluded.has(hour)) return Number.NEGATIVE_INFINITY;
    return 1000 - minutes / 1440;
  }

  const from = parseHHMM(prefs.time.weekday.preferredStartFrom || "20:00");
  const before = parseHHMM(prefs.time.weekday.preferredStartBefore || "23:00");

  if (minutes >= from && minutes < before) {
    // 평일 선호 시간대 안에서는 20:00에 가까울수록 약간 높은 점수.
    return 2000 - (minutes - from);
  }

  // 선호 시간대 밖은 자동 제외가 아니라 낮은 점수로 유지.
  const distance = minutes < from ? from - minutes : minutes - before + 1;
  return 500 - distance;
}

export function rankShowtimes(showtimes, prefs) {
  return [...showtimes]
    .map(s => ({ ...s, preferenceScore: scoreShowtime(s, prefs) }))
    .filter(s => Number.isFinite(s.preferenceScore))
    .sort((a, b) => b.preferenceScore - a.preferenceScore);
}

function seatNumber(seat) {
  return Number(String(seat.number).replace(/\D/g, ""));
}

function buildBlocks(seats, partySize) {
  const byRow = new Map();
  for (const seat of seats.filter(s => s.available !== false)) {
    if (!byRow.has(seat.row)) byRow.set(seat.row, []);
    byRow.get(seat.row).push(seat);
  }

  const blocks = [];
  for (const [row, rowSeats] of byRow.entries()) {
    const sorted = rowSeats.sort((a, b) => seatNumber(a) - seatNumber(b));
    for (let i = 0; i <= sorted.length - partySize; i++) {
      const block = sorted.slice(i, i + partySize);
      const nums = block.map(seatNumber);
      const contiguous = nums.every((n, idx) => idx === 0 || n === nums[idx - 1] + 1);
      if (contiguous) blocks.push({ row, seats: block, numbers: nums });
    }
  }
  return blocks;
}

function rowPriority(row, prefs) {
  const preferred = prefs.seat.preferredRows || ["K"];
  const fallback = prefs.seat.fallbackRows || ["J", "L", "I", "M"];
  const p = preferred.indexOf(row);
  if (p >= 0) return p;
  const f = fallback.indexOf(row);
  if (f >= 0) return 100 + f;
  return 1000 + row.charCodeAt(0);
}

export function chooseBestSeatBlock(seats, partySize, prefs) {
  const count = validatePartySize(partySize);
  const blocks = buildBlocks(seats, count);
  if (!blocks.length) return null;

  // 각 열의 전체 좌석 번호 범위를 기준으로 중앙값 계산.
  const rowRanges = new Map();
  for (const seat of seats) {
    const n = seatNumber(seat);
    if (!rowRanges.has(seat.row)) rowRanges.set(seat.row, []);
    rowRanges.get(seat.row).push(n);
  }

  return blocks
    .map(block => {
      const nums = rowRanges.get(block.row).sort((a, b) => a - b);
      const rowCenter = (nums[0] + nums[nums.length - 1]) / 2;
      const blockCenter = (block.numbers[0] + block.numbers[block.numbers.length - 1]) / 2;
      const centerDistance = Math.abs(blockCenter - rowCenter);
      return {
        ...block,
        rowPriority: rowPriority(block.row, prefs),
        centerDistance
      };
    })
    .sort((a, b) =>
      a.rowPriority - b.rowPriority ||
      a.centerDistance - b.centerDistance ||
      a.numbers[0] - b.numbers[0]
    )[0];
}
