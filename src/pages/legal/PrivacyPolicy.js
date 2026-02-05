// src/pages/legal/PrivacyPolicy.js
// 개인정보처리방침 페이지 (한국 개인정보보호법 준수, 14세 미만 아동 포함)

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Mail, Calendar, Lock, FileText, ChevronRight, AlertCircle, Printer } from 'lucide-react';

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#0a0a12] text-gray-100 py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-violet-500/20 rounded-2xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-violet-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">개인정보처리방침</h1>
              <p className="text-gray-400 text-sm mt-1">최종 수정일: 2025년 2월 5일</p>
            </div>
          </div>

          {/* 중요 안내 배너 */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              <p className="font-semibold mb-1">법정대리인(부모님/보호자)께</p>
              <p className="text-amber-300/90">
                본 서비스는 14세 미만 아동의 개인정보를 수집합니다.
                법정대리인의 동의가 필요하며, 아동의 개인정보 열람, 정정, 삭제를 요청하실 수 있습니다.
              </p>
            </div>
          </div>

          {/* 가정통신문 링크 (선생님용) */}
          <div
            onClick={() => navigate('/consent-form')}
            className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-violet-500/20 transition-colors mt-4"
          >
            <div className="flex items-center gap-3">
              <Printer className="w-5 h-5 text-violet-400 flex-shrink-0" />
              <div className="text-sm text-violet-200">
                <p className="font-semibold">가정통신문 (개인정보 수집 동의서)</p>
                <p className="text-violet-300/80">인쇄/PDF 저장 가능한 학부모 동의서 양식</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-violet-400" />
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="space-y-8">
          {/* 1. 개요 */}
          <Section
            icon={<FileText className="w-6 h-6" />}
            title="1. 개요"
            content={
              <>
                <p className="text-gray-300 leading-relaxed mb-4">
                  알찬 경제교육(이하 "서비스")은 초등학교 학급 경제 시뮬레이션을 통해 학생들에게
                  경제 교육을 제공하는 교육용 웹 애플리케이션입니다.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  본 방침은 「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를 보호하고
                  이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이
                  개인정보 처리방침을 수립·공개합니다.
                </p>
              </>
            }
          />

          {/* 2. 수집하는 개인정보 */}
          <Section
            icon={<Lock className="w-6 h-6" />}
            title="2. 수집하는 개인정보의 항목"
            content={
              <>
                <div className="bg-[#15151f] rounded-xl p-5 mb-4 border border-gray-800">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-violet-400" />
                    학생 계정
                  </h4>
                  <ul className="space-y-2 ml-6">
                    <li className="text-gray-300 flex items-start gap-2">
                      <span className="text-violet-400 mt-1">•</span>
                      <span><strong className="text-white">필수 항목:</strong> 이메일 주소, 닉네임(이름), 비밀번호, 학급 코드</span>
                    </li>
                    <li className="text-gray-300 flex items-start gap-2">
                      <span className="text-violet-400 mt-1">•</span>
                      <span><strong className="text-white">자동 수집:</strong> 서비스 이용 기록, 로그인 시간, 활동 기록</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-[#15151f] rounded-xl p-5 border border-gray-800">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-violet-400" />
                    선생님 계정
                  </h4>
                  <ul className="space-y-2 ml-6">
                    <li className="text-gray-300 flex items-start gap-2">
                      <span className="text-violet-400 mt-1">•</span>
                      <span><strong className="text-white">필수 항목:</strong> 이메일 주소, 이름, 비밀번호</span>
                    </li>
                    <li className="text-gray-300 flex items-start gap-2">
                      <span className="text-violet-400 mt-1">•</span>
                      <span><strong className="text-white">선택 항목:</strong> 학교명, 학급명</span>
                    </li>
                  </ul>
                </div>
              </>
            }
          />

          {/* 3. 개인정보의 수집 및 이용 목적 */}
          <Section
            icon={<FileText className="w-6 h-6" />}
            title="3. 개인정보의 수집 및 이용 목적"
            content={
              <ul className="space-y-3">
                <ListItem>회원 가입 및 관리: 회원제 서비스 제공, 본인 확인, 학급 구성원 관리</ListItem>
                <ListItem>교육 서비스 제공: 학급 경제 시뮬레이션, 학습 활동 기록 및 관리</ListItem>
                <ListItem>서비스 개선: 통계 분석, 서비스 품질 향상</ListItem>
                <ListItem>고충 처리: 민원 접수 및 처리, 공지사항 전달</ListItem>
              </ul>
            }
          />

          {/* 4. 보유 및 이용 기간 */}
          <Section
            icon={<Calendar className="w-6 h-6" />}
            title="4. 개인정보의 보유 및 이용 기간"
            content={
              <>
                <p className="text-gray-300 leading-relaxed mb-4">
                  서비스는 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
                </p>
                <div className="bg-[#15151f] rounded-xl p-5 border border-gray-800">
                  <ul className="space-y-3">
                    <ListItem>
                      <strong className="text-white">회원 탈퇴 시:</strong> 즉시 파기
                    </ListItem>
                    <ListItem>
                      <strong className="text-white">학기 종료 시:</strong> 선생님이 학급 삭제를 요청하는 경우 즉시 파기
                    </ListItem>
                    <ListItem>
                      <strong className="text-white">휴면 계정:</strong> 1년간 로그인 기록이 없는 경우 별도 분리 보관 후 파기 안내
                    </ListItem>
                  </ul>
                </div>
              </>
            }
          />

          {/* 5. 14세 미만 아동의 개인정보 처리 */}
          <Section
            icon={<Shield className="w-6 h-6" />}
            title="5. 14세 미만 아동의 개인정보 처리"
            highlighted={true}
            content={
              <>
                <p className="text-gray-300 leading-relaxed mb-4">
                  서비스는 원칙적으로 14세 미만 아동의 개인정보를 수집하지 않습니다.
                  다만, 학교 교육 목적으로 선생님의 관리 하에 이용하는 경우 다음과 같이 처리합니다:
                </p>
                <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-5">
                  <ul className="space-y-3">
                    <ListItem>
                      법정대리인(부모님/보호자)의 동의를 받아야 하며, 선생님이 학급 단위로 동의를 관리합니다.
                    </ListItem>
                    <ListItem>
                      법정대리인은 아동의 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다.
                    </ListItem>
                    <ListItem>
                      개인정보 보호책임자에게 연락하여 즉시 필요한 조치를 받으실 수 있습니다.
                    </ListItem>
                  </ul>
                </div>
              </>
            }
          />

          {/* 6. 개인정보의 제3자 제공 */}
          <Section
            icon={<Lock className="w-6 h-6" />}
            title="6. 개인정보의 제3자 제공"
            content={
              <p className="text-gray-300 leading-relaxed">
                서비스는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.
                다만, 법령에 의한 경우나 이용자의 동의가 있는 경우는 예외로 합니다.
              </p>
            }
          />

          {/* 7. 개인정보 처리의 위탁 */}
          <Section
            icon={<FileText className="w-6 h-6" />}
            title="7. 개인정보 처리의 위탁"
            content={
              <>
                <p className="text-gray-300 leading-relaxed mb-4">
                  서비스는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리업무를 위탁하고 있습니다:
                </p>
                <div className="bg-[#15151f] rounded-xl p-5 border border-gray-800">
                  <div className="space-y-2">
                    <p className="text-white font-semibold">수탁업체: Google Firebase (Google LLC)</p>
                    <p className="text-gray-300">위탁 업무: 클라우드 서버 운영, 데이터베이스 관리, 인증 서비스</p>
                  </div>
                </div>
              </>
            }
          />

          {/* 8. 정보주체의 권리·의무 */}
          <Section
            icon={<Shield className="w-6 h-6" />}
            title="8. 정보주체의 권리·의무 및 행사 방법"
            content={
              <>
                <p className="text-gray-300 leading-relaxed mb-4">
                  이용자는 언제든지 다음과 같은 권리를 행사할 수 있습니다:
                </p>
                <ul className="space-y-3">
                  <ListItem>개인정보 열람 요구</ListItem>
                  <ListItem>개인정보 정정·삭제 요구</ListItem>
                  <ListItem>개인정보 처리정지 요구</ListItem>
                  <ListItem>회원 탈퇴 (계정 삭제)</ListItem>
                </ul>
                <p className="text-gray-300 leading-relaxed mt-4">
                  권리 행사는 서비스 내 "내 프로필" 메뉴에서 직접 하시거나,
                  개인정보 보호책임자에게 연락하여 진행하실 수 있습니다.
                </p>
              </>
            }
          />

          {/* 9. 개인정보의 안전성 확보 조치 */}
          <Section
            icon={<Lock className="w-6 h-6" />}
            title="9. 개인정보의 안전성 확보 조치"
            content={
              <ul className="space-y-3">
                <ListItem>개인정보 암호화: 비밀번호는 암호화되어 저장 및 관리</ListItem>
                <ListItem>접근 통제: 개인정보에 대한 접근 권한 최소화</ListItem>
                <ListItem>보안 프로그램: 방화벽 및 백신 프로그램 설치</ListItem>
                <ListItem>보안 업데이트: 정기적인 보안 점검 및 업데이트</ListItem>
              </ul>
            }
          />

          {/* 10. 개인정보 보호책임자 */}
          <Section
            icon={<Mail className="w-6 h-6" />}
            title="10. 개인정보 보호책임자"
            content={
              <>
                <p className="text-gray-300 leading-relaxed mb-4">
                  개인정보 처리에 관한 업무를 총괄해서 책임지고,
                  개인정보 처리와 관련한 정보주체의 불만 처리 및 피해구제를 위하여
                  아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
                </p>
                <div className="bg-[#15151f] rounded-xl p-5 border border-gray-800">
                  <div className="space-y-2">
                    <p className="text-white font-semibold">개인정보 보호책임자</p>
                    <p className="text-gray-300">성명: 알찬 운영팀</p>
                    <p className="text-gray-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-violet-400" />
                      이메일: privacy@alchan-edu.kr (예시)
                    </p>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mt-4 leading-relaxed">
                  개인정보 침해에 대한 신고나 상담이 필요하신 경우에는
                  개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118),
                  대검찰청 사이버범죄수사단(www.spo.go.kr, 국번없이 1301),
                  경찰청 사이버안전국(cyberbureau.police.go.kr, 국번없이 182)으로 문의하실 수 있습니다.
                </p>
              </>
            }
          />

          {/* 11. 개인정보처리방침 변경 */}
          <Section
            icon={<Calendar className="w-6 h-6" />}
            title="11. 개인정보처리방침 변경"
            content={
              <p className="text-gray-300 leading-relaxed">
                이 개인정보처리방침은 2025년 2월 5일부터 적용됩니다.
                법령 및 방침에 따른 변경 내용의 추가, 삭제 및 정정이 있는 경우에는
                변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.
              </p>
            }
          />
        </div>

        {/* 하단 여백 */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <p className="text-center text-gray-500 text-sm">
            본 개인정보처리방침은 「개인정보 보호법」에 따라 작성되었습니다.
          </p>
        </div>
      </div>
    </div>
  );
};

// Section 컴포넌트
const Section = ({ icon, title, content, highlighted = false }) => {
  return (
    <div className={`rounded-2xl p-6 ${highlighted ? 'bg-violet-500/5 border-2 border-violet-500/30' : 'bg-[#15151f] border border-gray-800'}`}>
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${highlighted ? 'bg-violet-500/20' : 'bg-violet-500/10'}`}>
          <div className="text-violet-400">{icon}</div>
        </div>
        <h2 className="text-xl font-bold text-white pt-2">{title}</h2>
      </div>
      <div className="ml-16">{content}</div>
    </div>
  );
};

// ListItem 컴포넌트
const ListItem = ({ children }) => {
  return (
    <li className="text-gray-300 flex items-start gap-3">
      <ChevronRight className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
};

export default PrivacyPolicy;
