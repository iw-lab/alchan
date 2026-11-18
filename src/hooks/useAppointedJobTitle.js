// 교사가 «임명»한 직업 중 이 직함이 있는가 — 화면 표시용(실제 권한은 서버 transferPower.js 가 다시 판정한다).
//   학생이 스스로 고른 직업(selectedJobIds)은 보지 않는다 — 대통령 같은 임명 전용 권력직 게이팅용.
//   학급 jobs 는 Dashboard 가 `jobs_{classCode}` 로 캐싱한 것을 읽기만 하고(쓰지 않는다 — AlchanSidebar 주석), 없으면 한 번 읽는다.
import { useEffect, useState } from "react";
import { fetchClassJobs } from "../firebase/db/jobApplications";
import globalCacheService from "../services/globalCacheService";
import { toJobIdArray } from "../utils/jobPermissions";

export default function useAppointedJobTitle(userDoc, title) {
  const [has, setHas] = useState(false);
  const classCode = userDoc?.classCode;
  const isAdmin = !!(userDoc?.isAdmin || userDoc?.isSuperAdmin);
  // userDoc 은 매 스냅숏마다 새 객체 — 임명 목록 문자열로만 다시 잰다(읽기 폭주 방지)
  const appointedKey = toJobIdArray(userDoc?.appointedJobIds).join(",");
  useEffect(() => {
    if (isAdmin || !appointedKey || !classCode) { setHas(false); return undefined; }
    const ids = appointedKey.split(",");
    const pick = (jobs) => jobs.some((j) => ids.includes(j.id) && j.title === title);
    const cached = globalCacheService.get(`jobs_${classCode}`);
    if (cached) { setHas(pick(cached)); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const jobs = await fetchClassJobs(classCode);
        if (!cancelled) setHas(pick(jobs));
      } catch { /* 표시용 — 못 읽으면 숨긴다 */ }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, appointedKey, classCode, title]);
  return has;
}
