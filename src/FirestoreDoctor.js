
// src/FirestoreDoctor.js
import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { db } from './firebase';
import { doc, getDoc, setDoc, runTransaction, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import './FirestoreDoctor.css';

const TestResult = ({ title, status, message, data }) => {
  let statusClass = '';
  if (status === 'SUCCESS') statusClass = 'status-success';
  else if (status === 'FAILURE') statusClass = 'status-failure';
  else if (status === 'PENDING') statusClass = 'status-pending';

  return (
    <div className="test-result">
      <h4>{title}</h4>
      <p><strong>Status:</strong> <span className={statusClass}>{status}</span></p>
      <p><strong>Message:</strong> {message}</p>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
};

export default function FirestoreDoctor() {
  const { user, userDoc, isAdmin } = useAuth();
  const [results, setResults] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState(null);

  const classCode = userDoc?.classCode;
  const goalId = classCode ? `${classCode}_goal` : null;
  const userId = user?.uid;

  const handleRecovery = async () => {
    if (!isAdmin()) {
      setRecoveryStatus({ status: 'FAILURE', message: 'Only admins can perform data recovery.' });
      return;
    }
    if (!classCode) {
      setRecoveryStatus({ status: 'FAILURE', message: 'No classCode found.' });
      return;
    }

    setRecoveryStatus({ status: 'PENDING', message: 'Starting client-side data recovery...' });

    try {
      const logsQuery = query(
        collection(db, "activity_logs"),
        where("classCode", "==", classCode),
        where("type", "==", "쿠폰 기부")
      );

      setRecoveryStatus({ status: 'PENDING', message: 'Fetching donation logs...' });
      const logsSnapshot = await getDocs(logsQuery);

      if (logsSnapshot.empty) {
        setRecoveryStatus({ status: 'SUCCESS', message: `No donation logs found for class ${classCode}. Nothing to recover.` });
        return;
      }

      setRecoveryStatus({ status: 'PENDING', message: `Found ${logsSnapshot.size} donation logs. Processing...` });

      let totalProgress = 0;
      const recoveredDonations = [];

      logsSnapshot.forEach(doc => {
        const log = doc.data();
        const amount = log.metadata?.amount || 0;
        if (amount > 0) {
          totalProgress += amount;
          recoveredDonations.push({
            id: doc.id,
            userId: log.userId,
            userName: log.userName,
            amount: amount,
            message: log.metadata?.message || "",
            timestamp: log.timestamp,
            classCode: log.classCode,
          });
        }
      });

      recoveredDonations.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

      const goalRef = doc(db, "goals", goalId);
      setRecoveryStatus({ status: 'PENDING', message: 'Writing recovered data to goal document...' });

      await setDoc(goalRef, {
        progress: totalProgress,
        donations: recoveredDonations,
        donationCount: recoveredDonations.length,
        updatedAt: serverTimestamp(),
        lastRecoveryAt: serverTimestamp(),
      }, { merge: true });

      setRecoveryStatus({
        status: 'SUCCESS',
        message: `Client-side recovery successful for ${classCode}.`,
        data: {
          recoveredProgress: totalProgress,
          recoveredDonationCount: recoveredDonations.length,
        }
      });

    } catch (error) {
      setRecoveryStatus({ status: 'FAILURE', message: error.message, data: error });
    }
  };

  const addResult = (result) => {
    setResults(prev => [...prev, result]);
  };

  const runTests = async () => {
    setIsTesting(true);
    setResults([]);

    // 1. Initial State Check
    addResult({ title: '1. Initial State', status: 'PENDING', message: 'Checking initial user and goal state...' });
    if (!user || !userId) {
      addResult({ title: '1. Initial State', status: 'FAILURE', message: 'User is not logged in.' });
      setIsTesting(false);
      return;
    }
    if (!classCode || !goalId) {
      addResult({ title: '1. Initial State', status: 'FAILURE', message: `User is missing classCode. Current classCode: ${classCode}` });
      setIsTesting(false);
      return;
    }
    addResult({
      title: '1. Initial State',
      status: 'SUCCESS',
      message: 'User, UID, and classCode are present.',
      data: { userId, classCode, goalId, isAdmin: isAdmin() }
    });

    const userRef = doc(db, 'users', userId);
    const goalRef = doc(db, 'goals', goalId);
    const testField = `doctorTest_${Date.now()}`;
    const testData = { [testField]: 'write_test_successful' };

    // 2. Direct Write Test (User Document)
    try {
      addResult({ title: '2. User Doc Write Test', status: 'PENDING', message: 'Attempting to write to your user document...' });
      await setDoc(userRef, testData, { merge: true });
      const userSnap = await getDoc(userRef);
      if (userSnap.data()?.[testField] === 'write_test_successful') {
        addResult({ title: '2. User Doc Write Test', status: 'SUCCESS', message: 'Successfully wrote to and verified user document.' });
      } else {
        throw new Error('Write verification failed.');
      }
    } catch (error) {
      addResult({ title: '2. User Doc Write Test', status: 'FAILURE', message: error.message, data: error });
      setIsTesting(false);
      return;
    }

    // 3. Direct Write Test (Goal Document)
    try {
      addResult({ title: '3. Goal Doc Write Test', status: 'PENDING', message: `Attempting to write to goals document: ${goalId}` });
      await setDoc(goalRef, testData, { merge: true });
      const goalSnap = await getDoc(goalRef);
      if (goalSnap.data()?.[testField] === 'write_test_successful') {
        addResult({ title: '3. Goal Doc Write Test', status: 'SUCCESS', message: 'Successfully wrote to and verified goal document.' });
      } else {
        throw new Error('Write verification failed.');
      }
    } catch (error) {
      addResult({ title: '3. Goal Doc Write Test', status: 'FAILURE', message: error.message, data: error });
      setIsTesting(false);
      return;
    }

    // 4. Transaction Test
    const transactionTestField = `doctorTransactionTest_${Date.now()}`;
    try {
      addResult({ title: '4. Atomic Transaction Test', status: 'PENDING', message: 'Running a transaction to write to both documents...' });
      await runTransaction(db, async (transaction) => {
        transaction.set(userRef, { [transactionTestField]: 'transaction_successful' }, { merge: true });
        transaction.set(goalRef, { [transactionTestField]: 'transaction_successful' }, { merge: true });
      });
      addResult({ title: '4. Atomic Transaction Test', status: 'SUCCESS', message: 'Firestore reported transaction as successful.' });
    } catch (error) {
      addResult({ title: '4. Atomic Transaction Test', status: 'FAILURE', message: `Firestore reported transaction as FAILED: ${error.message}`, data: error });
      setIsTesting(false);
      return;
    }

    // 5. Final Verification
    try {
        addResult({ title: '5. Final Verification', status: 'PENDING', message: 'Verifying transaction results...' });
        const finalUserSnap = await getDoc(userRef);
        const finalGoalSnap = await getDoc(goalRef);
        const userVerified = finalUserSnap.data()?.[transactionTestField] === 'transaction_successful';
        const goalVerified = finalGoalSnap.data()?.[transactionTestField] === 'transaction_successful';

        if (userVerified && goalVerified) {
            addResult({ title: '5. Final Verification', status: 'SUCCESS', message: 'Both documents were successfully updated by the transaction.' });
        } else {
            addResult({
                title: '5. Final Verification',
                status: 'FAILURE',
                message: 'Data inconsistency detected! The transaction was not atomic.',
                data: {
                    userDocumentUpdated: userVerified,
                    goalDocumentUpdated: goalVerified,
                    userData: finalUserSnap.data(),
                    goalData: finalGoalSnap.data(),
                }
            });
        }
    } catch (error) {
        addResult({ title: '5. Final Verification', status: 'FAILURE', message: error.message, data: error });
    }

    setIsTesting(false);
  };

  return (
    <div className="firestore-doctor">
      <h2>Firestore Doctor: Diagnostic Page</h2>
      <p>This page runs a series of tests to diagnose the data inconsistency issue.</p>
      <p>Click the button below to start the tests. The results will appear below.</p>
      <button onClick={runTests} disabled={isTesting}>
        {isTesting ? 'Running Tests...' : 'Start Diagnostic Tests'}
      </button>
      <hr />
      <div className="results-container">
        {results.map((result, index) => (
          <TestResult key={index} {...result} />
        ))}
      </div>

      <hr />
      <h2>Data Recovery</h2>
      <p>Click the button below to restore the goal progress and donation history from the activity logs. This should only be run once.</p>
      <button onClick={handleRecovery} disabled={recoveryStatus?.status === 'PENDING'}>
        {recoveryStatus?.status === 'PENDING' ? 'Recovering Data...' : 'Start Data Recovery'}
      </button>
      {recoveryStatus && <TestResult title="Recovery Status" {...recoveryStatus} />}
    </div>
  );
}
