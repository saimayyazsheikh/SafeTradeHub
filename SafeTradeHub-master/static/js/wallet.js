// Wallet Logic

// Note: db, auth, storage are already initialized in firebase-config.js
// We can use them directly.

let currentUser = null;
let cachedBalance = 0;

// Account Details Configuration
const accountDetails = {
    easypaisa: {
        title: 'Muhammad Saim Ayyaz',
        number: '03107867246',
        type: 'Easypaisa Account'
    },
    jazzcash: {
        title: 'Muhammad Saim Ayyaz',
        number: '03107867246',
        type: 'Jazzcash Account'
    },
    meezan: {
        title: 'Muhammad Saim Ayyaz',
        number: '88010108334074',
        type: 'Meezan Bank Account'
    }
};

// Make functions globally available
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;
window.setAmount = setAmount;
window.showPaymentDetails = showPaymentDetails;
window.copyAccountDetails = copyAccountDetails;
window.previewScreenshot = previewScreenshot;
window.processDeposit = processDeposit;
window.processWithdrawal = processWithdrawal;
window.viewSlip = viewSlip;
window.closeSlipViewer = closeSlipViewer;
window.applyFilters = applyFilters;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if auth is available
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                loadWalletData();
            } else {
                window.location.href = 'auth.html';
            }
        });

        // Validation listener
        const amountInput = document.getElementById('withdrawAmount');
        if (amountInput) {
            amountInput.addEventListener('input', validateWithdrawalAmount);
        }
    } else {
        console.error('Firebase Auth not initialized');
    }
});

// Load Wallet Data (Balance & Transactions)
async function loadWalletData() {
    if (!currentUser) return;

    // Fetch Role for UI Swapping
    const userSnap = await db.ref(`users/${currentUser.uid}`).once('value');
    const userData = userSnap.val() || {};
    toggleRoleUI(userData.role);

    // Listen for wallet balance changes
    db.ref(`wallets/${currentUser.uid}`).on('value', snapshot => {
        const wallet = snapshot.val() || {};
        cachedBalance = wallet.available_balance || 0;
        updateWalletUI(wallet);
        
        // Update max withdraw hint if applicable
        const hint = document.getElementById('maxWithdrawHint');
        if (hint) hint.textContent = `Max available: RS ${cachedBalance.toLocaleString()}`;
        
        // Trigger validation if modal is open
        if (document.getElementById('withdrawModal').style.display === 'flex') {
            validateWithdrawalAmount();
        }
    });

    // Load Transactions
    loadTransactions();
}

function toggleRoleUI(role) {
    const mainBtn = document.getElementById('mainActionBtn');
    const sideBtn = document.getElementById('sideActionBtn');
    
    if (role === 'Seller') {
        if (mainBtn) {
            mainBtn.onclick = openWithdrawModal;
            mainBtn.style.background = 'var(--danger)';
            mainBtn.innerHTML = '<i class="fas fa-paper-plane" style="color:white;"></i><span>Withdraw Tokens</span>';
        }
        if (sideBtn) {
            sideBtn.onclick = openWithdrawModal;
            sideBtn.innerHTML = '<i class="fas fa-hand-holding-usd"></i><span>Withdraw</span><small style="color:var(--text-secondary);font-size:0.8rem;">Request payout</small>';
        }
    } else {
        // Buyer logic - switch back to deposits
        if (mainBtn) {
            mainBtn.onclick = openDepositModal;
            mainBtn.style.background = 'var(--primary-color)';
            mainBtn.innerHTML = '<i class="fas fa-plus" style="color:white;"></i><span>Add Tokens</span>';
        }
        if (sideBtn) {
            sideBtn.onclick = openDepositModal;
            sideBtn.innerHTML = '<i class="fas fa-credit-card"></i><span>Add Tokens</span><small style="color:var(--text-secondary);font-size:0.8rem;">Deposit funds instantly</small>';
        }
    }
}

function updateWalletUI(wallet) {
    const balance = wallet.available_balance || 0;
    const withdrawn = wallet.total_withdrawn || 0;
    const escrow = wallet.in_escrow || 0;
    const locked = wallet.locked_balance || 0;

    document.getElementById('walletBalance').textContent = `RS ${balance.toLocaleString()}`;
    const tw = document.getElementById('totalWithdrawn');
    if (tw) tw.textContent = `RS ${withdrawn.toLocaleString()}`;
    document.getElementById('escrowHeld').textContent = `RS ${escrow.toLocaleString()}`;
    
    const lb = document.getElementById('lockedBalance');
    if (lb) lb.textContent = `RS ${locked.toLocaleString()}`;
}

function loadTransactions() {
    const filterType = document.getElementById('transactionTypeFilter')?.value || 'all';
    
    // Listen to multiple nodes and merge
    const depositsRef = db.ref('deposits').orderByChild('userId').equalTo(currentUser.uid);
    const withdrawalsRef = db.ref('withdrawal_requests').orderByChild('userId').equalTo(currentUser.uid);
    const walletInternalRef = db.ref(`transactions/${currentUser.uid}`);

    Promise.all([
        depositsRef.once('value'),
        withdrawalsRef.once('value'),
        walletInternalRef.once('value')
    ]).then(([depSnap, witSnap, intSnap]) => {
        const list = [];
        
        depSnap.forEach(c => list.push({ id: c.key, ...c.val(), type: 'Deposit' }));
        witSnap.forEach(c => list.push({ id: c.key, ...c.val(), type: 'Withdrawal' }));
        intSnap.forEach(c => {
            const data = c.val();
            // Avoid duplicates if already in witSnap
            if (data.type !== 'Withdrawal') {
                list.push({ id: c.key, ...data });
            }
        });

        // Filter
        let filtered = list;
        if (filterType !== 'all') {
            filtered = list.filter(t => t.type.toLowerCase() === filterType.toLowerCase());
        }

        // Sort by date desc
        filtered.sort((a, b) => (b.createdAt || b.timestamp) - (a.createdAt || a.timestamp));

        renderTransactions(filtered);
    });
}

function applyFilters() {
    loadTransactions();
}

function renderTransactions(transactions) {
    const tbody = document.getElementById('transactionsList');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">No transactions found</td></tr>';
        return;
    }

    transactions.forEach(t => {
        const tr = document.createElement('tr');
        const date = new Date(t.createdAt || t.timestamp).toLocaleDateString();
        const type = t.type;
        const method = t.method || (t.bankDetails ? t.bankDetails.bankName : 'System');
        const amount = parseFloat(t.amount).toLocaleString();
        const status = t.status;
        
        let actionHtml = '';
        if (t.slipUrl) {
            actionHtml = `<button class="btn-sm btn-outline-success" onclick="viewSlip('${t.slipUrl}')" style="padding: 2px 8px; font-size: 0.75rem;">
                            <i class="fas fa-file-invoice"></i> View Slip
                          </button>`;
        }

        tr.innerHTML = `
            <td>${date}</td>
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600;">${type}</span>
                    <small style="color:var(--text-secondary);">${method}</small>
                </div>
            </td>
            <td style="color: ${type === 'Withdrawal' || type === 'Escrow Hold' ? '#ef4444' : '#10b981'}; font-weight:600;">
                ${type === 'Withdrawal' || type === 'Escrow Hold' ? '-' : '+'} RS ${amount}
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="badge badge-${getStatusBadge(status)}">${status.toUpperCase()}</span>
                    ${actionHtml}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getStatusBadge(status) {
    switch (status) {
        case 'approved': return 'success';
        case 'pending': return 'warning';
        case 'rejected': return 'danger';
        default: return 'secondary';
    }
}

// Modal Functions
function openDepositModal() {
    document.getElementById('depositModal').style.display = 'flex';
}

function closeDepositModal() {
    document.getElementById('depositModal').style.display = 'none';
    document.getElementById('depositForm').reset();
    document.getElementById('accountDetailsSection').style.display = 'none';
    document.getElementById('screenshotPreview').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
}

function openWithdrawModal() {
    document.getElementById('withdrawModal').style.display = 'flex';
    validateWithdrawalAmount(); // Initialize state
}

function closeWithdrawModal() {
    document.getElementById('withdrawModal').style.display = 'none';
    document.getElementById('withdrawForm').reset();
}

function viewSlip(url) {
    document.getElementById('slipImage').src = url;
    document.getElementById('slipDownloadBtn').href = url;
    document.getElementById('slipViewerModal').style.display = 'flex';
}

function closeSlipViewer() {
    document.getElementById('slipViewerModal').style.display = 'none';
}

function validateWithdrawalAmount() {
    const input = document.getElementById('withdrawAmount');
    const btn = document.getElementById('proceedWithdrawBtn');
    const error = document.getElementById('withdrawError');
    const val = parseFloat(input.value) || 0;

    if (val > cachedBalance) {
        input.style.borderColor = '#ef4444';
        error.textContent = `Insufficient balance. You only have RS ${cachedBalance.toLocaleString()} available.`;
        error.style.display = 'block';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    } else if (val <= 0 || val < 500) {
        input.style.borderColor = '#d1d5db';
        error.textContent = val > 0 ? 'Minimum withdrawal is RS 500.' : '';
        error.style.display = val > 0 ? 'block' : 'none';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    } else {
        input.style.borderColor = '#10b981';
        error.style.display = 'none';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

function setAmount(amount) {
    document.getElementById('depositAmount').value = amount;
}

function showPaymentDetails(method) {
    const details = accountDetails[method];
    if (details) {
        const html = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <strong>Account Title:</strong> <span>${details.title}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <strong>Account Number:</strong> <span id="accNumToCopy" style="font-family: monospace; font-size: 1rem;">${details.number}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <strong>Type:</strong> <span>${details.type}</span>
            </div>
        `;
        document.getElementById('accountInfo').innerHTML = html;
        document.getElementById('accountDetailsSection').style.display = 'block';
    }
}

function copyAccountDetails() {
    const num = document.getElementById('accNumToCopy').textContent;
    navigator.clipboard.writeText(num).then(() => {
        showToast('Account number copied!');
    });
}

function previewScreenshot(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('screenshotPreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
            document.getElementById('uploadPlaceholder').style.display = 'none';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// Process Deposit
async function processDeposit() {
    const amount = document.getElementById('depositAmount').value;
    const method = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    const screenshotFile = document.getElementById('paymentScreenshot').files[0];
    const agreed = document.getElementById('agreeTerms').checked;

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    if (!method) {
        showToast('Please select a payment method', 'error');
        return;
    }
    if (!screenshotFile) {
        showToast('Please upload the payment screenshot', 'error');
        return;
    }
    if (!agreed) {
        showToast('Please confirm you have sent the payment', 'error');
        return;
    }

    try {
        showLoading(true);

        // 1. Upload Screenshot
        const timestamp = Date.now();
        const filename = `deposits/${currentUser.uid}/${timestamp}_${screenshotFile.name}`;
        const storageRef = storage.ref(filename);

        const metadata = {
            contentType: screenshotFile.type
        };

        const uploadTask = await storageRef.put(screenshotFile, metadata);
        const downloadURL = await uploadTask.ref.getDownloadURL();

        // 2. Save Deposit Request
        const depositData = {
            userId: currentUser.uid,
            userName: currentUser.displayName || 'User',
            amount: parseFloat(amount),
            method: method,
            screenshotUrl: downloadURL,
            status: 'pending',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await db.ref('deposits').push(depositData);
        
        // Notify User
        await db.ref(`users/${currentUser.uid}/notifications`).push({
            title: 'Deposit Submitted',
            message: `Your deposit request for RS ${parseFloat(amount).toLocaleString()} has been received and is pending verification.`,
            type: 'payment',
            read: false,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        showLoading(false);
        closeDepositModal();

        // Show Success Modal
        document.getElementById('successModal').style.display = 'flex';

    } catch (error) {
        console.error('Deposit Error:', error);
        showLoading(false);
        showToast('Failed to submit deposit: ' + error.message, 'error');
    }
}

// Process Withdrawal
async function processWithdrawal() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const bankName = document.getElementById('bankName').value.trim();
    const accountTitle = document.getElementById('accountTitle').value.trim();
    const accountNumber = document.getElementById('accountNumber').value.trim();

    if (!amount || amount < 500) {
        showToast('Minimum withdrawal is RS 500', 'error');
        return;
    }
    if (!bankName || !accountTitle || !accountNumber) {
        showToast('Please fill all bank details', 'error');
        return;
    }

    try {
        showLoading(true);
        const idToken = await currentUser.getIdToken();

        const response = await fetch('/api/v1/wallet/withdraw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                amount: amount,
                userName: currentUser.displayName || 'Seller',
                userEmail: currentUser.email,
                bankDetails: {
                    bankName: bankName,
                    title: accountTitle,
                    accountNumber: accountNumber
                }
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Withdrawal request submitted successfully!');
            closeWithdrawModal();
            loadTransactions(); // Refresh list
        } else {
            showToast(result.error || 'Withdrawal failed', 'error');
        }
    } catch (error) {
        console.error('Withdrawal Error:', error);
        showToast('System error processing withdrawal', 'error');
    } finally {
        showLoading(false);
    }
}

function closeSuccessModal() {
    document.getElementById('successModal').style.display = 'none';
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Add styles if not present
    if (!document.getElementById('toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            .toast {
                background: #333;
                color: white;
                padding: 12px 24px;
                border-radius: 4px;
                margin-top: 10px;
                animation: fadeIn 0.3s, fadeOut 0.3s 2.7s;
                opacity: 0;
                animation-fill-mode: forwards;
            }
            .toast-success { background: #28a745; }
            .toast-error { background: #dc3545; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
