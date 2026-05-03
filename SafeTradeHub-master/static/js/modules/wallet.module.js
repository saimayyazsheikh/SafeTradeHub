/**
 * WALLET.MODULE.JS - SafeTradeHub Internal Wallet System
 * Core logic for balance updates, restrictions, and atomic transactions.
 */

class WalletModule {
    constructor() {
        this.db = firebase.database();
    }

    /**
     * updateBalance(uid, amount)
     * Atomically updates a user's wallet balance.
     * Allows negative balances.
     */
    async updateBalance(uid, amount, escrowAmountToRelease = 0, transactionDetails = null) {
        if (!uid) throw new Error("User ID is required for wallet operations.");
        const walletRef = this.db.ref(`users/${uid}/wallet`);

        try {
            const result = await walletRef.transaction((currentData) => {
                // If node doesn't exist, initialize it
                if (currentData === null) {
                    return {
                        balance: amount,
                        in_escrow: 0,
                        lastUpdated: firebase.database.ServerValue.TIMESTAMP
                    };
                }

                // Calculate new balance
                const oldBalance = parseFloat(currentData.balance || 0);
                const newBalance = oldBalance + parseFloat(amount);

                // Update data
                currentData.balance = parseFloat(newBalance.toFixed(2));
                
                // Release escrow if specified
                if (escrowAmountToRelease) {
                    const currentEscrow = parseFloat(currentData.in_escrow || 0);
                    currentData.in_escrow = Math.max(0, currentEscrow - parseFloat(escrowAmountToRelease));
                }

                currentData.lastUpdated = firebase.database.ServerValue.TIMESTAMP;
                
                // Flag restriction if negative
                currentData.isRestricted = newBalance < 0;

                return currentData;
            });

            if (result.committed) {
                console.log(`[Wallet] Updated UID ${uid}: ${amount} (New Balance: ${result.snapshot.val().balance})`);
                
                // Record transaction in history if details provided
                if (transactionDetails) {
                    const txId = this.db.ref('transactions').push().key;
                    await this.db.ref(`transactions/${txId}`).set({
                        id: txId,
                        userId: uid,
                        type: transactionDetails.type || 'refund',
                        amount: amount,
                        description: transactionDetails.description || 'Wallet Update',
                        orderId: transactionDetails.orderId || null,
                        status: transactionDetails.status || 'completed',
                        createdAt: firebase.database.ServerValue.TIMESTAMP
                    });
                }

                return result.snapshot.val();
            } else {
                throw new Error("Transaction not committed.");
            }
        } catch (error) {
            console.error("[Wallet] Update Failed:", error);
            throw error;
        }
    }

    /**
     * checkRestriction(uid)
     * Checks if a user is restricted due to negative balance.
     */
    async checkRestriction(uid) {
        const snapshot = await this.db.ref(`users/${uid}/wallet/balance`).once('value');
        const balance = snapshot.val() || 0;
        return balance < 0;
    }
}

// Export for use in other modules
window.WalletModule = new WalletModule();
