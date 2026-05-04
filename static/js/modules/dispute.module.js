/**
 * DISPUTE.MODULE.JS - Stateless Dispute Resolution Engine
 * Handles complex refund/penalty logic paths with atomic transactions.
 */

class DisputeEngine {
    constructor() {
        this.db = firebase.database();
        this.VERDICTS = {
            SELLER_FAULT: 'VERDICT_SELLER_FAULT',
            BUYER_FAULT: 'VERDICT_BUYER_FAULT',
            BUYER_REMORSE: 'VERDICT_BUYER_REMORSE'
        };
    }

    /**
     * resolveDispute(disputeId, verdict)
     * Principal Resolution Hook
     */
    async resolveDispute(disputeId, verdict) {
        console.log(`[DisputeEngine] Resolving ${disputeId} with ${verdict}`);
        
        try {
            // 1. Fetch Dispute & Order Context
            const disputeSnap = await this.db.ref(`disputes/${disputeId}`).once('value');
            const dispute = disputeSnap.val();
            if (!dispute) throw new Error("Dispute not found.");

            const orderId = dispute.orderId;
            const orderSnap = await this.db.ref(`orders/${orderId}`).once('value');
            const order = orderSnap.val();
            if (!order) throw new Error("Order not found.");

            const buyerId = order.buyerId;
            const sellerId = order.sellerId;
            
            // 1. Resolve Financial Components
            const shipping = parseFloat(order.shippingTotal || order.shipping || 0);
            const escrowFee = parseFloat(order.escrowFee || 0);
            const subtotal = parseFloat(order.subtotal || order.price || 0);
            
            // 2. HARDENED: Calculate the definitive "Total Escrow" as the maximum of stored total and the sum of components.
            // This guarantees that if components (subtotal, shipping, fee) sum to 2030, but total is 2000, 2030 is refunded.
            const calculatedTotal = subtotal + shipping + escrowFee;
            const storedTotal = parseFloat(order.total || order.totalAmount || order.amount || order.totalEscrowAmount || 0);
            const totalEscrowAmount = Math.max(calculatedTotal, storedTotal);
            
            console.log(`[DisputeEngine] Financial Sync Trace:`, {
                orderId,
                subtotal,
                shipping,
                escrowFee,
                calculatedTotal,
                storedTotal,
                finalEscrow: totalEscrowAmount
            });

            // Derive price (the product value) for penalty calculations
            const price = subtotal || (totalEscrowAmount - shipping - escrowFee);
            const escrowId = order.escrowId;

            // 2. Logic Paths
            if (verdict === this.VERDICTS.SELLER_FAULT) {
                await this._handleSellerFault(disputeId, orderId, buyerId, sellerId, price, shipping, escrowFee, totalEscrowAmount, escrowId);
            } else if (verdict === this.VERDICTS.BUYER_FAULT || verdict === this.VERDICTS.BUYER_REMORSE) {
                // Both Buyer Fault and Buyer Remorse follow the same financial logic requested:
                // Refund = Price - 10%, Seller = +10%, Platform = Keep Fees
                await this._handleBuyerFault(disputeId, orderId, buyerId, sellerId, price, verdict, totalEscrowAmount, escrowId);
            } else {
                throw new Error("Invalid verdict path.");
            }

            return { success: true, verdict };

        } catch (error) {
            console.error("[DisputeEngine] Resolution Error:", error);
            throw error;
        }
    }

    async _handleSellerFault(disputeId, orderId, buyerId, sellerId, price, shipping, escrowFee, totalEscrowAmount, escrowId) {
        // Buyer gets back EVERYTHING they paid (Total Escrow = Price + Shipping + EscrowFee)
        const refundToBuyer = totalEscrowAmount;
        const penaltyToSeller = -(shipping + escrowFee);

        // Atomic multi-node update via transaction
        const updates = {};
        
        // Use separate update calls for clarity but triggered sequentially
        // In a true enterprise environment, we'd use a Cloud Function, but for this stateless JS module, 
        // we use the WalletModule's atomic transaction wrapper.
        
        await window.WalletModule.updateBalance(buyerId, refundToBuyer, totalEscrowAmount, {
            type: 'dispute_refund',
            description: `Dispute Refund (Seller Fault) for Order ${orderId}`,
            orderId: orderId
        });
        
        await window.WalletModule.updateBalance(sellerId, penaltyToSeller, 0, {
            type: 'dispute_penalty',
            description: `Dispute Penalty (Seller Fault) for Order ${orderId}`,
            orderId: orderId
        });

        // Update Order & Dispute Status
        await this.db.ref(`orders/${orderId}`).update({ status: 'REFUNDED', resolvedAt: firebase.database.ServerValue.TIMESTAMP });
        if (escrowId) await this.db.ref(`escrows/${escrowId}`).update({ status: 'refunded', resolvedAt: firebase.database.ServerValue.TIMESTAMP });
        await this.db.ref(`disputes/${disputeId}`).update({ 
            status: 'RESOLVED', 
            verdict: 'SELLER_FAULT',
            resolutionSummary: `Seller penalized ${Math.abs(penaltyToSeller)}. Buyer refunded ${refundToBuyer}.`
        });
    }

    /**
     * PATH B: BUYER FAULT
     * Refund Buyer: Price - 10% Holding Fee
     * Compensate Seller: +10% Holding Fee
     * Fees (Shipping/Escrow): Stay with Platform
     */
    async _handleBuyerFault(disputeId, orderId, buyerId, sellerId, price, verdictType = 'BUYER_FAULT', totalEscrowAmount, escrowId) {
        const holdingFee = price * 0.10;
        const refundToBuyer = price - holdingFee;
        const compensationToSeller = holdingFee;

        await window.WalletModule.updateBalance(buyerId, refundToBuyer, totalEscrowAmount, {
            type: 'dispute_refund',
            status: 'dispute refund',
            description: `Dispute Refund (Buyer Fault - 10% Penalty) for Order ${orderId}`,
            orderId: orderId
        });
        
        await window.WalletModule.updateBalance(sellerId, compensationToSeller, 0, {
            type: 'dispute_compensation',
            status: 'completed',
            description: `Dispute Comp (Buyer Fault +10%) for Order ${orderId}`,
            orderId: orderId
        });

        // Update Order & Dispute Status
        await this.db.ref(`orders/${orderId}`).update({ status: 'REFUNDED', resolvedAt: firebase.database.ServerValue.TIMESTAMP });
        if (escrowId) await this.db.ref(`escrows/${escrowId}`).update({ status: 'refunded', resolvedAt: firebase.database.ServerValue.TIMESTAMP });
        await this.db.ref(`disputes/${disputeId}`).update({ 
            status: 'RESOLVED', 
            verdict: verdictType,
            resolutionSummary: verdictType === 'VERDICT_BUYER_REMORSE' 
                ? `Buyer remorse: 10% penalty applied. Seller compensated ${compensationToSeller}. Fees retained by platform.`
                : `Buyer fault return. Seller compensated ${compensationToSeller} holding fee. Buyer refunded ${refundToBuyer}.`
        });
    }
}

window.DisputeEngine = new DisputeEngine();
