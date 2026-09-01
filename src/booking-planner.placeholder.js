import { rankShowtimes, chooseBestSeatBlock, validatePartySize } from "./preference-engine.js";

/**
 * 실제 CGV DOM 연동 전 단계의 예약 의사결정 엔진.
 * showtimes / seats 데이터는 추후 Playwright scraper가 채웁니다.
 */
export function buildBookingPlan({ showtimes, seatsByShowtimeId, preferences }) {
  const partySize = validatePartySize(preferences.partySize);
  const ranked = rankShowtimes(showtimes, preferences);

  for (const showtime of ranked) {
    const seats = seatsByShowtimeId[showtime.id] || [];
    const block = chooseBestSeatBlock(seats, partySize, preferences);
    if (block) {
      return {
        showtime,
        partySize,
        seatBlock: block,
        reason: "Highest-ranked showtime with the closest contiguous seats to the center of row K (or fallback row)."
      };
    }
  }

  return null;
}
