// src/pages/legal/ConsentForm.js
// 개인정보 수집·이용 동의서 (가정통신문) - 인쇄/다운로드용

import React, { useRef } from 'react';
import { Printer, Download, ArrowLeft, FileText, Scissors } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

// 인쇄 전용 스타일 (화면에는 안 보이고 인쇄 시에만 적용)
const printStyles = `
@media print {
  .no-print { display: none !important; }
  .print-area {
    background: white !important;
    color: black !important;
    padding: 0 !important;
    margin: 0 !important;
    font-size: 13px !important;
    line-height: 1.6 !important;
  }
  .print-area * {
    color: black !important;
    background: white !important;
    border-color: #333 !important;
  }
  .consent-page {
    page-break-after: always;
  }
  body { margin: 0; padding: 0; }
}
`;

const ConsentForm = () => {
  useDocumentTitle('개인정보 수집 동의서');
  const navigate = useNavigate();
  const printRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const textContent = printRef.current?.innerText;
    if (textContent) {
      navigator.clipboard.writeText(textContent).then(() => {
        alert('텍스트가 클립보드에 복사되었습니다.\n한글(HWP), Word 등에 붙여넣기 하세요.');
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] text-gray-100">
      <style>{printStyles}</style>

      {/* 상단 툴바 (인쇄 시 안 보임) */}
      <div className="no-print sticky top-0 z-50 bg-[#12121f] border-b border-white/10 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span>뒤로가기</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <FileText size={16} />
              텍스트 복사
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Printer size={16} />
              인쇄 / PDF 저장
            </button>
          </div>
        </div>
      </div>

      {/* 안내 배너 (인쇄 시 안 보임) */}
      <div className="no-print max-w-4xl mx-auto px-4 pt-6 pb-4">
        <div className="bg-violet-900/30 border border-violet-700/50 rounded-xl p-4">
          <h2 className="text-lg font-bold text-violet-300 mb-2 flex items-center gap-2">
            <Download size={20} />
            가정통신문 다운로드 안내
          </h2>
          <ul className="text-sm text-violet-200/80 space-y-1">
            <li>1. <strong>"인쇄 / PDF 저장"</strong> 버튼 클릭 → 프린터를 "PDF로 저장"으로 선택하면 PDF 파일로 저장됩니다.</li>
            <li>2. <strong>"텍스트 복사"</strong> 버튼 클릭 → 한글(HWP), Word에 붙여넣기 후 자유롭게 수정하세요.</li>
            <li>3. 학교명, 학년, 반, 선생님 성함 등 <strong className="text-yellow-300">노란색 부분</strong>을 수정해서 사용하세요.</li>
          </ul>
        </div>
      </div>

      {/* ============ 인쇄 영역 ============ */}
      <div ref={printRef} className="print-area max-w-4xl mx-auto px-4 pb-12">

        {/* === 가정통신문 본문 === */}
        <div className="consent-page bg-[#16162a] rounded-xl p-8 md:p-12 border border-white/10 mb-8" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>

          {/* 문서 제목 */}
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#e8e8ff' }}>
              가 정 통 신 문
            </h1>
            <div className="w-24 h-1 bg-violet-500 mx-auto rounded-full" />
          </div>

          {/* 학교 정보 */}
          <div className="text-right text-sm mb-6" style={{ color: '#a0a0c0' }}>
            <p><span className="text-yellow-400 no-print">○○</span><span className="print-only">○○</span>초등학교</p>
            <p>제 <span className="text-yellow-400 no-print">____</span><span className="print-only">____</span> 호</p>
            <p>2025년 <span className="text-yellow-400 no-print">__</span><span className="print-only">__</span>월 <span className="text-yellow-400 no-print">__</span><span className="print-only">__</span>일</p>
          </div>

          {/* 인사말 */}
          <div className="mb-6 leading-relaxed" style={{ color: '#d0d0e8' }}>
            <p className="mb-4">
              학부모님께 안녕하세요.
            </p>
            <p className="mb-4">
              우리 <span className="text-yellow-400 no-print font-semibold">[○학년 ○반]</span><span className="print-only font-semibold">[○학년 ○반]</span>에서는 학급 경제 교육의 일환으로
              <strong> '알찬'</strong> 학급 경제 시뮬레이션 앱을 활용하고자 합니다.
            </p>
            <p className="mb-4">
              이 앱은 학생들이 가상 화폐를 통해 경제 개념(저축, 투자, 직업, 세금 등)을 체험하며 배울 수 있는
              교육용 프로그램입니다.
            </p>
            <p className="mb-2">
              앱 사용을 위해 아래와 같이 학생의 개인정보를 수집·이용하고자 하오니,
              <strong> 「개인정보 보호법」 제22조(만 14세 미만 아동의 개인정보 수집)</strong>에 따라
              법정대리인의 동의를 요청드립니다.
            </p>
          </div>

          {/* 구분선 */}
          <div className="border-t border-white/20 my-6" />

          {/* 수집 항목 테이블 */}
          <div className="mb-6">
            <h3 className="text-lg font-bold mb-3" style={{ color: '#e8e8ff' }}>1. 개인정보 수집·이용 내역</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ borderColor: '#ffffff30' }}>
                <thead>
                  <tr className="bg-violet-900/30">
                    <th className="border border-white/20 px-4 py-2 text-left font-semibold" style={{ color: '#c8c8ff' }}>항목</th>
                    <th className="border border-white/20 px-4 py-2 text-left font-semibold" style={{ color: '#c8c8ff' }}>내용</th>
                  </tr>
                </thead>
                <tbody style={{ color: '#d0d0e8' }}>
                  <tr>
                    <td className="border border-white/20 px-4 py-2 font-medium">수집 항목</td>
                    <td className="border border-white/20 px-4 py-2">닉네임(이름), 학급 코드</td>
                  </tr>
                  <tr>
                    <td className="border border-white/20 px-4 py-2 font-medium">수집 목적</td>
                    <td className="border border-white/20 px-4 py-2">학급 경제 교육 활동 (가상 화폐 관리, 직업 체험, 경제 활동 기록)</td>
                  </tr>
                  <tr>
                    <td className="border border-white/20 px-4 py-2 font-medium">보유 기간</td>
                    <td className="border border-white/20 px-4 py-2">해당 학년도 종료 시까지 (학년 말 일괄 삭제)</td>
                  </tr>
                  <tr>
                    <td className="border border-white/20 px-4 py-2 font-medium">이용 범위</td>
                    <td className="border border-white/20 px-4 py-2">해당 학급 내에서만 사용 (외부 제공 없음)</td>
                  </tr>
                  <tr>
                    <td className="border border-white/20 px-4 py-2 font-medium">처리 방법</td>
                    <td className="border border-white/20 px-4 py-2">Firebase 클라우드 서버에 암호화 저장</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 안내 사항 */}
          <div className="mb-6">
            <h3 className="text-lg font-bold mb-3" style={{ color: '#e8e8ff' }}>2. 안내 사항</h3>
            <ul className="space-y-2 text-sm" style={{ color: '#d0d0e8' }}>
              <li className="flex gap-2">
                <span>•</span>
                <span>수집된 개인정보는 교육 목적 외에 절대 사용되지 않습니다.</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>개인정보는 해당 학급 담임교사만 접근할 수 있으며, 다른 학급과 공유되지 않습니다.</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>학부모님은 언제든지 자녀의 개인정보 열람·정정·삭제를 요청하실 수 있습니다.</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>동의를 거부하실 수 있으며, 이 경우 앱 활용 없이 대체 활동으로 진행됩니다.</span>
              </li>
              <li className="flex gap-2">
                <span>•</span>
                <span>개인정보처리방침 전문: <strong className="text-violet-400">https://inconomysu-class.web.app/privacy</strong></span>
              </li>
            </ul>
          </div>

          {/* 담임교사 정보 */}
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-3" style={{ color: '#e8e8ff' }}>3. 문의처</h3>
            <div className="text-sm" style={{ color: '#d0d0e8' }}>
              <p><span className="text-yellow-400 no-print">○○</span><span className="print-only">○○</span>초등학교 <span className="text-yellow-400 no-print">○</span><span className="print-only">○</span>학년 <span className="text-yellow-400 no-print">○</span><span className="print-only">○</span>반 담임교사 <span className="text-yellow-400 no-print font-semibold">[성명]</span><span className="print-only font-semibold">[성명]</span></p>
              <p>연락처: <span className="text-yellow-400 no-print">[전화번호 또는 이메일]</span><span className="print-only">[전화번호 또는 이메일]</span></p>
            </div>
          </div>

          {/* 절취선 */}
          <div className="flex items-center gap-2 my-8">
            <Scissors size={16} className="text-gray-500 no-print" />
            <div className="flex-1 border-t-2 border-dashed border-gray-500" />
            <span className="text-xs text-gray-500 px-2">✂ 절취선 (아래 회신 부분을 잘라서 제출해 주세요)</span>
            <div className="flex-1 border-t-2 border-dashed border-gray-500" />
          </div>

          {/* === 회신서 (동의서) === */}
          <div className="p-6 rounded-xl" style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
            <h2 className="text-xl font-bold text-center mb-6" style={{ color: '#e8e8ff' }}>
              개인정보 수집·이용 동의서 (회신)
            </h2>

            <div className="text-sm mb-6" style={{ color: '#d0d0e8' }}>
              <p className="mb-3">
                본인은 위 가정통신문의 내용을 충분히 이해하였으며,
                자녀의 개인정보 수집·이용에 대해 아래와 같이 의사를 표시합니다.
              </p>
            </div>

            {/* 동의 체크 */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="w-5 h-5 mt-0.5 border-2 border-gray-400 rounded flex-shrink-0" />
                <div className="text-sm" style={{ color: '#d0d0e8' }}>
                  <strong>동의합니다.</strong>
                  <p className="text-xs mt-1" style={{ color: '#a0a0c0' }}>
                    '알찬' 앱 사용을 위한 개인정보(닉네임, 학급코드) 수집·이용에 동의합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="w-5 h-5 mt-0.5 border-2 border-gray-400 rounded flex-shrink-0" />
                <div className="text-sm" style={{ color: '#d0d0e8' }}>
                  <strong>동의하지 않습니다.</strong>
                  <p className="text-xs mt-1" style={{ color: '#a0a0c0' }}>
                    대체 활동으로 참여하겠습니다.
                  </p>
                </div>
              </div>
            </div>

            {/* 서명란 */}
            <div className="space-y-4 text-sm" style={{ color: '#d0d0e8' }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">학생 이름: </span>
                  <span className="inline-block w-32 border-b border-gray-500 ml-1">&nbsp;</span>
                </div>
                <div>
                  <span className="font-medium">학년/반/번호: </span>
                  <span className="inline-block w-24 border-b border-gray-500 ml-1">&nbsp;</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">보호자 성명: </span>
                  <span className="inline-block w-32 border-b border-gray-500 ml-1">&nbsp;</span>
                </div>
                <div>
                  <span className="font-medium">관계: </span>
                  <span className="inline-block w-24 border-b border-gray-500 ml-1">&nbsp;</span>
                </div>
              </div>

              <div>
                <span className="font-medium">보호자 서명(인): </span>
                <span className="inline-block w-40 border-b border-gray-500 ml-1">&nbsp;</span>
              </div>

              <div className="text-right mt-6">
                <p>2025년 &nbsp;&nbsp;&nbsp;&nbsp;월 &nbsp;&nbsp;&nbsp;&nbsp;일</p>
              </div>

              <div className="text-center mt-4 font-semibold">
                <p><span className="text-yellow-400 no-print">○○</span><span className="print-only">○○</span>초등학교장 귀하</p>
              </div>
            </div>
          </div>

        </div>
        {/* === 가정통신문 끝 === */}

      </div>
    </div>
  );
};

export default ConsentForm;
