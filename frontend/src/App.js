import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA4hkjvBb0cuqzEjwujAHxUwzYaEe8CvoI",
  authDomain: "fgc-matchmaking-demo.firebaseapp.com",
  projectId: "fgc-matchmaking-demo",
  storageBucket: "fgc-matchmaking-demo.firebasestorage.app",
  messagingSenderId: "371031640120",
  appId: "1:371031640120:web:1e212565a3245c9f453ecd",
  measurementId: "G-MH8EGY2JWY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

function App() {
  const [status, setStatus] = useState("Idle");
  const [user, setUser] = useState(null);
  const [wager, setWager] = useState(10); // Default $10 bet
  const [currentMatchId, setCurrentMatchId] = useState(null);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Initialize Wallet for new user
        const walletRef = doc(db, "wallets", currentUser.uid);
        const walletSnap = await getDoc(walletRef);
        if (!walletSnap.exists()) {
          await setDoc(walletRef, { balance: 100 }); // Give $100 starting play money
          setBalance(100);
        } else {
          setBalance(walletSnap.data().balance);
        }

        // Listen to Wallet changes (Real-time balance)
        onSnapshot(walletRef, (snap) => setBalance(snap.data().balance));
      }
    });
    return () => unsubscribe();
  }, []);

  const listenForMatch = (userId) => {
    const unsub = onSnapshot(doc(db, "matchmaking_queue", userId), (docSnap) => {
      if (!docSnap.exists() && status === "Searching...") {
        setStatus("MATCH FOUND! Fighting...");
        unsub();
      }
    });
  };

  const startMatchmaking = async () => {
    try {
      if (balance < wager) return alert("Insufficient Funds!");
      setStatus("Searching...");
      listenForMatch(user.uid);

      const joinQueue = httpsCallable(functions, 'joinQueue');
      const result = await joinQueue({ wager: Number(wager) });

      if (result.data.status === "match_found") {
        setCurrentMatchId(result.data.matchId);
        setStatus(`Match Active! ID: ${result.data.matchId}`);
      }
    } catch (error) { setStatus("Error: " + error.message); }
  };

  const reportWin = async () => {
    try {
      setStatus("Processing Payout...");
      const reportResult = httpsCallable(functions, 'reportResult');
      await reportResult({ matchId: currentMatchId, winnerId: user.uid });
      setStatus("YOU WON! Prize added to wallet.");
      setCurrentMatchId(null);
    } catch (error) { alert(error.message); }
  };

  return (
      <div style={{ textAlign: 'center', marginTop: '50px', backgroundColor: '#121212', color: 'white', minHeight: '100vh' }}>
        <h1>FGC Pro Competition Platform</h1>
        <div style={{ background: '#1e1e1e', padding: '30px', display: 'inline-block', borderRadius: '15px' }}>
          <h2 style={{ color: '#4caf50' }}>Wallet: ${balance}</h2>
          <p>Status: {status}</p>

          {!currentMatchId ? (
              <>
                <input type="number" value={wager} onChange={(e)=>setWager(e.target.value)} style={{padding:'10px', borderRadius:'5px'}} />
                <button onClick={startMatchmaking} style={{padding:'10px 20px', marginLeft:'10px', backgroundColor:'#00d4ff', border:'none', fontWeight:'bold'}}>
                  Bet ${wager} & Find Match
                </button>
              </>
          ) : (
              <button onClick={reportWin} style={{padding:'20px', backgroundColor:'#f44336', color:'white', fontWeight:'bold'}}>
                I WON THE FIGHT
              </button>
          )}
        </div>
      </div>
  );
}
export default App;