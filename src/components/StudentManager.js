// src/components/StudentManager.js
// 학생 일괄 생성 및 관리 컴포넌트

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, auth as firebaseAuth } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  Users,
  UserPlus,
  Upload,
  Download,
  Trash2,
  Edit2,
  Search,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  X,
  Save,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Loader2,
  User,
  Mail,
  Lock,
  GraduationCap,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Select,
  Modal,
  Alert,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  PageHeader,
  Spinner,
} from './ui/index';

// 랜덤 비밀번호 생성
const generatePassword = (length = 8) => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// 이메일 형식으로 변환 (학번 -> 이메일)
const createStudentEmail = (studentId, classCode) => {
  return `${studentId.toLowerCase()}@${classCode.toLowerCase()}.alchan`;
};

const StudentManager = () => {
  const { userDoc, classmates } = useAuth();
  const classCode = userDoc?.classCode;

  // 상태
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudents, setSelectedStudents] = useState(new Set());

  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);

  // 단일 추가 폼
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentNumber, setNewStudentNumber] = useState('');
  const [newStudentPassword, setNewStudentPassword] = useState('');

  // 일괄 추가 폼
  const [bulkInput, setBulkInput] = useState('');
  const [bulkStudents, setBulkStudents] = useState([]);
  const [bulkStep, setBulkStep] = useState(1); // 1: 입력, 2: 미리보기, 3: 결과

  // 작업 상태
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState({ success: [], failed: [] });
  const [copiedId, setCopiedId] = useState(null);

  // 학생 목록 로드
  useEffect(() => {
    loadStudents();
  }, [classCode, classmates]);

  const loadStudents = async () => {
    if (!classCode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // AuthContext의 classmates 사용
      if (classmates && classmates.length > 0) {
        const studentList = classmates.filter(u => !u.isTeacher && !u.isAdmin);
        setStudents(studentList);
      } else {
        // 직접 로드
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('classCode', '==', classCode));
        const snapshot = await getDocs(q);
        const studentList = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(u => !u.isTeacher && !u.isAdmin);
        setStudents(studentList);
      }
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  };

  // 검색 필터링
  const filteredStudents = useMemo(() => {
    if (!searchTerm) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(s =>
      s.name?.toLowerCase().includes(term) ||
      s.studentNumber?.toString().includes(term) ||
      s.email?.toLowerCase().includes(term)
    );
  }, [students, searchTerm]);

  // 단일 학생 추가
  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !newStudentNumber.trim()) {
      alert('이름과 번호를 입력해주세요.');
      return;
    }

    setProcessing(true);
    const password = newStudentPassword || generatePassword();
    const email = createStudentEmail(newStudentNumber, classCode);

    try {
      // Firebase Auth 계정 생성
      const userCredential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );
      const newUser = userCredential.user;

      // 프로필 업데이트
      await updateProfile(newUser, { displayName: newStudentName.trim() });

      // 학급 설정 가져오기
      const classDoc = await getDoc(doc(db, 'classes', classCode));
      const classSettings = classDoc.exists() ? classDoc.data().settings : {};
      const initialCash = classSettings.initialCash || 100000;
      const initialCoupons = classSettings.initialCoupons || 10;

      // Firestore 문서 생성
      await setDoc(doc(db, 'users', newUser.uid), {
        name: newStudentName.trim(),
        nickname: newStudentName.trim(),
        email: email,
        classCode: classCode,
        studentNumber: parseInt(newStudentNumber),
        isAdmin: false,
        isSuperAdmin: false,
        isTeacher: false,
        cash: initialCash,
        coupons: initialCoupons,
        selectedJobIds: [],
        myContribution: 0,
        createdAt: serverTimestamp(),
        createdBy: userDoc?.id,
      });

      // 학급 학생 수 업데이트
      const classRef = doc(db, 'classes', classCode);
      const currentClass = await getDoc(classRef);
      if (currentClass.exists()) {
        await updateDoc(classRef, {
          studentCount: (currentClass.data().studentCount || 0) + 1,
        });
      }

      alert(`학생 추가 완료!\n이메일: ${email}\n비밀번호: ${password}`);

      // 폼 초기화
      setNewStudentName('');
      setNewStudentNumber('');
      setNewStudentPassword('');
      setShowAddModal(false);
      loadStudents();

    } catch (error) {
      console.error('Failed to add student:', error);
      alert(`학생 추가 실패: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // 일괄 입력 파싱
  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(line => line.trim());
    const parsed = [];

    for (const line of lines) {
      // 탭 또는 쉼표로 구분
      const parts = line.split(/[\t,]/).map(p => p.trim());

      if (parts.length >= 2) {
        const [number, name] = parts;
        const password = parts[2] || generatePassword();
        const email = createStudentEmail(number, classCode);

        parsed.push({
          number: parseInt(number) || number,
          name,
          email,
          password,
          status: 'pending',
        });
      } else if (parts.length === 1 && parts[0]) {
        // 이름만 있는 경우 자동 번호 부여
        parsed.push({
          number: parsed.length + 1,
          name: parts[0],
          email: createStudentEmail((parsed.length + 1).toString(), classCode),
          password: generatePassword(),
          status: 'pending',
        });
      }
    }

    setBulkStudents(parsed);
    setBulkStep(2);
  };

  // 일괄 학생 생성
  const handleBulkCreate = async () => {
    if (bulkStudents.length === 0) return;

    setProcessing(true);
    const successList = [];
    const failedList = [];

    // 학급 설정 가져오기
    const classDoc = await getDoc(doc(db, 'classes', classCode));
    const classSettings = classDoc.exists() ? classDoc.data().settings : {};
    const initialCash = classSettings.initialCash || 100000;
    const initialCoupons = classSettings.initialCoupons || 10;

    for (let i = 0; i < bulkStudents.length; i++) {
      const student = bulkStudents[i];

      try {
        // Firebase Auth 계정 생성
        const userCredential = await createUserWithEmailAndPassword(
          firebaseAuth,
          student.email,
          student.password
        );
        const newUser = userCredential.user;

        // 프로필 업데이트
        await updateProfile(newUser, { displayName: student.name });

        // Firestore 문서 생성
        await setDoc(doc(db, 'users', newUser.uid), {
          name: student.name,
          nickname: student.name,
          email: student.email,
          classCode: classCode,
          studentNumber: student.number,
          isAdmin: false,
          isSuperAdmin: false,
          isTeacher: false,
          cash: initialCash,
          coupons: initialCoupons,
          selectedJobIds: [],
          myContribution: 0,
          createdAt: serverTimestamp(),
          createdBy: userDoc?.id,
        });

        student.status = 'success';
        student.uid = newUser.uid;
        successList.push(student);

      } catch (error) {
        student.status = 'failed';
        student.error = error.message;
        failedList.push(student);
      }

      // 진행률 업데이트
      setBulkStudents([...bulkStudents]);
    }

    // 학급 학생 수 업데이트
    if (successList.length > 0) {
      const classRef = doc(db, 'classes', classCode);
      const currentClass = await getDoc(classRef);
      if (currentClass.exists()) {
        await updateDoc(classRef, {
          studentCount: (currentClass.data().studentCount || 0) + successList.length,
        });
      }
    }

    setResults({ success: successList, failed: failedList });
    setBulkStep(3);
    setProcessing(false);
    loadStudents();
  };

  // 결과 CSV 다운로드
  const downloadResultsCSV = () => {
    const rows = [['번호', '이름', '이메일', '비밀번호', '상태']];

    [...results.success, ...results.failed].forEach(s => {
      rows.push([
        s.number,
        s.name,
        s.email,
        s.password,
        s.status === 'success' ? '성공' : `실패: ${s.error}`,
      ]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `학생목록_${classCode}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // 학생 삭제
  const handleDeleteStudent = async (student) => {
    if (!window.confirm(`${student.name} 학생을 삭제하시겠습니까?\n\n주의: 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setProcessing(true);
    try {
      // Firestore 문서 삭제
      await deleteDoc(doc(db, 'users', student.id));

      // 학급 학생 수 감소
      const classRef = doc(db, 'classes', classCode);
      const currentClass = await getDoc(classRef);
      if (currentClass.exists()) {
        await updateDoc(classRef, {
          studentCount: Math.max(0, (currentClass.data().studentCount || 0) - 1),
        });
      }

      alert('학생이 삭제되었습니다.');
      loadStudents();
    } catch (error) {
      console.error('Failed to delete student:', error);
      alert(`삭제 실패: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // 선택된 학생 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedStudents.size === 0) return;

    if (!window.confirm(`선택된 ${selectedStudents.size}명의 학생을 삭제하시겠습니까?`)) {
      return;
    }

    setProcessing(true);
    const batch = writeBatch(db);
    let deleteCount = 0;

    for (const studentId of selectedStudents) {
      batch.delete(doc(db, 'users', studentId));
      deleteCount++;
    }

    try {
      await batch.commit();

      // 학급 학생 수 업데이트
      const classRef = doc(db, 'classes', classCode);
      const currentClass = await getDoc(classRef);
      if (currentClass.exists()) {
        await updateDoc(classRef, {
          studentCount: Math.max(0, (currentClass.data().studentCount || 0) - deleteCount),
        });
      }

      setSelectedStudents(new Set());
      alert(`${deleteCount}명의 학생이 삭제되었습니다.`);
      loadStudents();
    } catch (error) {
      console.error('Failed to bulk delete:', error);
      alert(`일괄 삭제 실패: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // 비밀번호 복사
  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 모달 닫기 시 초기화
  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkStep(1);
    setBulkInput('');
    setBulkStudents([]);
    setResults({ success: [], failed: [] });
  };

  if (!classCode) {
    return (
      <EmptyState
        icon={Users}
        title="학급 정보가 없습니다"
        description="학급 코드가 설정되어 있지 않습니다."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="학생 관리"
        subtitle={`학급 코드: ${classCode} | 총 ${students.length}명`}
        icon={Users}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={Upload}
              onClick={() => setShowBulkModal(true)}
            >
              일괄 추가
            </Button>
            <Button
              size="sm"
              icon={UserPlus}
              onClick={() => setShowAddModal(true)}
            >
              학생 추가
            </Button>
          </div>
        }
      />

      {/* 검색 및 필터 */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="이름, 번호, 이메일로 검색..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={loadStudents}
            >
              새로고침
            </Button>
            {selectedStudents.size > 0 && (
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={handleBulkDelete}
              >
                선택 삭제 ({selectedStudents.size})
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 학생 목록 */}
      {filteredStudents.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="학생이 없습니다"
            description="학생을 추가하거나 일괄 가져오기를 사용해주세요."
            action={
              <Button icon={UserPlus} onClick={() => setShowAddModal(true)}>
                학생 추가
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedStudents.size === filteredStudents.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
                      } else {
                        setSelectedStudents(new Set());
                      }
                    }}
                    className="w-4 h-4 rounded"
                  />
                </TableHead>
                <TableHead>번호</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>현금</TableHead>
                <TableHead>쿠폰</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedStudents.has(student.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedStudents);
                        if (e.target.checked) {
                          newSet.add(student.id);
                        } else {
                          newSet.delete(student.id);
                        }
                        setSelectedStudents(newSet);
                      }}
                      className="w-4 h-4 rounded"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {student.studentNumber || '-'}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {student.name}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {student.email}
                  </TableCell>
                  <TableCell>
                    {(student.cash || 0).toLocaleString()}원
                  </TableCell>
                  <TableCell>
                    {student.coupons || 0}장
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingStudent(student);
                          setShowEditModal(true);
                        }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDeleteStudent(student)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* 단일 추가 모달 */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="학생 추가"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              취소
            </Button>
            <Button onClick={handleAddStudent} loading={processing}>
              추가
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="학생 이름"
            icon={User}
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            placeholder="홍길동"
          />
          <Input
            label="번호 (학번)"
            icon={GraduationCap}
            type="number"
            value={newStudentNumber}
            onChange={(e) => setNewStudentNumber(e.target.value)}
            placeholder="1"
          />
          <Input
            label="비밀번호 (미입력시 자동 생성)"
            icon={Lock}
            type="text"
            value={newStudentPassword}
            onChange={(e) => setNewStudentPassword(e.target.value)}
            placeholder="자동 생성됨"
          />
          <Alert variant="info">
            생성되는 이메일: {newStudentNumber ? createStudentEmail(newStudentNumber, classCode) : '번호를 입력하세요'}
          </Alert>
        </div>
      </Modal>

      {/* 일괄 추가 모달 */}
      <Modal
        isOpen={showBulkModal}
        onClose={closeBulkModal}
        title="학생 일괄 추가"
        size="xl"
        footer={
          bulkStep === 1 ? (
            <>
              <Button variant="secondary" onClick={closeBulkModal}>
                취소
              </Button>
              <Button onClick={parseBulkInput} disabled={!bulkInput.trim()}>
                다음
              </Button>
            </>
          ) : bulkStep === 2 ? (
            <>
              <Button variant="secondary" onClick={() => setBulkStep(1)}>
                이전
              </Button>
              <Button onClick={handleBulkCreate} loading={processing}>
                {bulkStudents.length}명 생성
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={downloadResultsCSV} icon={Download}>
                CSV 다운로드
              </Button>
              <Button onClick={closeBulkModal}>
                완료
              </Button>
            </>
          )
        }
      >
        {/* Step 1: 입력 */}
        {bulkStep === 1 && (
          <div className="space-y-4">
            <Alert variant="info" title="입력 형식">
              각 줄에 학생 정보를 입력하세요.<br/>
              형식: <code>번호, 이름</code> 또는 <code>번호, 이름, 비밀번호</code><br/>
              예: 1, 홍길동 또는 1, 홍길동, password123
            </Alert>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={`1, 홍길동\n2, 김철수\n3, 이영희, mypassword`}
              className="w-full h-64 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        {/* Step 2: 미리보기 */}
        {bulkStep === 2 && (
          <div className="space-y-4">
            <Alert variant="warning">
              아래 {bulkStudents.length}명의 학생 계정을 생성합니다. 확인 후 진행해주세요.
            </Alert>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left">번호</th>
                    <th className="px-4 py-2 text-left">이름</th>
                    <th className="px-4 py-2 text-left">이메일</th>
                    <th className="px-4 py-2 text-left">비밀번호</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {bulkStudents.map((student, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">{student.number}</td>
                      <td className="px-4 py-2 font-medium">{student.name}</td>
                      <td className="px-4 py-2 text-gray-500">{student.email}</td>
                      <td className="px-4 py-2 font-mono">{student.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 3: 결과 */}
        {bulkStep === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '16px',
                padding: '20px',
              }}>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">{results.success.length}</p>
                    <p className="text-sm text-emerald-300">성공</p>
                  </div>
                </div>
              </div>
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '2px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '16px',
                padding: '20px',
              }}>
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <div>
                    <p className="text-2xl font-bold text-red-400">{results.failed.length}</p>
                    <p className="text-sm text-red-300">실패</p>
                  </div>
                </div>
              </div>
            </div>

            {results.success.length > 0 && (
              <div>
                <h4 className="font-semibold text-emerald-700 mb-2">생성된 계정</h4>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">이름</th>
                        <th className="px-4 py-2 text-left">이메일</th>
                        <th className="px-4 py-2 text-left">비밀번호</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {results.success.map((student, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 font-medium">{student.name}</td>
                          <td className="px-4 py-2 text-gray-500">{student.email}</td>
                          <td className="px-4 py-2 font-mono">{student.password}</td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => copyToClipboard(`${student.email}\t${student.password}`, index)}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              {copiedId === index ? (
                                <Check size={16} className="text-emerald-500" />
                              ) : (
                                <Copy size={16} className="text-gray-400" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results.failed.length > 0 && (
              <div>
                <h4 className="font-semibold text-red-700 mb-2">실패한 항목</h4>
                <div className="space-y-2">
                  {results.failed.map((student, index) => (
                    <div key={index} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <p className="font-medium">{student.name} ({student.email})</p>
                      <p className="text-sm text-red-600">{student.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 학생 수정 모달 */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingStudent(null);
        }}
        title="학생 정보 수정"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!editingStudent) return;
                setProcessing(true);
                try {
                  await updateDoc(doc(db, 'users', editingStudent.id), {
                    name: editingStudent.name,
                    nickname: editingStudent.name,
                    studentNumber: editingStudent.studentNumber,
                  });
                  setShowEditModal(false);
                  setEditingStudent(null);
                  loadStudents();
                } catch (error) {
                  alert(`수정 실패: ${error.message}`);
                } finally {
                  setProcessing(false);
                }
              }}
              loading={processing}
            >
              저장
            </Button>
          </>
        }
      >
        {editingStudent && (
          <div className="space-y-4">
            <Input
              label="이름"
              value={editingStudent.name}
              onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
            />
            <Input
              label="번호"
              type="number"
              value={editingStudent.studentNumber || ''}
              onChange={(e) => setEditingStudent({ ...editingStudent, studentNumber: parseInt(e.target.value) })}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                이메일 (읽기 전용)
              </label>
              <input
                type="text"
                value={editingStudent.email}
                disabled
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-500"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StudentManager;
