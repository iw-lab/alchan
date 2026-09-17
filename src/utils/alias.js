// src/utils/alias.js
// 학생 표시명을 **고르게** 만든다 — 타이핑 칸을 없애는 게 목적이다.
//
// 왜 자유 입력을 없앴나 (2026-09-17 실측):
//   닉네임 팝업이 자유 입력이라, 학생 62명 중 28명(45%)이 자기 실명을 적어 넣었다.
//   계정 생성 쪽은 이미 `name: id` 로 실명을 안 받고 있었는데, 학생이 직접 채운 것이다.
//   "실명 쓰지 마세요"라고 안내하는 방식은 이미 실패했다 — 쓸 칸이 있으면 쓴다.
//   그래서 막는 대신 **칸을 없앴다.** 수집하지 않은 것은 샐 수 없다.
//
// 왜 번호를 앞에 붙이나:
//   별칭만 쓰면 "누가 누군지 모르겠다"가 된다(사용자 지적). 출석번호는 교실에서 이미
//   모두가 아는 값이고, 학급코드가 랜덤 6자라 반 밖에서는 아무 의미가 없다.
//   번호가 반 안에서 유일하므로 **별칭이 겹쳐도 구분된다** — 중복검사가 필요 없다.

// 놀림거리가 될 수 있는 말(외모·체격·능력 비하)은 넣지 않는다.
export const ADJECTIVES = [
  "빠른", "용감한", "슬기로운", "친절한", "씩씩한", "명랑한",
  "상냥한", "부지런한", "반짝이는", "날쌘", "튼튼한", "포근한",
  "신나는", "멋진", "다정한", "노래하는", "춤추는", "꿈꾸는",
  "호기심많은", "정직한", "따뜻한", "든든한", "자유로운", "새콤한",
];

export const ANIMALS = [
  "다람쥐", "고양이", "강아지", "토끼", "사슴", "여우",
  "너구리", "판다", "수달", "펭귄", "돌고래", "고래",
  "거북이", "참새", "부엉이", "독수리", "호랑이", "사자",
  "코끼리", "기린", "얼룩말", "캥거루", "코알라", "하마",
  "물개", "알파카", "두더지", "고슴도치", "청설모", "오소리",
];

/** 만들 수 있는 별칭 가짓수 — 24 × 30 = 720. */
export const ALIAS_SPACE = ADJECTIVES.length * ANIMALS.length;

/**
 * 별칭 하나를 만든다. `rand` 는 [0,1) 을 돌려주는 함수(테스트에서 고정값 주입용).
 */
export const makeAlias = (rand = Math.random) => {
  const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length) % ADJECTIVES.length];
  const b = ANIMALS[Math.floor(rand() * ANIMALS.length) % ANIMALS.length];
  return `${a} ${b}`;
};

/**
 * 서로 다른 별칭 `count` 개를 뽑는다(고르기 화면용).
 * 가짓수보다 많이 요구하면 있는 만큼만 준다 — 무한루프로 갚지 않는다.
 */
export const makeAliasChoices = (count = 4, rand = Math.random) => {
  const want = Math.min(Math.max(1, count | 0), ALIAS_SPACE);
  const out = [];
  const seen = new Set();
  // 뽑기 실패가 이어져도 끝나도록 시도 횟수에 천장을 둔다.
  for (let i = 0; i < want * 40 && out.length < want; i++) {
    const v = makeAlias(rand);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

/**
 * 화면에 쓰는 표시명. 번호가 있으면 앞에 붙인다.
 *
 * 🔴 이 합친 문자열이 `users.name` 에 그대로 들어간다. 이름을 보여주는 곳이 329군데라
 *    표시할 때마다 번호를 합치게 만들면 그중 몇 곳은 반드시 빠진다(이 저장소의 전례:
 *    캐시 무효화를 N곳 중 M곳만 고쳐 재발한 적이 있다). 한 군데서 합쳐서 저장한다.
 */
export const buildDisplayName = (studentNumber, alias) => {
  const n = Number(studentNumber);
  const safeAlias = String(alias || "").trim();
  if (!Number.isInteger(n) || n <= 0) return safeAlias;
  return safeAlias ? `${n}번 ${safeAlias}` : `${n}번`;
};

/** 표시명에서 별칭 부분만 떼어낸다(고르기 화면에 현재 값을 표시할 때). */
export const stripNumberPrefix = (displayName) => {
  const s = String(displayName || "").trim();
  const m = s.match(/^\d+번\s*(.*)$/);
  return m ? m[1].trim() : s;
};
