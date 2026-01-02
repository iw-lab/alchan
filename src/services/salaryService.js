// src/services/salaryService.js
import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment,
  setDoc,
} from "firebase/firestore";

// 기본 세금 및 주급 인상률 설정
const DEFAULT_SETTINGS = {
  taxRate: 0.1, // 기본 세율 10%
  weeklySalaryIncreaseRate: 3.0, // 기본 주급 인상률 3%
  lastPaidDate: null,
};

/**
 * 급여 관련 설정을 Firestore에서 가져옵니다.
 * @param {string} classCode 학급 코드
 * @returns {Promise<object>} 급여 설정 객체
 */
export const getSalarySettings = async (classCode) => {
  if (!classCode) return DEFAULT_SETTINGS;
  const settingsRef = doc(db, `classes/${classCode}/settings/salary`);
  const docSnap = await getDoc(settingsRef);
  if (docSnap.exists()) {
    return { ...DEFAULT_SETTINGS, ...docSnap.data() };
  }
  return DEFAULT_SETTINGS;
};

/**
 * 급여 관련 설정을 Firestore에 저장합니다.
 * @param {string} classCode 학급 코드
 * @param {object} settings 저장할 설정
 */
export const saveSalarySettings = async (classCode, settings) => {
  if (!classCode) throw new Error("학급 코드가 필요합니다.");
  const settingsRef = doc(db, `classes/${classCode}/settings/salary`);
  await setDoc(settingsRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
};

/**
 * 모든 직업 목록을 가져옵니다.
 * @param {string} classCode 학급 코드
 * @returns {Promise<Array>} 직업 목록
 */
const getAllJobs = async (classCode) => {
  const jobsQuery = query(collection(db, "jobs"), where("classCode", "==", classCode));
  const querySnapshot = await getDocs(jobsQuery);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

/**
 * 특정 학급의 모든 학생 목록을 가져옵니다.
 * @param {string} classCode 학급 코드
 * @returns {Promise<Array>} 학생 목록
 */
const getAllStudents = async (classCode) => {
    const studentsQuery = query(
        collection(db, "users"),
        where("classCode", "==", classCode),
        where("isAdmin", "==", false) // 학생만 필터링
    );
    const querySnapshot = await getDocs(studentsQuery);
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};


/**
 * 주급을 지급하는 메인 함수
 * @param {string} classCode 학급 코드
 * @returns {Promise<{success: boolean, message: string, paidCount: number, totalPaid: number}>}
 */
export const payWeeklySalaries = async (classCode) => {
  console.log(`[${classCode}] 주급 지급 절차를 시작합니다.`);

  const settings = await getSalarySettings(classCode);
  const { taxRate, weeklySalaryIncreaseRate } = settings;

  const allJobs = await getAllJobs(classCode);
  const allStudents = await getAllStudents(classCode);
  
  if (allStudents.length === 0) {
    return { success: true, message: "주급을 받을 학생이 없습니다.", paidCount: 0, totalPaid: 0 };
  }

  const batch = writeBatch(db);
  let paidCount = 0;
  let totalPaid = 0;

  for (const student of allStudents) {
    if (student.selectedJobIds && student.selectedJobIds.length > 0) {
      let weeklySalary = 0;
      
      // 학생이 가진 각 직업에 대한 주급을 합산합니다.
      student.selectedJobIds.forEach(jobId => {
        const job = allJobs.find(j => j.id === jobId);
        if (job && job.weeklySalary) {
          weeklySalary += job.weeklySalary;
        }
      });

      if (weeklySalary > 0) {
        const taxAmount = Math.round(weeklySalary * taxRate);
        const netSalary = weeklySalary - taxAmount;
        
        const userRef = doc(db, "users", student.id);
        batch.update(userRef, {
          cash: increment(netSalary),
          lastSalaryDate: serverTimestamp(),
        });
        
        paidCount++;
        totalPaid += netSalary;
        
        console.log(`${student.name} 학생에게 주급 ${netSalary}원 (세금: ${taxAmount}원) 지급`);
      }
    }
  }

  // 모든 직업의 주급을 인상합니다.
  const increaseMultiplier = 1 + weeklySalaryIncreaseRate / 100;
  for (const job of allJobs) {
    if (job.weeklySalary) {
      const newSalary = Math.round(job.weeklySalary * increaseMultiplier);
      const jobRef = doc(db, "jobs", job.id);
      batch.update(jobRef, { weeklySalary: newSalary });
      console.log(`직업 [${job.title}] 주급 인상: ${job.weeklySalary}원 -> ${newSalary}원`);
    }
  }
  
  // 마지막 지급일 업데이트
  const settingsRef = doc(db, `classes/${classCode}/settings/salary`);
  batch.set(settingsRef, { lastPaidDate: serverTimestamp() }, { merge: true });

  await batch.commit();

  const message = `${paidCount}명의 학생에게 총 ${totalPaid.toLocaleString()}원의 주급이 지급되었고, 직업별 주급이 ${weeklySalaryIncreaseRate}% 인상되었습니다.`;
  console.log(message);
  
  return { success: true, message, paidCount, totalPaid };
};


/**
 * 주급 지급 스케줄러를 설정합니다.
 * @param {string} classCode 학급 코드
 */
export const setupSalaryScheduler = (classCode) => {
    const checkAndPay = async () => {
        const now = new Date();
        // 한국 시간 기준 금요일 오전 8시
        if (now.getDay() === 5 && now.getHours() === 8) {
            const settings = await getSalarySettings(classCode);
            const lastPaid = settings.lastPaidDate?.toDate();
            
            if (lastPaid) {
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const lastPaidDay = new Date(lastPaid.getFullYear(), lastPaid.getMonth(), lastPaid.getDate());

                if (today > lastPaidDay) {
                    await payWeeklySalaries(classCode);
                }
            } else {
                // 첫 지급
                await payWeeklySalaries(classCode);
            }
        }
    };

    // 1분마다 체크
    setInterval(checkAndPay, 60 * 1000); 
    
    // 앱 시작 시 즉시 체크
    checkAndPay();
};