// src/TransferModal.js
// 🔥 성능 최적화: React.memo 적용
import React, { memo, useMemo } from "react";

const TransferModal = memo(function TransferModal({
  showTransferModal,
  setShowTransferModal,
  recipients = [],
  transferRecipient,
  setTransferRecipient,
  transferAmount,
  setTransferAmount,
  handleTransfer,
  userId,
  userCash = 0,
}) {

  const handleSubmit = (e) => {
    e.preventDefault();
    handleTransfer();
  };

  // 유효한 수신자 목록 필터링 (본인 제외) 및 가나다순 정렬
  const validRecipients = recipients
    .filter(r => r && r.id && r.id !== userId)
    .sort((a, b) => {
      const nameA = a.name || a.nickname || `사용자 ${a.id.substring(0, 6)}`;
      const nameB = b.name || b.nickname || `사용자 ${b.id.substring(0, 6)}`;
      return nameA.localeCompare(nameB, 'ko');
    });

  return (
    <div className={`${showTransferModal ? 'flex' : 'hidden'} fixed inset-0 bg-black/50 items-center justify-center z-[1000] p-5`} onClick={() => setShowTransferModal(false)}>
      <div className="bg-white rounded-xl p-8 max-w-[450px] w-full shadow-lg relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowTransferModal(false)}
          className="absolute top-4 right-4 bg-transparent border-0 text-2xl cursor-pointer text-gray-500 p-0 w-8 h-8 flex items-center justify-center"
          aria-label="닫기"
        >
          ×
        </button>

        <h2 className="text-xl font-semibold mb-6 text-gray-800">
          💸 송금하기
        </h2>

        <div className="bg-gray-100 rounded-lg p-3 mb-5">
          <p className="text-sm text-gray-600 m-0">
            현재 보유 현금: <strong className="text-gray-800">
              {userCash.toLocaleString()}원
            </strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block mb-2 text-sm font-medium text-gray-700">
              받는 사람
            </label>
            <select
              value={transferRecipient}
              onChange={(e) => setTransferRecipient(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm outline-none transition-colors cursor-pointer bg-white"
              required
            >
              <option value="">받는 분을 선택하세요</option>
              {validRecipients.length > 0 ? (
                validRecipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name || recipient.nickname || `사용자 ${recipient.id.substring(0, 6)}`}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  송금 가능한 학급 친구가 없습니다
                </option>
              )}
            </select>
            {validRecipients.length === 0 && (
              <p className="mt-2 text-xs text-red-500">
                ⚠️ 같은 학급의 다른 사용자가 없거나 데이터를 불러오는 중입니다.
              </p>
            )}
          </div>

          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium text-gray-700">
              송금 금액
            </label>
            <input
              type="number"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="송금할 금액을 입력하세요"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm outline-none transition-colors"
              min="1"
              max={userCash}
              required
            />
            {transferAmount && parseInt(transferAmount) > userCash && (
              <p className="mt-2 text-xs text-red-500">
                보유 현금보다 많은 금액은 송금할 수 없습니다.
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2.5 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowTransferModal(false)}
              className="px-5 py-2.5 rounded-md border-0 text-sm font-medium cursor-pointer transition-all duration-200 bg-gray-200 text-gray-700 mr-2.5 hover:bg-gray-300"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-md border-0 text-sm font-medium cursor-pointer transition-all duration-200 bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!transferRecipient || !transferAmount || parseInt(transferAmount) > userCash || validRecipients.length === 0}
            >
              송금
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default TransferModal;