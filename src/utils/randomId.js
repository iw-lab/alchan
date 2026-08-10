/**
 * 멱등키용 UUID v4 — **구형 기기에서도 터지지 않는** 버전.
 *
 * ⚠️ `crypto.randomUUID()` 는 Safari 15.4(2022-03) 부터다. 그런데 이 앱의
 *    vite.config.js `build.target` 은 `safari13` 이다 — 학교에 굴러다니는 낡은
 *    아이패드까지 받겠다고 일부러 낮춰 둔 값이다. 그런 기기에서 `crypto.randomUUID()`
 *    를 그냥 부르면 `TypeError: ... is not a function` 이 나고, 그걸 감싼 **결제·구매
 *    호출 자체가 실패**한다. 빌드는 통과하고 최신 기기에선 멀쩡하니 티도 안 난다.
 *
 * 그래서 3단으로 내려간다:
 *   ① crypto.randomUUID()            — 최신 브라우저
 *   ② crypto.getRandomValues()       — Chrome 11 / Safari 6.1 수준까지 내려간다
 *   ③ Math.random()                  — 마지막 보루
 * ②·③ 도 v4 형식을 지키므로 서버(idempotencyKey 검증)가 그대로 받는다.
 *
 * ⚠️ ③ 은 암호학적으로 안전하지 않다. 이 값의 용도는 **중복 요청 구분**뿐이고
 *    비밀이 아니므로 괜찮다. 토큰·비밀번호 생성에 쓰지 말 것.
 */
export function randomId() {
  const c = typeof crypto !== "undefined" ? crypto : undefined;

  if (typeof c?.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 v4: 버전(13번째 니블)=4, variant(17번째 니블)=8~b
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
