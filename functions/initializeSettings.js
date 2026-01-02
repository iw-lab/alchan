/* eslint-disable */
/**
 * 급여 및 직업 초기화 함수
 * 관리자가 한 번만 호출하는 초기화 함수
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {checkAuthAndGetUserData, db, admin, logger} = require("./utils");

// 🔥 학급별 급여 설정 초기화 (관리자 전용)
exports.initializeSalarySettings = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능
  const {classCode} = request.data;

  if (!classCode) {
    throw new HttpsError("invalid-argument", "classCode가 필요합니다.");
  }

  logger.info(`[급여 초기화] 관리자(UID: ${uid})가 ${classCode} 학급 급여 설정을 초기화합니다.`);

  try {
    // 기본 급여 설정
    const defaultSalaries = {
      "학급반장": 5000,
      "부반장": 4000,
      "경찰": 4500,
      "판사": 6000,
      "검사": 5500,
      "변호사": 5000,
      "교사": 5500,
      "의사": 6000,
      "간호사": 4500,
      "기자": 4000,
      "은행원": 4500,
      "회계사": 5000,
      "무직": 1000,
    };

    // Firestore에 저장
    const salaryRef = db.collection("classSettings")
      .doc(classCode)
      .collection("settings")
      .doc("salary");

    await salaryRef.set({
      ...defaultSalaries,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    logger.info(`[급여 초기화] ${classCode} 급여 설정 완료`);

    return {
      success: true,
      message: `${classCode} 학급의 급여 설정이 완료되었습니다.`,
      salaries: defaultSalaries,
    };
  } catch (error) {
    logger.error(`[급여 초기화] 오류:`, error);
    throw new HttpsError("internal", `급여 설정 초기화 실패: ${error.message}`);
  }
});

// 🔥 모든 학생에게 job 필드 추가 (관리자 전용)
exports.initializeStudentJobs = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능
  const {classCode} = request.data;

  if (!classCode) {
    throw new HttpsError("invalid-argument", "classCode가 필요합니다.");
  }

  logger.info(`[직업 초기화] 관리자(UID: ${uid})가 ${classCode} 학급 학생들의 직업을 초기화합니다.`);

  try {
    // 학급 학생들 조회
    const studentsSnapshot = await db.collection("users")
      .where("classCode", "==", classCode)
      .get();

    if (studentsSnapshot.empty) {
      return {
        success: true,
        message: "학생이 없습니다.",
        updatedCount: 0,
      };
    }

    // 배치로 업데이트
    const batch = db.batch();
    let updateCount = 0;

    studentsSnapshot.forEach(doc => {
      const student = doc.data();

      // job 필드가 없는 학생만 업데이트
      if (!student.job) {
        batch.update(doc.ref, {
          job: "무직", // 기본값
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        updateCount++;
      }
    });

    if (updateCount > 0) {
      await batch.commit();
      logger.info(`[직업 초기화] ${updateCount}명 학생의 job 필드 추가 완료`);
    }

    return {
      success: true,
      message: `${updateCount}명의 학생에게 job 필드가 추가되었습니다.`,
      updatedCount: updateCount,
      totalStudents: studentsSnapshot.size,
    };
  } catch (error) {
    logger.error(`[직업 초기화] 오류:`, error);
    throw new HttpsError("internal", `직업 필드 초기화 실패: ${error.message}`);
  }
});

// 🔥 전체 초기화 (급여 + 직업) - 한 번에 실행
exports.initializeAll = onCall({region: "asia-northeast3"}, async (request) => {
  const {uid} = await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능
  const {classCode} = request.data;

  if (!classCode) {
    throw new HttpsError("invalid-argument", "classCode가 필요합니다.");
  }

  logger.info(`[전체 초기화] 관리자(UID: ${uid})가 ${classCode} 학급을 초기화합니다.`);

  try {
    // 1. 급여 설정 초기화
    const defaultSalaries = {
      "학급반장": 5000,
      "부반장": 4000,
      "경찰": 4500,
      "판사": 6000,
      "검사": 5500,
      "변호사": 5000,
      "교사": 5500,
      "의사": 6000,
      "간호사": 4500,
      "기자": 4000,
      "은행원": 4500,
      "회계사": 5000,
      "무직": 1000,
    };

    const salaryRef = db.collection("classSettings")
      .doc(classCode)
      .collection("settings")
      .doc("salary");

    await salaryRef.set({
      ...defaultSalaries,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    // 2. 학생 job 필드 초기화
    const studentsSnapshot = await db.collection("users")
      .where("classCode", "==", classCode)
      .get();

    let updateCount = 0;

    if (!studentsSnapshot.empty) {
      const batch = db.batch();

      studentsSnapshot.forEach(doc => {
        const student = doc.data();

        if (!student.job) {
          batch.update(doc.ref, {
            job: "무직",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          updateCount++;
        }
      });

      if (updateCount > 0) {
        await batch.commit();
      }
    }

    logger.info(`[전체 초기화] ${classCode} 완료: 급여 설정 + ${updateCount}명 학생 job 필드 추가`);

    return {
      success: true,
      message: `${classCode} 학급 초기화 완료`,
      salariesSet: true,
      studentsUpdated: updateCount,
      totalStudents: studentsSnapshot.size,
      salaries: defaultSalaries,
    };
  } catch (error) {
    logger.error(`[전체 초기화] 오류:`, error);
    throw new HttpsError("internal", `전체 초기화 실패: ${error.message}`);
  }
});
