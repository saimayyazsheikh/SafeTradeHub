document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sellerId = urlParams.get('id');

    if (!sellerId) {
        alert('No seller specified.');
        window.location.href = 'index.html';
        return;
    }

    // Initialize Firebase if not already done (handled by firebase-config.js usually, but good to ensure)
    // Initialize Firebase if not already done (handled by firebase-config.js usually, but good to ensure)
    if (!firebase.apps.length) {
        console.error("Firebase not initialized");
        document.getElementById('sellerName').textContent = 'Error: System not initialized';
        document.getElementById('sellerProductsGrid').innerHTML = '<div class="error-message">System configuration error. Please refresh the page.</div>';
        return;
    }

    const db = firebase.database();

    // UI Elements
    const sellerNameEl = document.getElementById('sellerName');
    const sellerAvatarEl = document.getElementById('sellerAvatar');
    const sellerJoinDateEl = document.getElementById('sellerJoinDate');
    const sellerEmailEl = document.getElementById('sellerEmail');
    const sellerPhoneEl = document.getElementById('sellerPhone');
    const sellerPhoneContainer = document.getElementById('sellerPhoneContainer');
    const sellerLocationEl = document.getElementById('sellerLocation');
    const sellerRatingContainer = document.getElementById('sellerRatingContainer');
    const sellerStarsEl = document.getElementById('sellerStars');
    const sellerRatingCountEl = document.getElementById('sellerRatingCount');
    const chatBtn = document.getElementById('chatWithSellerBtn');
    const productCountEl = document.getElementById('productCount');
    const grid = document.getElementById('sellerProductsGrid');

    // 1. Fetch Seller Details
    try {
        const userSnap = await db.ref('users/' + sellerId).once('value');
        if (userSnap.exists()) {
            const user = userSnap.val();
            // Use displayName as primary, fallback to fullName or username
            sellerNameEl.textContent = user.displayName || user.fullName || user.username || 'Unknown User';
            sellerEmailEl.textContent = user.email || 'No email public';

            // Check Role for Profile Type
            const isBuyer = user.role === 'Buyer' || user.accountType === 'Buyer';
            if (isBuyer) {
                document.title = 'Buyer Profile - SafeTradeHub';
                // Hide product specific elements
                document.querySelector('.seller-products-header').style.display = 'none';
                grid.style.display = 'none';

                // Optional: Update some labels
                // e.g., maybe show "Buyer" badge instead of Seller
            }

            if (user.createdAt) {
                const date = new Date(user.createdAt);
                sellerJoinDateEl.textContent = `Joined: ${date.toLocaleDateString()}`;
            } else {
                sellerJoinDateEl.style.display = 'none';
            }

            // Phone
            if (user.phone) {
                sellerPhoneEl.textContent = user.phone;
                sellerPhoneContainer.style.display = 'flex';
            }

            // Location (City/Country from address object)
            let location = 'Location not specified';
            if (user.address) {
                const city = user.address.city || '';
                const country = user.address.country || '';
                if (city || country) {
                    location = [city, country].filter(Boolean).join(', ');
                }
            } else if (user.city || user.location) {
                location = user.city || user.location;
            }
            sellerLocationEl.textContent = `Location: ${location}`;

            // Avatar
            if (user.profile?.avatar || user.profilePic) {
                sellerAvatarEl.src = user.profile?.avatar || user.profilePic;
            }

            // Chat Button
            chatBtn.onclick = () => {
                // Check if user is logged in
                const currentUser = firebase.auth().currentUser;
                if (!currentUser) {
                    alert('Please login to chat with this user.');
                    window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent(window.location.href);
                    return;
                }

                // If it's the current user, don't chat
                if (currentUser.uid === sellerId) {
                    alert("You cannot chat with yourself.");
                    return;
                }

                // If seller-chat.js is loaded, use it, otherwise basic alert or redirect
                if (window.SellerChatApp) {
                    window.SellerChatApp.openChat(sellerId, null, user.displayName || 'User');
                } else {
                    alert('Chat functionality not available on this page.');
                }
            };

        } else {
            sellerNameEl.textContent = 'User Not Found';
        }
    } catch (error) {
        console.error("Error fetching user:", error);
        sellerNameEl.textContent = 'Error loading user';
    }

    // 2. Fetch Seller's Products (Only if not explicitly identified as a pure buyer, 
    // though the query won't find anything for buyers usually, hiding the UI is cleaner)
    try {
        // We can check the DOM element we hid earlier to decide whether to fetch
        if (document.querySelector('.seller-products-header').style.display === 'none') {
            return;
        }

        const productsSnap = await db.ref('products').orderByChild('sellerId').equalTo(sellerId).once('value');
        const products = [];
        productsSnap.forEach(child => {
            products.push({ id: child.key, ...child.val() });
        });

        productCountEl.textContent = `${products.length} product${products.length !== 1 ? 's' : ''}`;

        // Calculate Seller Rating
        let totalRating = 0;
        let totalReviews = 0;
        products.forEach(p => {
            if (p.averageRating) {
                totalRating += p.averageRating * (p.totalReviews || 1); // Weighted by reviews if available
                totalReviews += (p.totalReviews || 1);
            }
        });

        if (totalReviews > 0) {
            const avgRating = totalRating / totalReviews;
            renderStars(avgRating);
            sellerRatingCountEl.textContent = `(${totalReviews} reviews)`;
            sellerRatingContainer.style.display = 'flex';
        } else {
            // Show new seller badge or similar if needed, or just hide rating
            sellerRatingContainer.style.display = 'none';
            document.getElementById('sellerStatusBadge').innerHTML = '<span class="badge-new">New Seller</span>';
        }

        if (products.length === 0) {
            grid.innerHTML = '<div class="no-products">This seller has no active listings.</div>';
            return;
        }

        // Render Products
        grid.innerHTML = products.map(p => {
            // Handle image
            let imgUrl = 'images/placeholder.jpg';
            if (Array.isArray(p.images) && p.images.length > 0) {
                imgUrl = p.images.find(img => img.isMain)?.url || p.images[0].url;
            } else if (typeof p.images === 'string') {
                imgUrl = p.images;
            } else if (p.img) {
                imgUrl = p.img;
            }

            return `
            <article class="card">
                <div class="card-img">
                    <img src="${imgUrl}" alt="${p.name}" loading="lazy" onerror="this.src='images/placeholder.jpg'">
                </div>
                <div class="card-content">
                    <h3 class="card-title">${p.name}</h3>
                    <p class="card-description">${p.description || p.desc || 'No description available.'}</p>
                    <div class="card-price">RS ${parseFloat(p.price).toFixed(2)}</div>
                    <div class="card-actions">
                        <button class="card-btn card-btn-primary" onclick="addToCart('${p.id}', '${p.name}', ${p.price}, '${imgUrl}')">
                            Add to Cart
                        </button>
                        <a href="index.html" class="card-btn card-btn-secondary">
                            View in Store
                        </a>
                    </div>
                </div>
            </article>
            `;
        }).join('');

    } catch (error) {
        console.error("Error fetching products:", error);
        grid.innerHTML = '<div class="no-products">Error loading products.</div>';
    }
});

// Helper for Add to Cart (simplified version of global one)
function addToCart(id, name, price, img) {
    // Dispatch event that header-manager or cart logic listens to
    // Or directly use localStorage if simple
    // For consistency, let's try to use the existing logic if available globally
    // But since this is a standalone page, we might need to replicate or import.
    // Assuming header-manager.js handles cart count, we just need to update localStorage.

    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existing = cart.find(item => item.id === id);

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id, name, price, img, quantity: 1 });
    }

    localStorage.setItem('cart', JSON.stringify(cart));

    // Dispatch event to update header
    window.dispatchEvent(new Event('storage'));
    alert('Product added to cart!');
}

function renderStars(rating) {
    const starsContainer = document.getElementById('sellerStars');
    starsContainer.innerHTML = '';

    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            starsContainer.innerHTML += '<i class="fas fa-star"></i>';
        } else if (i - 0.5 <= rating) {
            starsContainer.innerHTML += '<i class="fas fa-star-half-alt"></i>';
        } else {
            starsContainer.innerHTML += '<i class="far fa-star"></i>';
        }
    }
}
