document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sellerId = urlParams.get('id');

    if (!sellerId) {
        alert('No user specified.');
        window.location.href = 'index.html';
        return;
    }

    if (!firebase.apps.length) {
        console.error("Firebase not initialized");
        return;
    }

    const db = firebase.database();

    // UI Elements
    const sellerNameEl = document.getElementById('sellerName');
    const sellerNameHeader = document.getElementById('sellerNameHeader');
    const sellerAvatarEl = document.getElementById('sellerAvatar');
    const sellerJoinDateEl = document.getElementById('sellerJoinDate');
    const sellerEmailEl = document.getElementById('sellerEmail');
    const sellerPhoneEl = document.getElementById('sellerPhone');
    const sellerPhoneContainer = document.getElementById('sellerPhoneContainer');
    const sellerLocationEl = document.getElementById('sellerLocation');
    const chatBtn = document.getElementById('chatWithSellerBtn');
    const productCountEl = document.getElementById('productCount');
    const grid = document.getElementById('sellerProductsGrid');

    // 1. Fetch Seller Details (Granularly to avoid permission errors)
    try {
        const fetchField = (path) => db.ref(path).once('value').then(s => s.val()).catch(() => null);

        const [sellerDisplayName, sellerFullName, sellerUsername, sellerProfilePic, sellerAvatar, sellerEmail, sellerBusinessEmail, sellerPhone, city, country, createdAt] = await Promise.all([
            fetchField(`users/${sellerId}/displayName`),
            fetchField(`users/${sellerId}/fullName`),
            fetchField(`users/${sellerId}/username`),
            fetchField(`users/${sellerId}/profilePic`),
            fetchField(`users/${sellerId}/profile/avatar`),
            fetchField(`users/${sellerId}/email`),
            fetchField(`users/${sellerId}/businessEmail`),
            fetchField(`users/${sellerId}/phone`),
            fetchField(`users/${sellerId}/address/city`),
            fetchField(`users/${sellerId}/address/country`),
            fetchField(`users/${sellerId}/createdAt`)
        ]);

        const sellerName = sellerDisplayName || sellerFullName || sellerUsername || 'Unknown User';
        const finalEmail = sellerEmail || sellerBusinessEmail || 'No public email';
        const finalPic = sellerProfilePic || sellerAvatar || '/static/images/avatar-placeholder.png';

        // Update UI
        sellerNameEl.textContent = sellerName;
        if (sellerNameHeader) sellerNameHeader.textContent = sellerName;
        sellerEmailEl.textContent = finalEmail;
        sellerAvatarEl.src = finalPic;

        if (createdAt) {
            const date = new Date(createdAt);
            sellerJoinDateEl.textContent = `Joined: ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
        }

        if (sellerPhone) {
            sellerPhoneEl.textContent = sellerPhone;
            sellerPhoneContainer.style.display = 'flex';
        }

        let location = 'Location not specified';
        if (city || country) {
            location = [city, country].filter(Boolean).join(', ');
        }
        sellerLocationEl.textContent = location;

        // Chat Button Logic
        if (chatBtn) {
            chatBtn.onclick = () => {
                const currentUser = firebase.auth().currentUser;
                if (!currentUser) {
                    window.NotificationManager?.showToast('Login Required', 'Please login to start a chat.', 'info');
                    setTimeout(() => {
                        window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent(window.location.href);
                    }, 1500);
                    return;
                }

                if (currentUser.uid === sellerId) {
                    window.NotificationManager?.showToast('Nice Try', "You can't chat with yourself!", 'info');
                    return;
                }

                if (window.SellerChatApp) {
                    window.SellerChatApp.openChat(sellerId, null, 'General Inquiry');
                } else {
                    alert('Chat system is initializing. Please try again in a moment.');
                }
            };
        }

        // 2. Setup Reporting
        initReporting(sellerId);

        // 3. Start Reputation & Reviews Engine
        listenToUserReputation(sellerId);
        fetchUserReviews(sellerId);

        // 4. Fetch Products
        fetchSellerProducts(sellerId, db, grid, productCountEl);

    } catch (error) {
        console.error("Error fetching user data:", error);
        sellerNameEl.textContent = 'Error loading user';
    }
});

async function fetchSellerProducts(sellerId, db, grid, countEl) {
    try {
        const productsSnap = await db.ref('products').orderByChild('sellerId').equalTo(sellerId).once('value');
        const products = [];
        productsSnap.forEach(child => {
            const p = child.val();
            const auction = p.auction || {};
            const isAuction = auction.enabled === true;
            
            // Calculate auction end (matching category-manager.js logic)
            const auctionStartStr = auction.updatedAt || p.updatedAt || p.createdAt;
            const auctionStart = auctionStartStr ? new Date(auctionStartStr).getTime() : Date.now();
            const durationMs = (auction.duration || 7) * 24 * 60 * 60 * 1000;
            const auctionEndTime = auction.endTime || (auctionStart + durationMs);
            const isAuctionEnded = isAuction && (auction.ended === true || Date.now() >= auctionEndTime);

            const isSold = p.status === 'sold' || p.sold === true || p.sold === 'true' || (isAuction && auction.winnerId);
            const isActive = p.isActive !== false && p.status === 'active';

            // Only show active/available products and non-ended/non-sold auctions
            if (isActive && !isAuctionEnded && !isSold) {
                products.push({ id: child.key, ...p });
            }
        });

        if (countEl) countEl.textContent = `${products.length} product${products.length !== 1 ? 's' : ''}`;
        
        // Ensure AuthManager is ready
        if (window.AuthManager && !window.AuthManager.isInitialized) {
            await window.AuthManager.waitForInit();
        }
        const authUser = window.AuthManager ? window.AuthManager.getCurrentUser() : null;
        const isSeller = authUser && (authUser.role || '').toLowerCase() === 'seller';

        if (products.length === 0) {
            grid.innerHTML = `
                <div class="sp-empty-state" style="grid-column: 1/-1;">
                    <i class="fas fa-box-open"></i>
                    <p>No active listings from this user.</p>
                </div>`;
            return;
        }

        grid.innerHTML = products.map(p => {
            let imgUrl = '/static/images/placeholder.jpg';
            if (Array.isArray(p.images) && p.images.length > 0) {
                imgUrl = p.images.find(img => img.isMain)?.url || p.images[0].url;
            } else if (typeof p.images === 'string') {
                imgUrl = p.images;
            }

            return `
            <article class="card">
                <div class="card-img">
                    <img src="${imgUrl}" alt="${p.name}" loading="lazy" onerror="this.src='/static/images/placeholder.jpg'">
                    ${p.auction?.enabled ? '<div class="card-badge">Auction</div>' : ''}
                </div>
                <div class="card-content">
                    <h3 class="card-title">${p.name}</h3>
                    <p class="card-description">${p.description || 'No description available.'}</p>
                    <div class="card-price">RS ${parseFloat(p.price).toLocaleString()}</div>
                    <div class="card-actions">
                        ${isSeller ? `
                        <button class="card-btn card-btn-primary" disabled title="Sellers cannot purchase products" style="opacity:0.6; cursor:not-allowed; flex:1; background:#64748b;">
                            <i class="fas fa-ban"></i> Seller Mode
                        </button>
                        ` : `
                        <button class="card-btn card-btn-primary" onclick="addToCart('${p.id}', '${p.name}', ${p.price}, '${imgUrl}')">
                            <i class="fas fa-cart-plus"></i> Add
                        </button>
                        `}
                        <a href="category-mobile.html?id=${p.id}" class="card-btn card-btn-secondary">
                            <i class="fas fa-eye"></i> View
                        </a>
                    </div>
                </div>
            </article>
            `;
        }).join('');

    } catch (error) {
        console.error("Error fetching products:", error);
        grid.innerHTML = '<div class="sp-empty-state">Error loading products.</div>';
    }
}

function addToCart(id, name, price, img) {
    // 1. Permission Check
    if (window.AuthManager && !window.AuthManager.checkPermission('add_to_cart')) {
        return;
    }

    const sellerName = document.getElementById('sellerName')?.textContent || 'SafeTradeHub';
    const urlParams = new URLSearchParams(window.location.search);
    const sellerId = urlParams.get('id');

    if (window.SafeTradeHub && window.SafeTradeHub.cart) {
        window.SafeTradeHub.cart.add({
            id: id,
            title: name,
            price: price,
            img: img,
            sellerId: sellerId,
            sellerName: sellerName
        });
    } else {
        // Fallback for legacy
        let cart = JSON.parse(localStorage.getItem('sthub_cart')) || [];
        const existing = cart.find(item => item.id === id);
        if (existing) {
            existing.qty = (existing.qty || 1) + 1;
        } else {
            cart.push({ id, title: name, price, img, qty: 1, sellerId, sellerName, addedAt: new Date().toISOString() });
        }
        localStorage.setItem('sthub_cart', JSON.stringify(cart));
        window.dispatchEvent(new Event('storage'));
        window.NotificationManager?.showToast('Cart Updated', 'Product added to cart!', 'success');
    }
}

function renderStars(rating) {
    const starsContainer = document.getElementById('sellerStars');
    if (!starsContainer) return;
    
    starsContainer.innerHTML = '';
    const rounded = Math.round(rating * 2) / 2;

    for (let i = 1; i <= 5; i++) {
        if (i <= rounded) {
            starsContainer.innerHTML += '<i class="fas fa-star"></i>';
        } else if (i - 0.5 <= rounded) {
            starsContainer.innerHTML += '<i class="fas fa-star-half-alt"></i>';
        } else {
            starsContainer.innerHTML += '<i class="far fa-star"></i>';
        }
    }
}

function listenToUserReputation(uid) {
    firebase.database().ref(`users/${uid}/reputation`).on('value', (snap) => {
        const rep = snap.val() || { averageRating: 0, totalReviews: 0, trustScore: 100 };
        renderStars(rep.averageRating || 0);
        const ratingCountEl = document.getElementById('sellerRatingCount');
        if (ratingCountEl) {
            ratingCountEl.textContent = `${parseFloat(rep.averageRating || 0).toFixed(1)} (${rep.totalReviews || 0} reviews)`;
        }
        
        const trustBadge = document.getElementById('trustScoreBadge');
        const trustVal = document.getElementById('trustScoreValue');
        if (trustBadge && trustVal) {
            trustVal.textContent = rep.trustScore || 100;
            trustBadge.style.display = 'flex';
        }
    });
}

function fetchUserReviews(uid) {
    if (!uid) return;
    const db = firebase.database();
    const list = document.getElementById('reviewsList');
    const badge = document.getElementById('reviewCount');
    const ratingCountEl = document.getElementById('sellerRatingCount');

    // Real-time listener for reviews targeting this user
    db.ref('reviews').orderByChild('targetId').equalTo(uid).on('value', async (snap) => {
        const reviews = snap.val();
        
        if (!reviews) {
            if (badge) badge.textContent = '0 reviews';
            if (ratingCountEl) ratingCountEl.textContent = '0.0 (0 reviews)';
            renderStars(0);
            if (list) list.innerHTML = `
                <div class="sp-empty-state">
                    <i class="fas fa-comment-slash"></i>
                    <p>No reviews yet for this user.</p>
                </div>`;
            return;
        }

        const items = Object.values(reviews).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        // Calculate dynamic average to ensure sync with header
        const totalReviews = items.length;
        const sumRatings = items.reduce((acc, r) => acc + (parseFloat(r.rating) || 0), 0);
        const averageRating = totalReviews > 0 ? (sumRatings / totalReviews) : 0;

        // Update UI Badge
        if (badge) badge.textContent = `${totalReviews} review${totalReviews !== 1 ? 's' : ''}`;
        
        // Update Header Summary (Sync with reviews list)
        if (ratingCountEl) {
            ratingCountEl.textContent = `${averageRating.toFixed(1)} (${totalReviews} review${totalReviews !== 1 ? 's' : ''})`;
        }
        renderStars(averageRating);

        const detailedItems = await Promise.all(items.map(async (r) => {
            if (!r.reviewerId) return { ...r, reviewerName: 'Anonymous' };
            
            const [nameSnap, fullNameSnap] = await Promise.all([
                db.ref(`users/${r.reviewerId}/displayName`).once('value'),
                db.ref(`users/${r.reviewerId}/fullName`).once('value')
            ]);
            
            return { ...r, reviewerName: nameSnap.val() || fullNameSnap.val() || 'Anonymous' };
        }));

        list.innerHTML = detailedItems.map(r => `
            <div class="review-item">
                <div class="review-meta">
                    <span class="review-author">${r.reviewerName}</span>
                    <span class="review-stars">
                        ${Array(5).fill(0).map((_, i) => `<i class="${i < r.rating ? 'fas' : 'far'} fa-star"></i>`).join('')}
                    </span>
                </div>
                <div class="review-text">${r.comment || 'No comment provided.'}</div>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 10px; font-weight: 600;">
                    ${new Date(r.timestamp).toLocaleDateString()} • ${r.type?.replace(/-/g, ' ') || 'General'}
                </div>
            </div>
        `).join('');
    });
}

// ========================================
// REPORTING MODAL SYSTEM
// ========================================
let reportEvidenceFiles = [];
let currentReportTarget = null;

function initReporting(sellerId) {
    const reportBtn = document.getElementById('reportSellerBtn');
    const closeBtn = document.getElementById('closeReportModalBtn');
    const cancelBtn = document.getElementById('cancelReportBtn');
    const submitBtn = document.getElementById('submitReportBtn');
    const reasonSelect = document.getElementById('reportReason');
    const descText = document.getElementById('reportDescription');
    const evidenceInput = document.getElementById('reportEvidence');
    const dropzone = document.getElementById('evidenceUploadDropzone');

    if (reportBtn) {
        reportBtn.onclick = () => {
            const sellerName = document.getElementById('sellerName').textContent;
            openReportModal({ id: sellerId, name: sellerName });
        };
    }

    if (closeBtn) closeBtn.onclick = closeReportModal;
    if (cancelBtn) cancelBtn.onclick = closeReportModal;

    if (reasonSelect) reasonSelect.addEventListener('change', checkReportValidation);
    if (descText) descText.addEventListener('input', checkReportValidation);

    if (evidenceInput) {
        evidenceInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            handleFiles(files);
        });
    }

    if (dropzone) {
        dropzone.onclick = () => evidenceInput.click();
    }

    if (submitBtn) {
        submitBtn.onclick = submitUserReport;
    }
}

function openReportModal(target) {
    if (!firebase.auth().currentUser) {
        window.NotificationManager?.showToast('Auth Required', 'Please login to report users.', 'info');
        return;
    }

    currentReportTarget = target;
    document.getElementById('reportModalTitleLabel').textContent = target.name || 'This User';
    document.getElementById('reportModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeReportModal() {
    document.getElementById('reportModal').style.display = 'none';
    document.body.style.overflow = '';
    document.getElementById('reportForm').reset();
    reportEvidenceFiles = [];
    updateEvidencePreviews();
    checkReportValidation();
}

function checkReportValidation() {
    const reasonValue = document.getElementById('reportReason').value;
    const descValue = document.getElementById('reportDescription').value;
    const isValid = reasonValue && descValue.trim().length > 10;
    document.getElementById('submitReportBtn').disabled = !isValid;
}

function handleFiles(files) {
    if (reportEvidenceFiles.length + files.length > 3) {
        window.NotificationManager?.showToast('Limit Exceeded', 'You can only upload up to 3 evidence files.', 'error');
        return;
    }
    
    files.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        if (file.size > 5 * 1024 * 1024) return;
        reportEvidenceFiles.push(file);
    });
    
    updateEvidencePreviews();
}

function updateEvidencePreviews() {
    const container = document.getElementById('evidencePreviewContainer');
    container.innerHTML = '';
    
    reportEvidenceFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.className = 'sp-evidence-preview-item';
        div.innerHTML = `
            <img src="${url}" alt="Evidence">
            <button type="button" class="sp-evidence-preview-remove" onclick="removeEvidence(${index}, event)">&times;</button>
        `;
        container.appendChild(div);
    });
}

window.removeEvidence = (index, e) => {
    e.stopPropagation();
    reportEvidenceFiles.splice(index, 1);
    updateEvidencePreviews();
};

async function submitUserReport() {
    if (!currentReportTarget || !firebase.auth().currentUser) return;

    const reason = document.getElementById('reportReason').value;
    const desc = document.getElementById('reportDescription').value;
    const btn = document.getElementById('submitReportBtn');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    try {
        const reportRef = firebase.database().ref('reports').push();
        const reportId = reportRef.key;
        const uploadUrls = [];

        // Upload evidence
        if (reportEvidenceFiles.length > 0) {
            for (let i = 0; i < reportEvidenceFiles.length; i++) {
                const file = reportEvidenceFiles[i];
                const storageRef = firebase.storage().ref(`reports/${reportId}/evidence_${i}_${Date.now()}.jpg`);
                await storageRef.put(file);
                const dlUrl = await storageRef.getDownloadURL();
                uploadUrls.push(dlUrl);
            }
        }

        // Push report object
        await reportRef.set({
            reportedById: firebase.auth().currentUser.uid,
            targetId: currentReportTarget.id,
            targetType: 'User',
            reason: reason,
            description: desc,
            evidenceUrls: uploadUrls,
            status: "Pending",
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        window.NotificationManager?.showToast('Report Submitted', 'Our security team will investigate.', 'success');
        closeReportModal();

    } catch (err) {
        console.error('Report error:', err);
        window.NotificationManager?.showToast('Error', 'An error occurred while submitting.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Report';
    }
}
