// Wallet Logic

// Note: db, auth, storage are already initialized in firebase-config.js
// We can use them directly.

let currentUser = null;

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
window.setAmount = setAmount;
window.showPaymentDetails = showPaymentDetails;
window.copyAccountDetails = copyAccountDetails;
window.previewScreenshot = previewScreenshot;
window.processDeposit = processDeposit;

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
    } else {
        console.error('Firebase Auth not initialized');
    }
});

// Load Wallet Data (Balance & Transactions)
function loadWalletData() {
    if (!currentUser) return;

    // Listen for wallet balance changes
    db.ref(`users/${currentUser.uid}/wallet`).on('value', snapshot => {
        const wallet = snapshot.val() || {};
        updateWalletUI(wallet);
    });

    // Load Transactions (Deposits for now)
    loadTransactions();
}

function updateWalletUI(wallet) {
    const balance = wallet.balance || 0;
    const deposited = wallet.totalDeposited || 0;
    const spent = wallet.totalSpent || 0;
    const escrow = wallet.escrow || 0;

    document.getElementById('walletBalance').textContent = `RS ${balance.toLocaleString()}`;
    document.getElementById('totalDeposited').textContent = `RS ${deposited.toLocaleString()}`;
    document.getElementById('totalSpent').textContent = `RS ${spent.toLocaleString()}`;
    document.getElementById('escrowHeld').textContent = `RS ${escrow.toLocaleString()}`;
}

function loadTransactions() {
    // Fetch deposits
    db.ref('deposits').orderByChild('userId').equalTo(currentUser.uid).on('value', snapshot => {
        const deposits = [];
        snapshot.forEach(child => {
            deposits.push({ id: child.key, ...child.val(), type: 'Deposit' });
        });

        // Sort by date desc
        deposits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        renderTransactions(deposits);
    });
}

function renderTransactions(transactions) {
    const tbody = document.getElementById('transactionsList');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No transactions found</td></tr>';
        return;
    }

    transactions.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.createdAt).toLocaleDateString()}</td>
            <td>${t.type} (${t.method})</td>
            <td>RS ${parseFloat(t.amount).toLocaleString()}</td>
            <td><span class="badge badge-${getStatusBadge(t.status)}">${t.status}</span></td>
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
