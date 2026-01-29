// 이 스크립트는 프로젝트에서 모든 SVG 파일을 제거하고 빈 파일로 대체합니다.
// Node.js로 실행하며 실제 파일 시스템에 접근해야 합니다.

import { logger } from "../utils/logger";

const fs = require("fs");
const path = require("path");

// 프로젝트 경로 (여기서는 현재 디렉토리 + src)
const projectPath = path.join(process.cwd(), "src");

// 제거할 SVG 파일 목록
const svgFilesToRemove = ["auction.svg", "shopping.svg", "stock.svg"];

// SVG 파일 제거 함수
function deleteSvgFiles() {
  svgFilesToRemove.forEach((svgFile) => {
    const filePath = path.join(projectPath, svgFile);

    try {
      // 파일이 존재하는지 확인
      if (fs.existsSync(filePath)) {
        // 파일 삭제
        fs.unlinkSync(filePath);
        logger.log(`${svgFile} 파일이 성공적으로 삭제되었습니다.`);
      } else {
        logger.log(`${svgFile} 파일이 존재하지 않습니다.`);
      }
    } catch (err) {
      console.error(`${svgFile} 파일 삭제 중 오류 발생:`, err);
    }
  });
}

// 실행
logger.log("SVG 파일 삭제 시작...");
deleteSvgFiles();
logger.log("SVG 파일 삭제 완료.");

// 추가 작업: 필요한 경우 App.js와 Dashboard.js 등에서 SVG 파일 참조를 수정해야 합니다.
logger.log(
  "주의: App.js, Dashboard.js 등에서 SVG 파일 참조를 확인하고 수정해주세요."
);
