/**
 * 다음 단계용 자리표시자.
 *
 * 원칙:
 * 1) 계정/비밀번호를 코드에 하드코딩하지 않는다.
 * 2) GitHub Secrets 또는 영속 브라우저 세션(storageState)을 사용한다.
 * 3) CAPTCHA / 추가 기기 인증 / 보안 챌린지가 나타나면 중단한다.
 * 4) 결제 단계는 사용자가 원하는 정책(결제 직전 중지 vs 자동결제)을 별도로 정한다.
 */
export async function ensureLoggedIn(page) {
  throw new Error(
    "Kakao/CGV login is intentionally not implemented in the scaffold yet."
  );
}
