import { describe, it, expect } from "vitest";
import {
  isAppointedOnlyJob,
  toJobIdArray,
  getEffectiveJobIds,
  hasJobTitle,
} from "../../utils/jobPermissions";
// 서버 규약(진실원)도 같은 스펙으로 고정한다 — 클라/서버 규칙이 갈라지면 여기서 깨진다.
import {
  resolveStudentJobs,
  hasJobTitle as serverHasJobTitle,
} from "../../../functions/jobUtils";

// 2026-07-13 FULL 교차검증에서 확인된 결함의 회귀 테스트:
//   학생이 users 문서를 직접 write 해 selectedJobIds에 대통령 직업 id를 넣으면
//   주급 보너스(+200만/주)와 할일 승인 권한을 자가 획득할 수 있었다.
//   또 같은 id를 중복으로 넣으면 개수 상한과 대통령 보너스가 배수로 부풀려졌다.

const JOBS = [
  { id: "president", title: "대통령", appointedOnly: true },
  { id: "pm", title: "국무총리" }, // appointedOnly 플래그 없는 구버전 문서(fallback 목록으로 판정)
  { id: "police", title: "경찰" },
  { id: "farmer", title: "농부" },
  { id: "chef", title: "요리사" },
];

const jobMap = new Map(JOBS.map((j) => [j.id, j]));

describe("지정 전용 직업 판정", () => {
  it("appointedOnly 플래그 또는 fallback 직함이면 지정 전용", () => {
    expect(isAppointedOnlyJob(JOBS[0])).toBe(true); // 플래그
    expect(isAppointedOnlyJob(JOBS[1])).toBe(true); // fallback 직함
    expect(isAppointedOnlyJob(JOBS[2])).toBe(false);
  });

  it("존재하지 않는 직업(undefined)은 지정 전용이 아니다", () => {
    // 이 성질 때문에 클라이언트 필터만으로는 방어가 불가능했다 → 서버가 진실원이어야 하는 이유
    expect(isAppointedOnlyJob(undefined)).toBe(false);
  });
});

describe("toJobIdArray — 타입 오염 정규화", () => {
  it("배열이 아니어도 문자열 id 배열로 정규화한다", () => {
    expect(toJobIdArray(["a", "b"])).toEqual(["a", "b"]);
    expect(toJobIdArray({ a: true, b: true })).toEqual(["a", "b"]);
    expect(toJobIdArray(null)).toEqual([]);
    expect(toJobIdArray("farmer")).toEqual([]);
    expect(toJobIdArray(["a", 1, null, ""])).toEqual(["a"]);
  });
});

describe("서버 resolveStudentJobs — 급여·권한의 진실원", () => {
  it("학생이 selectedJobIds에 대통령을 넣어도 무효 (자가임명 차단)", () => {
    const user = { selectedJobIds: ["president", "farmer"], appointedJobIds: [] };
    const { selected, appointed, all } = resolveStudentJobs(user, jobMap, 5);

    expect(selected).toEqual(["farmer"]);
    expect(appointed).toEqual([]);
    expect(all).toEqual(["farmer"]);
    expect(serverHasJobTitle(user, jobMap, "대통령")).toBe(false);
  });

  it("교사가 지정한 대통령은 정상 인정된다", () => {
    const user = { selectedJobIds: ["farmer"], appointedJobIds: ["president"] };
    const { appointed, all } = resolveStudentJobs(user, jobMap, 5);

    expect(appointed).toEqual(["president"]);
    expect(all).toEqual(["president", "farmer"]);
    expect(serverHasJobTitle(user, jobMap, "대통령")).toBe(true);
  });

  it("중복 id는 제거된다 (상한·보너스 배수 부풀림 차단)", () => {
    const user = {
      selectedJobIds: ["farmer", "farmer", "farmer", "chef"],
      appointedJobIds: ["president", "president"],
    };
    const { selected, appointed } = resolveStudentJobs(user, jobMap, 5);

    expect(selected).toEqual(["farmer", "chef"]);
    expect(appointed).toEqual(["president"]); // 대통령 보너스는 1회만
  });

  it("삭제된 직업(유령 id)은 무시된다", () => {
    const user = { selectedJobIds: ["ghost", "farmer"], appointedJobIds: ["ghost"] };
    const { all } = resolveStudentJobs(user, jobMap, 5);
    expect(all).toEqual(["farmer"]);
  });

  it("개수 상한은 '지정 + 선택' 합계에 적용된다 (기존 경제 유지 — 대통령도 슬롯을 차지)", () => {
    const user = {
      selectedJobIds: ["farmer", "chef", "police"],
      appointedJobIds: ["president"],
    };
    const { selected, all } = resolveStudentJobs(user, jobMap, 2);

    // 상한 2 = 대통령(지정) 1 + 학생 선택 1
    expect(selected).toEqual(["farmer"]);
    expect(all).toEqual(["president", "farmer"]);
    expect(all.length).toBe(2);
  });

  it("지정 직업이 상한을 다 채우면 학생 선택분은 급여에서 인정되지 않는다", () => {
    const user = {
      selectedJobIds: ["farmer"],
      appointedJobIds: ["president", "pm"],
    };
    const { selected, all } = resolveStudentJobs(user, jobMap, 2);
    expect(selected).toEqual([]);
    expect(all).toEqual(["president", "pm"]);
  });

  it("권한 판정은 개수 상한에 좌우되지 않는다 (상한은 급여 장치이지 권한 장치가 아님)", () => {
    // 상한(5)을 넘겨 6번째로 고른 경찰도 경찰 권한은 가진다.
    const user = {
      selectedJobIds: ["farmer", "chef", "police"],
      appointedJobIds: ["president"],
    };
    // 상한 1 → 급여상 유효 직업은 대통령뿐이지만…
    expect(resolveStudentJobs(user, jobMap, 1).all).toEqual(["president"]);
    // …경찰 권한은 그대로 인정
    expect(serverHasJobTitle(user, jobMap, "경찰")).toBe(true);
  });

  it("appointedJobIds에 일반 직업을 섞어도 인정되지 않는다 (경로 오염 차단)", () => {
    const user = { selectedJobIds: [], appointedJobIds: ["farmer"] };
    const { appointed, all } = resolveStudentJobs(user, jobMap, 5);
    expect(appointed).toEqual([]);
    expect(all).toEqual([]);
  });

  it("타입이 오염돼도(객체·null) 터지지 않는다", () => {
    expect(
      resolveStudentJobs({ selectedJobIds: { farmer: true } }, jobMap, 5).all,
    ).toEqual(["farmer"]);
    expect(resolveStudentJobs({}, jobMap, 5).all).toEqual([]);
    expect(resolveStudentJobs(null, jobMap, 5).all).toEqual([]);
  });
});

describe("클라이언트 표시 헬퍼", () => {
  it("getEffectiveJobIds = 교사 지정 + 본인 선택 (중복 제거)", () => {
    expect(
      getEffectiveJobIds({
        appointedJobIds: ["president"],
        selectedJobIds: ["farmer", "farmer"],
      }),
    ).toEqual(["president", "farmer"]);
  });

  it("hasJobTitle은 두 필드를 모두 본다", () => {
    const president = { appointedJobIds: ["president"], selectedJobIds: [] };
    const farmer = { appointedJobIds: [], selectedJobIds: ["farmer"] };

    expect(hasJobTitle(president, JOBS, "대통령")).toBe(true);
    expect(hasJobTitle(farmer, JOBS, "대통령")).toBe(false);
    expect(hasJobTitle(farmer, JOBS, "농부")).toBe(true);
  });
});
