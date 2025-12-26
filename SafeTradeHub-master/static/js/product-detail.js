// ========================================
// PRODUCT-DETAIL.JS - Product Details & Bidding Logic
// ========================================

let currentProduct = null;
let productId = null;
let currentUser = null;
let unsubscribeProduct = null;
let bidListener = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Get product ID from URL
    const params = new URLSearchParams(window.location.search);
    productId = params.get('id');

    if (!productId) {
        showError('Product not found');
        return;
    }

    // Wait for Auth
    if (window.AuthManager) {
        await window.AuthManager.waitForInit();
        currentUser = window.AuthManager.getCurrentUser();
    }

    // Load Product
    loadProduct(productId);
});

async function loadProduct(id) {
    try {
        const db = firebase.database();
        const productRef = db.ref(`products/${id}`);

        // Real-time listener for product updates (price changes, status)
        productRef.on('value', (snapshot) => {
            const product = snapshot.val();
            if (!product) {
                showError('Product not found');
                return;
            }
            product.id = id;
            currentProduct = product;
            renderProduct(product);
        });

    } catch (error) {
        console.error('Error loading product:', error);
        showError('Failed to load product details');
    }
}

function renderProduct(product) {
    // Hide loading
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('productContent').style.display = 'grid';

    // Basic Info
    document.title = `${product.name} – Safe Trade Hub`;
    document.getElementById('productTitle').textContent = product.name;
    document.getElementById('productDescription').textContent = product.description;

    // Breadcrumb
    document.getElementById('productBreadcrumb').textContent = product.name;

    // Meta
    document.getElementById('productCategory').textContent = product.category;
    document.getElementById('productCondition').textContent = product.condition || 'Used';
    document.getElementById('productLocation').textContent = product.location || 'Not specified';

    document.getElementById('sellerName').textContent = product.sellerName || 'Unknown Seller';
    if (product.sellerName) {
        document.getElementById('sellerAvatar').textContent = product.sellerName.charAt(0).toUpperCase();
    }

    // Images
    renderImages(product.images);

    // Specs
    renderSpecs(product.specifications);

    // Price & Actions Logic
    if (product.listingType === 'auction') {
        renderAuctionView(product);
    } else {
        renderFixedPriceView(product);
    }
}

function renderImages(images) {
    const mainImg = document.getElementById('mainImage');
    const thumbList = document.getElementById('thumbnailList');

    // Normalize images (support string URLs or object structure)
    const imageList = (images || []).map(img => {
        return (typeof img === 'string') ? { url: img } : img;
    });

    if (imageList.length > 0) {
        mainImg.src = imageList[0].url;

        thumbList.innerHTML = imageList.map((img, index) => `
            <img src="${img.url}" class="thumbnail ${index === 0 ? 'active' : ''}" 
                 onclick="changeMainImage('${img.url}', this)">
        `).join('');
    } else {
        mainImg.src = 'images/placeholder.jpg';
    }
}

function changeMainImage(url, thumb) {
    document.getElementById('mainImage').src = url;
    document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');
}

function renderSpecs(specs) {
    const tbody = document.getElementById('specsTableBody');
    if (!specs) {
        tbody.innerHTML = '<tr><td colspan="2">No specifications available</td></tr>';
        return;
    }

    tbody.innerHTML = Object.entries(specs).map(([key, value]) => `
        <tr>
            <th>${key}</th>
            <td>${value}</td>
        </tr>
    `).join('');
}

function renderFixedPriceView(product) {
    document.getElementById('priceLabel').textContent = 'Price';
    document.getElementById('productPrice').textContent = `RS ${parseFloat(product.price).toFixed(2)}`;

    document.getElementById('fixedPriceActions').style.display = 'block';
    document.getElementById('auctionActions').style.display = 'none';
    document.getElementById('auctionInfo').style.display = 'none';
    document.getElementById('biddingHistorySection').style.display = 'none';

    // Setup Add to Cart
    document.getElementById('addToCartBtn').onclick = () => addToCart(product);

    // Setup Chat
    const chatBtn = document.getElementById('chatSellerBtn');
    if (chatBtn) {
        if (currentUser && product.sellerId === currentUser.uid) {
            chatBtn.style.display = 'none';
        } else {
            chatBtn.onclick = () => {
                if (window.SellerChatApp) {
                    window.SellerChatApp.openChat(product.sellerId, product.id, product.name);
                } else {
                    console.error('SellerChatApp not loaded');
                    alert('Chat feature is currently unavailable. Please refresh the page.');
                }
            };
        }
    }
}

function renderAuctionView(product) {
    document.getElementById('priceLabel').textContent = 'Current Bid';
    const currentBid = product.currentBid || product.startingBid || 0;
    document.getElementById('productPrice').textContent = `RS ${parseFloat(currentBid).toFixed(2)}`;

    // Auction Info
    document.getElementById('auctionInfo').style.display = 'flex';
    document.getElementById('bidCount').textContent = product.bidCount || 0;

    updateTimeLeft(product.auctionEndsAt);

    // Actions
    document.getElementById('fixedPriceActions').style.display = 'none';
    document.getElementById('auctionActions').style.display = 'block';

    const minBid = (product.currentBid || product.startingBid || 0) + (product.bidIncrement || 0);
    document.getElementById('minNextBid').textContent = minBid.toFixed(2);
    document.getElementById('bidAmount').min = minBid;

    document.getElementById('placeBidBtn').onclick = () => placeBid(product);

    // Setup Chat (Auction)
    const chatBtn = document.getElementById('chatSellerBtn');
    if (chatBtn) {
        if (currentUser && product.sellerId === currentUser.uid) {
            chatBtn.style.display = 'none';
        } else {
            chatBtn.onclick = () => {
                if (window.SellerChatApp) {
                    window.SellerChatApp.openChat(product.sellerId, product.id, product.name);
                } else {
                    console.error('SellerChatApp not loaded');
                    alert('Chat feature is currently unavailable. Please refresh the page.');
                }
            };
        }
    }

    // Bidding History
    document.getElementById('biddingHistorySection').style.display = 'block';
    loadBidHistory(product.id);
}

function updateTimeLeft(endsAt) {
    const timerEl = document.getElementById('timeLeft');
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const end = new Date(endsAt).getTime();
        const distance = end - now;

        if (distance < 0) {
            clearInterval(interval);
            timerEl.textContent = 'AUCTION ENDED';
            document.getElementById('auctionActions').innerHTML = '<div class="alert alert-warning">This auction has ended.</div>';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));

        timerEl.textContent = `${days}d ${hours}h ${minutes}m`;
    }, 1000);
}

async function placeBid(product) {
    if (!currentUser) {
        alert('Please login to place a bid');
        window.location.href = `auth.html?mode=signin&redirect=${encodeURIComponent(window.location.href)}`;
        return;
    }

    // Don't allow seller to bid on own item
    if (product.sellerId === currentUser.id) {
        alert('You cannot bid on your own product');
        return;
    }

    const bidInput = document.getElementById('bidAmount');
    const amount = parseFloat(bidInput.value);

    const minBid = (product.currentBid || product.startingBid || 0) + (product.bidIncrement || 0);

    if (isNaN(amount) || amount < minBid) {
        alert(`Bid must be at least RS ${minBid.toFixed(2)}`);
        return;
    }

    try {
        const db = firebase.database();
        const bidRef = db.ref(`products/${product.id}/bids`).push();

        const bidData = {
            amount: amount,
            userId: currentUser.id,
            userName: currentUser.name,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        // Transaction to update product currentBid safely
        const productRef = db.ref(`products/${product.id}`);

        await productRef.transaction((currentData) => {
            if (currentData) {
                if (currentData.currentBid && amount <= currentData.currentBid) {
                    return; // Abort if someone outbid in the meantime
                }
                currentData.currentBid = amount;
                currentData.highestBidderId = currentUser.id;
                currentData.bidCount = (currentData.bidCount || 0) + 1;
                return currentData;
            }
            return currentData;
        }, (error, committed, snapshot) => {
            if (error) {
                console.error('Transaction failed abnormally!', error);
            } else if (!committed) {
                alert('Someone placed a higher bid just now. Please refresh and try again.');
            } else {
                // Save bid history entry
                bidRef.set(bidData);
                alert('Bid placed successfully!');
                bidInput.value = '';
            }
        });

    } catch (error) {
        console.error('Error placing bid:', error);
        alert('Failed to place bid');
    }
}

async function retractBid(bidId, bidAmount) {
    if (!confirm('Are you sure you want to retract this bid?')) return;

    const db = firebase.database();

    try {
        // 1. Remove the bid
        await db.ref(`products/${currentProduct.id}/bids/${bidId}`).remove();

        // 2. If this was the highest bid, update product state
        if (bidAmount === currentProduct.currentBid) {
            // Find new highest bid
            const snapshot = await db.ref(`products/${currentProduct.id}/bids`)
                .orderByChild('amount')
                .limitToLast(1)
                .once('value');

            let newPrice = currentProduct.startingBid || 0;
            let newBidder = null;
            let newBidCount = currentProduct.bidCount > 0 ? currentProduct.bidCount - 1 : 0;

            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    newPrice = child.val().amount;
                    newBidder = child.val().userId;
                });
            } else {
                newBidCount = 0; // No bids left
            }

            await db.ref(`products/${currentProduct.id}`).update({
                currentBid: newPrice,
                highestBidderId: newBidder,
                bidCount: newBidCount
            });
        } else {
            // Just decrement count
            await db.ref(`products/${currentProduct.id}/bidCount`).transaction(count => (count || 1) - 1);
        }

        alert('Bid retracted successfully.');

    } catch (error) {
        console.error('Error retracting bid:', error);
        alert('Failed to retract bid.');
    }
}

function loadBidHistory(productId) {
    const list = document.getElementById('bidHistoryList');
    const db = firebase.database();

    db.ref(`products/${productId}/bids`).orderByChild('amount').limitToLast(20).on('value', (snapshot) => {
        const bids = [];
        snapshot.forEach(child => {
            bids.push({ id: child.key, ...child.val() });
        });

        // Reverse to show highest first
        bids.reverse();

        if (bids.length === 0) {
            list.innerHTML = '<li class="bid-history-item" style="color: #64748b;">No bids yet. Be the first!</li>';
            return;
        }

        list.innerHTML = bids.map(bid => {
            const isMyBid = currentUser && bid.userId === currentUser.id;
            return `
            <li class="bid-history-item" style="align-items: center;">
                <div style="flex: 1;">
                    <span style="font-weight: 600;">${bid.userName} ${isMyBid ? '(You)' : ''}</span>
                    <div style="color: #94a3b8; font-size: 0.85rem;">${new Date(bid.timestamp).toLocaleString()}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700;">RS ${parseFloat(bid.amount).toFixed(2)}</div>
                    ${isMyBid ? `<button onclick="retractBid('${bid.id}', ${bid.amount})" style="color: #ef4444; background: none; border: none; font-size: 0.8rem; cursor: pointer; text-decoration: underline;">Retract</button>` : ''}
                </div>
            </li>
        `}).join('');
    });
}

function addToCart(product) {
    // Reusing existing cart logic if available globally, or implementing simple version
    // Assuming cart.js functions are available globally or we can write to localStorage directly

    if (!currentUser) {
        window.location.href = 'auth.html?mode=signin';
        return;
    }

    const cartItem = {
        id: product.id,
        title: product.name,
        price: parseFloat(product.price),
        img: (product.images && product.images.length > 0) ? (product.images[0].url || product.images[0]) : '',
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        qty: 1
    };

    const CART_KEY = 'sthub_cart';
    let cart = [];
    try {
        cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) { cart = []; }

    const existing = cart.find(x => x.id === cartItem.id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push(cartItem);
    }

    localStorage.setItem(CART_KEY, JSON.stringify(cart));

    // Update badge if method exists
    if (typeof updateCartCount === 'function') updateCartCount();

    alert(`Added ${product.name} to cart!`);
}

function showError(msg) {
    document.getElementById('loadingState').innerHTML = `<p style="color: red;">${msg}</p>`;
}

// Make available globally for inline onclicks
window.changeMainImage = changeMainImage;
window.retractBid = retractBid;
