// 돈·쿠폰 보내기/가져오기 권한 — 서버 단일 진실원(adminCashAction·adminCouponAction 공용).
//   · 관리자(교사)
//   · 교사가 학생에게 준 위임(delegatedPermissions.moneyTransfer / couponTransfer)
//   · 교사가 임명한 대통령(2026-11-17 사용자 «대통령은 보내기 가져오기 관리자 기능을 열어줘» — 돈·쿠폰 둘 다)
//     대통령은 임명 전용 직업이라 hasJobTitle 이 appointedJobIds 로만 센다 — 학생이 스스로 고른 대통령은 안 된다.
const { db } = require("./utils");
const { buildJobMap, hasJobTitle } = require("./jobUtils");

const TRANSFER_JOB_TITLE = "대통령";

/**
 * @param {object} userData 호출자 users 문서
 * @param {string} classCode 호출자 학급
 * @param {"moneyTransfer"|"couponTransfer"} kind
 * @param {boolean} isAdmin hasAdminPower(userData)
 * @return {Promise<{allowed:boolean,isAdmin:boolean,byDelegation:boolean,byJob:boolean}>}
 */
async function transferPowerOf(userData, classCode, kind, isAdmin) {
  if (isAdmin) return { allowed: true, isAdmin: true, byDelegation: false, byJob: false };
  const byDelegation = userData?.delegatedPermissions?.[kind] === true;
  let byJob = false;
  // 위임과 대통령을 둘 다 가진 학생도 대통령으로 센다 — byJob 은 마이너스 회수 권한을 가른다(index.js allowNegativeTake).
  if (classCode) {
    const jobsSnap = await db.collection("jobs").where("classCode", "==", classCode).get();
    byJob = hasJobTitle(userData, buildJobMap(jobsSnap), TRANSFER_JOB_TITLE);
  }
  return { allowed: byDelegation || byJob, isAdmin: false, byDelegation, byJob };
}

module.exports = { transferPowerOf, TRANSFER_JOB_TITLE };
