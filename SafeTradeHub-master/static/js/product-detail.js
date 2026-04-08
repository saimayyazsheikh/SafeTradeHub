// ========================================
// PRODUCT-DETAIL.JS - Redesigned Product Details & Bidding Logic
// Premium Edition with Auction/Fixed-Price Conditional Rendering
// ========================================

let currentProduct = null;
let productId = null;
let currentUser = null;
let _pdTimerInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    productId = params.get('id');

    if (!productId) {
        showError('Product not found. Please go back and select a product.');
        return;
    }

    // Wait for Auth
    if (window.AuthManager) {
        await window.AuthManager.waitForInit();
        currentUser = window.AuthManager.getCurrentUser();
    }

    loadProduct(productId);
    startTimerEngine();
});

// ========================================
// GLOBAL TIMER ENGINE (single setInterval)
// ========================================
function startTimerEngine() {
    if (_pdTimerInterval) clearInterval(_pdTimerInterval);
    _pdTimerInterval = setInterval(() => {
        document.querySelectorAll('[data-auction-end]').forEach(el => {
            const endTime = parseInt(el.dataset.auctionEnd);
            if (!endTime) return;
            const diff = endTime - Date.now();

            if (diff <= 0) {
                el.textContent = 'ENDED';
                el.classList.add('timer-ended');
                return;
            }

            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            if (hours > 24) {
                const days = Math.floor(hours / 24);
                el.textContent = `${days}d ${hours % 24}h ${minutes}m`;
            } else {
                el.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }

            if (diff < 3600000) {
                el.style.color = '#ef4444';
            }
        });
    }, 1000);
}

// ========================================
// LOAD PRODUCT (real-time listener)
// ========================================
async function loadProduct(id) {
    try {
        const db = firebase.database();
        const productRef = db.ref(`products/${id}`);

        productRef.on('value', (snapshot) => {
            const product = snapshot.val();
            if (!product) {
                showError('Product not found');
                return;
            }
            product.id = id;
            currentProduct = product;
            renderProduct(product);

            // Increment View Count (Analytics) - Only Once per session/load
            if (!window._viewTracked) {
                const viewRef = db.ref(`products/${id}/views`);
                viewRef.transaction((currentViews) => {
                    return (currentViews || 0) + 1;
                });
                window._viewTracked = true;
            }

            // Robust Seller ID Detection
            const sId = product.sellerId || product.seller_id;
            if (sId) {
                loadSellerInfo(sId);
                listenToSellerReputation(sId);
            }
            fetchProductReviews(id);
        });

    } catch (error) {
        console.error('Error loading product:', error);
        showError('Failed to load product details');
    }
}

// ========================================
// RENDER PRODUCT
// ========================================
function renderProduct(product) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('productContent').style.display = 'block';

    document.title = `${product.name} – Safe Trade Hub`;
    document.getElementById('productTitle').textContent = product.name;
    document.getElementById('productBreadcrumb').textContent = product.name;

    // Update gradient header title
    const headerTitle = document.getElementById('headerProductTitle');
    if (headerTitle) headerTitle.textContent = product.name;
    document.getElementById('productDescription').textContent = product.description || 'No description provided.';

    // Tags
    const tagsHtml = [];
    if (product.category) tagsHtml.push(`<span class="pd-tag blue">${product.category}</span>`);
    if (product.condition) tagsHtml.push(`<span class="pd-tag">${product.condition}</span>`);
    if (product.brand && product.brand !== 'Generic') tagsHtml.push(`<span class="pd-tag">${product.brand}</span>`);
    if (product.location) tagsHtml.push(`<span class="pd-tag green"><i class="fas fa-map-marker-alt" style="margin-right:4px;font-size:0.65rem;"></i>${product.location}</span>`);
    document.getElementById('productTags').innerHTML = tagsHtml.join('');

    // Category breadcrumb
    const catLink = document.getElementById('categoryBreadcrumb');
    if (product.category) {
        catLink.textContent = product.category.charAt(0).toUpperCase() + product.category.slice(1);
        catLink.href = `category-${product.category}.html`;
    }

    // Quick specs
    document.getElementById('shippingInfo').textContent = product.shippingCost > 0 ? `RS ${parseFloat(product.shippingCost).toLocaleString('en-PK')}` : 'Free';
    document.getElementById('conditionInfo').textContent = (product.condition || 'Not specified').charAt(0).toUpperCase() + (product.condition || '').slice(1);
    document.getElementById('stockInfo').textContent = product.stock ? `${product.stock} available` : 'In Stock';

    // Images
    renderImages(product.images);

    // Specs
    renderSpecs(product.specifications);

    // Auction Detection
    const auction = product.auction || {};
    const isAuction = auction.enabled === true;

    if (isAuction) {
        renderAuctionView(product, auction);
    } else {
        renderFixedPriceView(product);
    }

    // Report button
    const reportBtn = document.getElementById('reportProductBtn');
    if (reportBtn) {
        reportBtn.onclick = () => submitListingReport(product);
    }
}

// ========================================
// IMAGES
// ========================================
function renderImages(images) {
    const mainImg = document.getElementById('mainImage');
    const thumbList = document.getElementById('thumbnailList');

    const imageList = (images || []).map(img => (typeof img === 'string') ? { url: img } : img);

    if (imageList.length > 0) {
        mainImg.src = imageList[0].url;
        thumbList.innerHTML = imageList.map((img, index) => `
            <div class="pd-thumb ${index === 0 ? 'active' : ''}" onclick="changeMainImage('${img.url}', this)">
                <img src="${img.url}" alt="Thumb ${index + 1}">
            </div>
        `).join('');
    } else {
        mainImg.src = 'images/placeholder.jpg';
        thumbList.innerHTML = '';
    }
}

function changeMainImage(url, thumb) {
    document.getElementById('mainImage').src = url;
    document.querySelectorAll('.pd-thumb').forEach(t => t.classList.remove('active'));
    if (thumb) thumb.classList.add('active');
}

// ========================================
// SPECIFICATIONS
// ========================================
function renderSpecs(specs) {
    const container = document.getElementById('specsContainer');
    if (!specs || Object.keys(specs).length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">No specifications listed.</p>';
        return;
    }

    container.innerHTML = Object.entries(specs).map(([key, value]) => `
        <div class="pd-spec-row" style="grid-column: 1/-1;">
            <span class="pd-spec-key">${key}</span>
            <span class="pd-spec-val">${value}</span>
        </div>
    `).join('');
}

// ========================================
// FIXED PRICE VIEW
// ========================================
function renderFixedPriceView(product) {
    document.getElementById('priceLabel').textContent = 'Price';
    const priceEl = document.getElementById('productPrice');
    priceEl.textContent = `RS ${parseFloat(product.price).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`;
    priceEl.classList.remove('indigo');

    // Hide auction elements
    document.getElementById('auctionMeta').style.display = 'none';
    document.getElementById('bidWidget').style.display = 'none';
    document.getElementById('auctionEndedBanner').style.display = 'none';
    document.getElementById('biddingHistorySection').style.display = 'none';
    document.getElementById('liveBadge').style.display = 'none';

    // Show fixed price actions
    const addToCartBtn = document.getElementById('addToCartBtn');
    addToCartBtn.style.display = 'flex';
    addToCartBtn.onclick = () => addToCart(product);

    // Chat setup
    setupChatButton(product);
}

// ========================================
// AUCTION VIEW
// ========================================
function renderAuctionView(product, auction) {
    const currentBid = auction.currentHighestBid || auction.startingPrice || product.price || 0;
    const minIncrement = auction.minIncrement || 100;
    const bidCount = auction.bidCount || 0;
    const minNextBid = parseFloat(currentBid) + parseFloat(minIncrement);

    // Calculate end time
    const auctionStartStr = auction.updatedAt || product.updatedAt || product.createdAt;
    const auctionStart = auctionStartStr ? new Date(auctionStartStr).getTime() : Date.now();
    const durationMs = (auction.duration || 7) * 24 * 60 * 60 * 1000;
    const auctionEndTime = auctionStart + durationMs;
    const isEnded = Date.now() >= auctionEndTime;

    // Price block
    document.getElementById('priceLabel').textContent = 'Current Bid';
    const priceEl = document.getElementById('productPrice');
    priceEl.textContent = `RS ${parseFloat(currentBid).toLocaleString('en-PK')}`;
    priceEl.classList.add('indigo');

    // LIVE badge
    const liveBadge = document.getElementById('liveBadge');
    liveBadge.style.display = 'flex';
    if (isEnded) {
        liveBadge.className = 'pd-live ended';
        liveBadge.innerHTML = '<i class="fas fa-flag-checkered"></i> ENDED';
    } else {
        liveBadge.className = 'pd-live';
        liveBadge.innerHTML = '<i class="fas fa-bolt"></i> LIVE';
    }

    // Auction meta boxes
    document.getElementById('auctionMeta').style.display = 'grid';
    document.getElementById('metaCurrentBid').textContent = `RS ${parseFloat(currentBid).toLocaleString('en-PK')}`;
    document.getElementById('metaBidCount').textContent = bidCount;
    const timeLeftEl = document.getElementById('metaTimeLeft');
    timeLeftEl.dataset.auctionEnd = auctionEndTime;
    timeLeftEl.textContent = isEnded ? 'ENDED' : '...';

    // Hide fixed price button
    document.getElementById('addToCartBtn').style.display = 'none';

    if (isEnded) {
        document.getElementById('bidWidget').style.display = 'none';
        document.getElementById('auctionEndedBanner').style.display = 'block';
    } else {
        const isSeller = currentUser && (currentUser.role || '').toLowerCase() === 'seller';
        if (isSeller) {
            document.getElementById('bidWidget').innerHTML = `
                <div style="background: #fff1f2; border: 1px solid #fecaca; color: #991b1b; padding: 16px; border-radius: 12px; font-weight: 600; text-align: center; margin-top: 10px;">
                    <i class="fas fa-info-circle"></i> Bidding is only available for Buyers.
                </div>`;
            document.getElementById('bidWidget').style.display = 'block';
        } else {
            document.getElementById('bidWidget').style.display = 'block';
            document.getElementById('auctionEndedBanner').style.display = 'none';
            document.getElementById('bidMinVal').textContent = parseFloat(minNextBid).toLocaleString('en-PK');
            // Bid input setup
            setupBidInput(product.id, minNextBid, minIncrement);
        }
    }

    // Bid history
    document.getElementById('biddingHistorySection').style.display = 'block';
    loadBidHistory(product.id);

    // Live sync for auction data
    setupLiveBidSync(product.id, minIncrement);

    // Chat
    setupChatButton(product);
}

// ========================================
// LIVE BID SYNC
// ========================================
function setupLiveBidSync(pid, minIncrement) {
    if (window._pdBidSyncListener) {
        window._pdBidSyncListener();
        window._pdBidSyncListener = null;
    }

    const ref = firebase.database().ref(`products/${pid}/auction`);
    const listener = ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        const currentBid = data.currentHighestBid || data.startingPrice || 0;
        const bidCount = data.bidCount || 0;
        const minNext = parseFloat(currentBid) + parseFloat(minIncrement);

        const priceEl = document.getElementById('productPrice');
        const metaBidEl = document.getElementById('metaCurrentBid');
        const metaCountEl = document.getElementById('metaBidCount');
        const minValEl = document.getElementById('bidMinVal');
        const bidInput = document.getElementById('bidAmountInput');

        if (priceEl) priceEl.textContent = `RS ${parseFloat(currentBid).toLocaleString('en-PK')}`;
        if (metaBidEl) metaBidEl.textContent = `RS ${parseFloat(currentBid).toLocaleString('en-PK')}`;
        if (metaCountEl) metaCountEl.textContent = bidCount;
        if (minValEl) minValEl.textContent = parseFloat(minNext).toLocaleString('en-PK');
        if (bidInput && parseFloat(bidInput.value) < minNext) {
            bidInput.value = minNext;
            bidInput.min = minNext;
        }
    });

    window._pdBidSyncListener = () => ref.off('value', listener);
}

// ========================================
// BID INPUT & SUBMISSION
// ========================================
function setupBidInput(pid, initialMinBid, minIncrement) {
    const input = document.getElementById('bidAmountInput');
    const btn = document.getElementById('placeBidBtn');
    const feedback = document.getElementById('bidFeedback');
    if (!input || !btn) return;

    input.min = initialMinBid;
    input.value = initialMinBid;
    input.step = minIncrement;

    input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        const currentMin = parseFloat(input.min);
        if (val >= currentMin) {
            btn.disabled = false;
            feedback.innerHTML = `<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Valid bid</span>`;
        } else {
            btn.disabled = true;
            feedback.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> Bid must be at least RS ${currentMin.toLocaleString('en-PK')}</span>`;
        }
    });

    input.dispatchEvent(new Event('input'));

    btn.onclick = async () => {
        const bidAmount = parseFloat(input.value);
        const currentMin = parseFloat(input.min);

        if (bidAmount < currentMin) {
            feedback.innerHTML = `<span style="color:#ef4444;">Bid too low!</span>`;
            return;
        }

        if (!currentUser) {
            window.location.href = `auth.html?mode=signin&redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        // ROLE GUARD
        if (window.AuthManager && !window.AuthManager.checkPermission('bid')) {
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing...';

        try {
            const token = await firebase.auth().currentUser.getIdToken();
            const response = await fetch('/api/v1/bids/place', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    productId: pid,
                    bidAmount: bidAmount,
                    maxBid: bidAmount
                })
            });

            const result = await response.json();

            if (result.success) {
                const color = result.outbid ? '#f59e0b' : '#10b981';
                const icon = result.outbid ? 'exclamation-triangle' : 'check-circle';
                feedback.innerHTML = `<span style="color:${color};"><i class="fas fa-${icon}"></i> ${result.message}</span>`;
                if (window.NotificationManager) {
                    window.NotificationManager.showToast(result.outbid ? 'Outbid!' : 'Success', result.message, result.outbid ? 'warning' : 'success');
                }
                loadBidHistory(pid);
            } else {
                feedback.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> ${result.error}</span>`;
            }
        } catch (error) {
            console.error('Bid Error:', error);
            feedback.innerHTML = `<span style="color:#ef4444;">Network error. Please try again.</span>`;
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-gavel"></i> Bid';
    };
}

// ========================================
// BID HISTORY
// ========================================
async function loadBidHistory(pid) {
    const container = document.getElementById('bidHistoryList');
    if (!container) return;

    try {
        const snap = await firebase.database().ref(`bids/${pid}`).orderByChild('timestamp').limitToLast(10).once('value');
        const data = snap.val();

        if (!data) {
            container.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem; text-align:center; padding:20px;">No bids yet. Be the first!</p>';
            return;
        }

        const bids = Object.entries(data).map(([key, val]) => ({ bidId: key, ...val })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        container.innerHTML = bids.map((bid, i) => {
            const maskedId = (bid.bidderId || 'unknown').slice(0, 4) + '****';
            const isMyBid = currentUser && bid.bidderId === (currentUser.uid || currentUser.id);
            const isTop = i === 0;
            const timeStr = bid.timestamp ? new Date(bid.timestamp).toLocaleString() : '';
            return `<div class="pd-bid-row-item ${isTop ? 'top' : ''}">
                <div>
                    <span style="font-weight:700;">${isTop ? '👑 ' : ''}${isMyBid ? 'You' : `Bidder ${maskedId}`}</span>
                    <div style="font-size:0.78rem; color:#94a3b8;">${timeStr}</div>
                </div>
                <span style="font-weight:700;">RS ${parseFloat(bid.amount).toLocaleString('en-PK')}</span>
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = '<p style="color:#94a3b8; font-size:0.9rem;">Could not load bid history.</p>';
    }
}

// ========================================
// SELLER INFO
// ========================================
async function loadSellerInfo(sellerId) {
    try {
        const db = firebase.database();
        // Fetch public fields individually since the parent node may be restricted for Buyers
        const [nameSnap, fullNameSnap, userSnap, picSnap, profSnap, dateSnap] = await Promise.all([
            db.ref(`users/${sellerId}/displayName`).once('value'),
            db.ref(`users/${sellerId}/fullName`).once('value'),
            db.ref(`users/${sellerId}/username`).once('value'),
            db.ref(`users/${sellerId}/profilePic`).once('value'),
            db.ref(`users/${sellerId}/profile/avatar`).once('value'),
            db.ref(`users/${sellerId}/createdAt`).once('value')
        ]);

        const name = nameSnap.val() || fullNameSnap.val() || userSnap.val() || 'Unknown Seller';
        const pic = picSnap.val() || profSnap.val() || null;
        const createdAt = dateSnap.val();
        
        // Format Join Date
        const joinDate = createdAt 
            ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) 
            : '';

        document.getElementById('sellerName').textContent = name;
        document.getElementById('sellerJoinDate').textContent = joinDate ? `Joined ${joinDate}` : '';

        const avatarEl = document.getElementById('sellerAvatar');
        if (pic) {
            avatarEl.innerHTML = `<img src="${pic}" alt="${name}" onerror="this.parentElement.textContent='${name.charAt(0).toUpperCase()}'">`;
        } else {
            avatarEl.textContent = name.charAt(0).toUpperCase();
        }

        // Make seller card clickable
        document.getElementById('sellerCard').onclick = () => {
            window.location.href = `seller-profile.html?id=${sellerId}`;
        };
    } catch (e) {
        console.error('Error loading seller:', e);
    }
}

function listenToSellerReputation(sellerId) {
    firebase.database().ref(`users/${sellerId}/reputation`).on('value', (snap) => {
        const rep = snap.val();
        const repDiv = document.getElementById('sellerReputation');
        const avgSpan = document.getElementById('sellerAvgRating');
        const totalSpan = document.getElementById('sellerTotalReviews');

        if (rep && rep.totalReviews > 0) {
            avgSpan.textContent = parseFloat(rep.averageRating).toFixed(1);
            totalSpan.textContent = rep.totalReviews;
            repDiv.style.display = 'block';
        } else {
            repDiv.style.display = 'none';
        }
    });
}

// ========================================
// CHAT SETUP
// ========================================
function setupChatButton(product) {
    const chatBtn = document.getElementById('chatSellerBtn');
    if (!chatBtn) return;

    // Robust Seller ID Detection
    const sId = product.sellerId || product.seller_id;

    if (currentUser && sId === (currentUser.uid || currentUser.id)) {
        chatBtn.style.display = 'none';
        return;
    }

    chatBtn.onclick = () => {
        if (!currentUser) {
            window.location.href = `auth.html?mode=signin&redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        if (!sId) {
            if (window.NotificationManager) {
                window.NotificationManager.showToast('Error', 'Seller information is missing for this product.', 'error');
            } else {
                alert('Seller information is missing for this product.');
            }
            return;
        }

        if (window.SellerChatApp) {
            window.SellerChatApp.openChat(sId, product.id, product.name);
        } else {
            if (window.NotificationManager) {
                window.NotificationManager.showToast('Notice', 'Chat feature is currently unavailable. Please refresh the page.', 'info');
            } else {
                alert('Chat feature is currently unavailable. Please refresh the page.');
            }
        }
    };
}

// ========================================
// ADD TO CART
// ========================================
function addToCart(product) {
    if (!currentUser) {
        window.location.href = `auth.html?mode=signin&redirect=${encodeURIComponent(window.location.href)}`;
        return;
    }

    // Role Restriction Check
    if (window.AuthManager && !window.AuthManager.checkPermission('add_to_cart')) {
        return;
    }

    const sId = product.sellerId || product.seller_id;
    const cartItem = {
        id: product.id,
        title: product.name,
        price: parseFloat(product.price),
        img: (product.images && product.images.length > 0) ? (product.images[0].url || product.images[0]) : '',
        sellerId: sId,
        sellerName: product.sellerName,
        qty: 1
    };

    const CART_KEY = 'sthub_cart';
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }

    const existing = cart.find(x => x.id === cartItem.id);
    if (existing) existing.qty += 1;
    else cart.push(cartItem);

    localStorage.setItem(CART_KEY, JSON.stringify(cart));

    if (typeof updateCartCount === 'function') updateCartCount();

    if (window.NotificationManager) {
        window.NotificationManager.showToast('Cart Updated', `Added ${product.name} to cart!`, 'success');
    } else {
        alert(`Added ${product.name} to cart!`);
    }
}

// ========================================
// REVIEWS
// ========================================
function fetchProductReviews(id) {
    const reviewsList = document.getElementById('reviewsList');
    const badge = document.getElementById('reviewCountBadge');

    firebase.database().ref('reviews').orderByChild('productId').equalTo(id).on('value', async (snap) => {
        const reviews = snap.val();
        if (!reviews) {
            badge.textContent = '0';
            reviewsList.innerHTML = `
                <div style="text-align:center; padding:30px; color:#94a3b8;">
                    <i class="fas fa-comment-slash" style="font-size:1.5rem; margin-bottom:8px; display:block;"></i>
                    No reviews yet for this product.
                </div>`;
            return;
        }

        const reviewItems = Object.values(reviews).sort((a, b) => b.timestamp - a.timestamp);
        badge.textContent = reviewItems.length;

        const detailedReviews = await Promise.all(reviewItems.map(async (r) => {
            const userSnap = await firebase.database().ref(`users/${r.reviewerId}/displayName`).once('value');
            return { ...r, reviewerName: userSnap.val() || 'Anonymous' };
        }));

        reviewsList.innerHTML = detailedReviews.map(r => `
            <div class="pd-review">
                <div class="pd-review-head">
                    <span class="pd-review-user">${r.reviewerName}</span>
                    <span class="pd-review-stars">
                        ${Array(5).fill(0).map((_, i) => `<i class="${i < r.rating ? 'fas' : 'far'} fa-star"></i>`).join('')}
                    </span>
                </div>
                <div class="pd-review-text">${r.comment || 'No comment provided.'}</div>
                <div class="pd-review-date">${new Date(r.timestamp).toLocaleDateString()}</div>
            </div>
        `).join('');
    });
}

// ========================================
// REPORTING MODAL SYSTEM
// ========================================
let reportEvidenceFiles = [];
let currentReportTarget = null;

function openReportModal(product) {
    if (!currentUser) {
        if (window.NotificationManager) {
            window.NotificationManager.showToast('Auth Required', 'Please login to report listings.', 'info');
        } else {
            alert('Please login to report listings.');
        }
        return;
    }

    // Restriction Layer: Sellers are prohibited from reporting marketplace listings
    if (window.AuthManager && !window.AuthManager.checkPermission('report_listing')) {
        const role = (window.AuthManager.user?.role || '').toLowerCase();
        if (role === 'seller') {
            if (window.NotificationManager) {
                window.NotificationManager.showToast('Restricted', 'Seller accounts cannot report marketplace listings.', 'warning');
            }
            return;
        }
    }

    // Restriction Layer: Seller Self-Report Check
    if (window.AuthManager && !window.AuthManager.checkPermission('report', { targetId: product.sellerId })) {
        if (window.NotificationManager) {
            window.NotificationManager.showToast('Restricted', 'Sellers cannot report their own items.', 'warning');
        }
        return;
    }

    currentReportTarget = product;
    document.getElementById('reportModalTitleLabel').textContent = product.name || 'This Listing';
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

document.getElementById('reportReason').addEventListener('change', checkReportValidation);
document.getElementById('reportDescription').addEventListener('input', checkReportValidation);

function checkReportValidation() {
    const reasonValue = document.getElementById('reportReason').value;
    const descValue = document.getElementById('reportDescription').value;
    
    // Enable submit only if reason is selected and desc is > 10 chars
    const isValid = reasonValue && descValue.trim().length > 10;
    document.getElementById('submitReportBtn').disabled = !isValid;
}

// File Input Handling
document.getElementById('reportEvidence').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (reportEvidenceFiles.length + files.length > 3) {
        if (window.NotificationManager) {
            window.NotificationManager.showToast('Limit Exceeded', 'You can only upload up to 3 evidence files.', 'error');
        } else {
            alert('You can only upload up to 3 evidence files.');
        }
        return;
    }
    
    files.forEach(file => {
        if (!file.type.startsWith('image/')) {
            if (window.NotificationManager) {
                window.NotificationManager.showToast('Invalid File', 'Only image files are allowed.', 'error');
            } else {
                alert('Only image files are allowed.');
            }
            return;
        }
        // Limit to 5MB
        if (file.size > 5 * 1024 * 1024) {
            if (window.NotificationManager) {
                window.NotificationManager.showToast('File Too Large', 'File must be smaller than 5MB.', 'error');
            } else {
                alert('File must be smaller than 5MB.');
            }
            return;
        }
        reportEvidenceFiles.push(file);
    });
    
    updateEvidencePreviews();
});

function updateEvidencePreviews() {
    const container = document.getElementById('evidencePreviewContainer');
    container.innerHTML = '';
    
    reportEvidenceFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const div = document.createElement('div');
        div.className = 'pd-evidence-preview-item';
        div.innerHTML = `
            <img src="${url}" alt="Evidence">
            <button type="button" class="pd-evidence-preview-remove" onclick="removeEvidence(${index}, event)"><i class="fas fa-times"></i></button>
        `;
        container.appendChild(div);
    });
}

function removeEvidence(index, e) {
    e.stopPropagation();
    reportEvidenceFiles.splice(index, 1);
    updateEvidencePreviews();
}

async function submitListingReport(product) {
    // If modal is not open, open it
    if (document.getElementById('reportModal').style.display === 'none' || product) {
        openReportModal(product || currentReportTarget);
        return;
    }

    if (!currentReportTarget) return;

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
            reportedById: currentUser.uid,
            targetId: currentReportTarget.id,
            targetType: 'Product',
            reason: reason,
            description: desc,
            evidenceUrls: uploadUrls,
            status: "Pending",
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        if (window.NotificationManager) {
            window.NotificationManager.showToast('Report Submitted', 'Our security team will investigate.', 'success');
        } else {
            alert('Report submitted successfully!');
        }
        closeReportModal();

    } catch (err) {
        console.error('Report error:', err);
        if (window.NotificationManager) {
            window.NotificationManager.showToast('Error', 'An error occurred while submitting the report.', 'error');
        } else {
            alert('An error occurred while submitting the report.');
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Report';
    }
}
// Listen to the submit button
document.getElementById('submitReportBtn').onclick = () => submitListingReport();

// ========================================
// UTILITIES
// ========================================
function showError(msg) {
    document.getElementById('loadingState').innerHTML = `
        <div style="text-align:center; padding:60px;">
            <i class="fas fa-exclamation-circle" style="font-size:3rem; color:#ef4444; margin-bottom:16px;"></i>
            <h3 style="color:#1e293b;">${msg}</h3>
            <a href="index.html" style="color:#2563eb; font-weight:600;">← Go Back Home</a>
        </div>`;
}

// Make available globally
window.changeMainImage = changeMainImage;
