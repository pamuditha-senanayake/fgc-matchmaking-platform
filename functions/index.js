const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// --- 1. JOIN QUEUE WITH WAGER ---
exports.joinQueue = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');

    const uid = request.auth.uid;
    const wager = request.data.wager || 0; // The amount the user wants to bet
    const userRef = db.collection("matchmaking_queue").doc(uid);

    return db.runTransaction(async (transaction) => {
        // Find someone waiting with the SAME wager (Financial Integrity)
        const waitingQuery = db.collection("matchmaking_queue")
            .where("wager", "==", wager)
            .limit(1);
        const snapshot = await transaction.get(waitingQuery);

        if (snapshot.empty) {
            transaction.set(userRef, {
                uid,
                wager,
                joinedAt: FieldValue.serverTimestamp()
            });
            return { status: "searching" };
        } else {
            const opponentDoc = snapshot.docs[0];
            const opponentId = opponentDoc.id;
            if (opponentId === uid) return { status: "already_in_queue" };

            const matchId = `match_${Date.now()}`;
            const matchRef = db.collection("matches").doc(matchId);

            // Create Match with Escrow info
            transaction.set(matchRef, {
                players: [uid, opponentId],
                wager: wager,
                totalPrize: wager * 2,
                status: "active",
                createdAt: FieldValue.serverTimestamp()
            });

            transaction.delete(opponentDoc.ref);
            return { status: "match_found", matchId };
        }
    });
});

// --- 2. REPORT RESULT & PAYOUT (The "Wallet" logic) ---
exports.reportResult = onCall({ cors: true, region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');

    const { matchId, winnerId } = request.data;
    const matchRef = db.collection("matches").doc(matchId);

    return db.runTransaction(async (transaction) => {
        const matchSnap = await transaction.get(matchRef);

        // FIX: Change matchSnap.exists() to matchSnap.exists
        if (!matchSnap.exists) {
            throw new HttpsError('not-found', 'Match not found');
        }

        const matchData = matchSnap.data();
        if (matchData.status === "completed") return { status: "already_paid" };

        const winnerWalletRef = db.collection("wallets").doc(winnerId);

        transaction.update(winnerWalletRef, {
            balance: FieldValue.increment(matchData.totalPrize)
        });

        transaction.update(matchRef, {
            status: "completed",
            winner: winnerId,
            completedAt: FieldValue.serverTimestamp()
        });

        return { status: "payout_complete 2", prize: matchData.totalPrize };
    });
});