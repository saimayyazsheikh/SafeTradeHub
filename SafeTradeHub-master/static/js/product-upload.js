/**
 * PRODUCT-UPLOAD.JS - Axiom Protocol Enhanced
 * Handles product listing, media verification, and section-based navigation.
 */

let currentUser = null;
let uploadedImages = []; // Array of { file, url, isMain, verification }
let specifications = [];
let formBuilder = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initUploadFlow();
});

async function initUploadFlow() {
    try {
        // 1. Auth Guard
        if (window.AuthManager) {
            await window.AuthManager.waitForInit();
            currentUser = window.AuthManager.getCurrentUser();
            if (!currentUser) {
                window.location.href = 'auth.html?mode=signin&redirect=product-upload.html';
                return;
            }
        }

        // 2. Setup UI
        setupNavigation();
        setupEventListeners();
        addSpecificationRow(); // Start with one empty spec row

        // Initialize Dynamic Form Builder
        formBuilder = new window.FormBuilder('dynamicAttributesContainer', 'variantInventoryContainer');
        await formBuilder.init();
        
        // Load initial category schema
        const initialCategory = document.getElementById('productCategory').value;
        if (initialCategory) {
            await formBuilder.loadCategorySchema(initialCategory);
        }

        showLoading(false);
    } catch (error) {
        console.error('Init Error:', error);
        window.NotificationManager.showToast('System Error', error.message, 'error');
        showLoading(false);
    }
}

/* --- UI INTERACTION & NAVIGATION --- */

function setupNavigation() {
    const railItems = document.querySelectorAll('.nav-item');
    railItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');
            
            // Update nav state
            railItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Update section visibility
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`section-${sectionId}`).classList.add('active');
            
            // Scroll to top of content area on mobile
            if (window.innerWidth < 900) {
                document.getElementById(`section-${sectionId}`).scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function setupEventListeners() {
    // Description Counter
    document.getElementById('productDescription').addEventListener('input', (e) => {
        const counter = document.getElementById('descriptionCount');
        const count = e.target.value.length;
        counter.textContent = count;
        counter.style.color = count > 1800 ? '#ef4444' : '#64748b';
    });
    
    // Tag Preview
    document.getElementById('productTags').addEventListener('input', (e) => {
        const preview = document.getElementById('tagPreview');
        const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t !== '');
        preview.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
    });
    
    // Spec Button
    document.getElementById('addSpecification').addEventListener('click', () => addSpecificationRow());
    
    // Media Upload Handlers
    document.getElementById('mainImage').addEventListener('change', (e) => handleFileSelection(e, true));
    document.getElementById('additionalImages').addEventListener('change', (e) => handleFileSelection(e, false));
    
    // Form Submission
    document.getElementById('productUploadForm').addEventListener('submit', handleFormSubmit);
    
    // Save Draft Logic
    document.getElementById('saveDraft').addEventListener('click', (e) => {
        handleFormSubmit(e, 'draft');
    });

    // Auction Toggle Logic
    const auctionToggle = document.getElementById('auctionEnabled');
    const auctionFields = document.getElementById('auctionFields');
    const fixedPriceGroup = document.getElementById('fixedPriceGroup');

    if (auctionToggle) {
        auctionToggle.addEventListener('change', (e) => {
            const inventoryGroup = document.getElementById('inventoryGroup');
            const productStock = document.getElementById('productStock');
            
            if (e.target.checked) {
                auctionFields.style.display = 'grid';
                if (fixedPriceGroup) fixedPriceGroup.classList.add('hidden-price');
                if (inventoryGroup) {
                    inventoryGroup.classList.add('hidden-price');
                    if (productStock) productStock.removeAttribute('required');
                }
                if (productStock) productStock.value = 1; // Auctions are single-item by default
            } else {
                auctionFields.style.display = 'none';
                if (fixedPriceGroup) fixedPriceGroup.classList.remove('hidden-price');
                if (inventoryGroup) {
                    inventoryGroup.classList.remove('hidden-price');
                    if (productStock) productStock.setAttribute('required', 'required');
                }
            }
        });
    }

    // Price Comparison Search
    const nameInput = document.getElementById('productName');
    if (nameInput) {
        nameInput.addEventListener('input', debounce((e) => {
            fetchPriceComparison(e.target.value);
        }, 1000));
    }

    // Category Change Listener for Dynamic Fields
    const categorySelect = document.getElementById('productCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', async (e) => {
            await formBuilder.loadCategorySchema(e.target.value);
        });
    }

    // Fee Engine Listeners
    const feeInputs = ['shipWeight', 'shipLength', 'shipWidth', 'shipHeight', 'shipFragility', 'productPrice', 'auctionStartingPrice'];
    feeInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', triggerFeeCalculation);
            el.addEventListener('change', triggerFeeCalculation);
        }
    });

    // Custom Event Listener for UI Updates
    document.addEventListener('fees:updated', (e) => {
        const data = e.detail;
        
        // Shipping UI
        const sTier = document.getElementById('calcShippingTier');
        const sFee = document.getElementById('calcShippingFee');
        if (sTier && sFee) {
            if (data.shipping.success) {
                sTier.textContent = `Tier: ${data.shipping.data.tier}`;
                sFee.textContent = `RS ${data.shipping.data.fee.toLocaleString()}`;
                window._currentShippingFee = data.shipping.data.fee;
                window._currentShippingTier = data.shipping.data.tier;
            } else {
                sTier.textContent = 'Pending...';
                sFee.textContent = 'RS 0';
                window._currentShippingFee = 0;
                window._currentShippingTier = 'Unknown';
            }
        }

        // Escrow UI
        const eTier = document.getElementById('calcEscrowTier');
        const eFee = document.getElementById('calcEscrowFee');
        if (eTier && eFee) {
            if (data.escrow.success) {
                eTier.textContent = `Tier ${data.escrow.data.tier} (${data.escrow.data.percentage}%)`;
                eFee.textContent = `RS ${data.escrow.data.fee.toLocaleString()}`;
                window._currentEscrowFee = data.escrow.data.fee;
                window._currentEscrowTier = data.escrow.data.tier;
            } else {
                eTier.textContent = 'Pending...';
                eFee.textContent = 'RS 0';
                window._currentEscrowFee = 0;
                window._currentEscrowTier = 0;
            }
        }
    });
}

function triggerFeeCalculation() {
    if (!window.FeeEngine) return;

    // Shipping
    const w = document.getElementById('shipWeight')?.value || 0;
    const l = document.getElementById('shipLength')?.value || 0;
    const wi = document.getElementById('shipWidth')?.value || 0;
    const h = document.getElementById('shipHeight')?.value || 0;
    const f = document.getElementById('shipFragility')?.value || 'Standard';

    const shippingResult = window.FeeEngine.calculateShipping(w, l, wi, h, f);

    // Escrow
    const isAuction = document.getElementById('auctionEnabled')?.checked;
    const priceStr = isAuction ? document.getElementById('auctionStartingPrice')?.value : document.getElementById('productPrice')?.value;
    const price = parseFloat(priceStr) || 0;
    
    const escrowResult = window.FeeEngine.calculateEscrow(price);

    // Dispatch Event
    document.dispatchEvent(new CustomEvent('fees:updated', {
        detail: {
            shipping: shippingResult,
            escrow: escrowResult
        }
    }));
}

function addSpecificationRow(key = '', val = '') {
    const container = document.getElementById('specificationsContainer');
    const div = document.createElement('div');
    div.className = 'spec-row-item';
    div.innerHTML = `
        <input type="text" placeholder="Key (e.g. RAM)" class="axiom-input spec-key" value="${key}">
        <input type="text" placeholder="Value (e.g. 16GB)" class="axiom-input spec-val" value="${val}">
        <button type="button" class="btn-axiom btn-axiom-ghost" style="padding: 0; display: flex; justify-content: center; align-items: center; color: #ef4444;" onclick="this.parentElement.remove()">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(div);
}

/* --- MEDIA MANAGEMENT & AI VERIFICATION --- */

async function handleFileSelection(e, isMain) {
    const files = Array.from(e.target.files);
    
    for (const file of files) {
        if (isMain) {
            // Remove previous main image from the internal list
            uploadedImages = uploadedImages.filter(img => !img.isMain);
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const newImageObj = {
                file: file,
                url: event.target.result,
                isMain: isMain,
                verification: { status: 'verifying' }
            };
            
            uploadedImages.push(newImageObj);
            renderImagesPreview();
            
            // Trigger AI Verification
            try {
                const result = await verifyImageWithAI(file);
                newImageObj.verification = result || { isSafe: true };
                renderImagesPreview();
            } catch (err) {
                console.error('Verification failed:', err);
                newImageObj.verification = { isSafe: true };
                renderImagesPreview();
            }
        };
        reader.readAsDataURL(file);
    }
}

function renderImagesPreview() {
    const mainContainer = document.getElementById('mainImagePreview');
    const additionalContainer = document.getElementById('additionalImagesPreview');
    
    const mainImg = uploadedImages.find(img => img.isMain);
    const additionalImgs = uploadedImages.filter(img => !img.isMain);

    // Render Main
    if (mainImg) {
        mainContainer.innerHTML = renderImageThumb(mainImg, uploadedImages.indexOf(mainImg));
    } else {
        mainContainer.innerHTML = '';
    }

    // Render Additional
    additionalContainer.innerHTML = additionalImgs.map(img => 
        renderImageThumb(img, uploadedImages.indexOf(img))
    ).join('');
}

function renderImageThumb(imgObj, idx) {
    const v = imgObj.verification;
    let badgeHtml = '';
    
    if (v.status === 'verifying') {
        badgeHtml = `<div class="verification-badge verifying"><i class="fas fa-spinner fa-spin"></i> Checking...</div>`;
    } else if (v.isSafe === true) {
        badgeHtml = `<div class="verification-badge safe"><i class="fas fa-check-circle"></i> Safe</div>`;
    } else if (v.isSafe === false) {
        const rawReason = (v.reasons && v.reasons[0]) || v.label || 'Unsafe content';
        const prettyReason = rawReason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        badgeHtml = `<div class="verification-badge unsafe" title="${rawReason}"><i class="fas fa-exclamation-triangle"></i> Detect: ${prettyReason}</div>`;
    }

    return `
        <div class="image-thumb ${v.isSafe === false ? 'unsafe-item' : ''}">
            <img src="${imgObj.url}" alt="Upload preview">
            <button type="button" class="remove-img-btn" onclick="removeUploadedImage(${idx})">
                <i class="fas fa-times"></i>
            </button>
            ${badgeHtml}
            ${imgObj.isMain ? '<div class="image-status-marker" style="background: var(--axiom-primary);">PRIMARY</div>' : ''}
        </div>
    `;
}

window.removeUploadedImage = (idx) => {
    uploadedImages.splice(idx, 1);
    renderImagesPreview();
};

/* --- FORM SUBMISSION --- */

async function handleFormSubmit(e, targetStatus = 'pending_verification') {
    if (e) e.preventDefault();
    
    const isDraft = targetStatus === 'draft';
    const isAuction = document.getElementById('auctionEnabled').checked;

    // 1. Validation
    const name = document.getElementById('productName').value.trim();
    const price = parseFloat(document.getElementById('productPrice')?.value || 0);
    const auctionPrice = parseFloat(document.getElementById('auctionStartingPrice')?.value || 0);
    const stock = parseInt(document.getElementById('productStock')?.value || 0);
    const category = document.getElementById('productCategory').value;
    const weight = parseFloat(document.getElementById('shipWeight')?.value || 0);

    if (!name) {
        window.NotificationManager.showToast('Title Required', 'Please provide a product title.', 'warning');
        return;
    }
    if (!category) {
        window.NotificationManager.showToast('Category Required', 'Please select a product category.', 'warning');
        return;
    }
    if (!isAuction && price <= 0) {
        window.NotificationManager.showToast('Price Error', 'Please enter a valid fixed price.', 'warning');
        return;
    }
    if (isAuction && auctionPrice <= 0) {
        window.NotificationManager.showToast('Auction Error', 'Please enter a starting bid.', 'warning');
        return;
    }
    if (!isAuction && stock <= 0) {
        window.NotificationManager.showToast('Stock Error', 'Inventory level must be at least 1.', 'warning');
        return;
    }
    if (weight <= 0) {
        window.NotificationManager.showToast('Logistics Error', 'Please enter the item weight for shipping calculation.', 'warning');
        return;
    }

    if (!isDraft) {
        if (uploadedImages.length === 0 || !uploadedImages.some(img => img.isMain)) {
            window.NotificationManager.showToast('Missing Media', 'Please upload at least a primary product image.', 'error');
            return;
        }

        const unsafeItems = uploadedImages.filter(img => img.verification && img.verification.isSafe === false);
        if (unsafeItems.length > 0) {
            showUnsafeModal(unsafeItems);
            return;
        }

        // Agreement checks
        if (!document.getElementById('agreeTerms').checked || 
            !document.getElementById('confirmAccuracy').checked || 
            !document.getElementById('confirmOwnership').checked ||
            (document.getElementById('agreeDispute') && !document.getElementById('agreeDispute').checked)) {
            window.NotificationManager.showToast('Agreements Required', 'Please confirm all safety, ownership, and dispute resolution checkboxes.', 'warning');
            return;
        }

        // Dynamic Form Validation
        if (formBuilder && !formBuilder.validate()) return;
    }

    try {
        showLoading(true, 'Broadcasting your listing...');
        
        // 2. Upload Images to Storage
        const imageUrls = [];
        for (const imgObj of uploadedImages) {
            // If it's a draft and we don't have a file (maybe it's a re-save), we handle it
            // but for now, product-upload always has files for uploadedImages
            if (imgObj.file) {
                const storagePath = `products/${currentUser.id}/${Date.now()}_${imgObj.file.name}`;
                const storageRef = firebase.storage().ref(storagePath);
                const snapshot = await storageRef.put(imgObj.file);
                const downloadURL = await snapshot.ref.getDownloadURL();
                imageUrls.push({ url: downloadURL, isMain: imgObj.isMain });
            } else if (imgObj.url) {
                imageUrls.push({ url: imgObj.url, isMain: imgObj.isMain });
            }
        }
        
        const specs = {};
        document.querySelectorAll('.spec-row-item').forEach(row => {
            const k = row.querySelector('.spec-key').value.trim();
            const v = row.querySelector('.spec-val').value.trim();
            if (k && v) specs[k] = v;
        });

        const dynamicAttrs = formBuilder ? await formBuilder.collectDynamicData() : {};
        const variantInventory = formBuilder ? formBuilder.collectVariantInventory() : null;

        // 4. Prepare Push Payload
        const productRef = firebase.database().ref('products').push();
        const productId = productRef.key;

        const payload = {
            id: productId,
            name: document.getElementById('productName').value,
            category: document.getElementById('productCategory').value,
            condition: document.getElementById('productCondition').value,
            price: (isAuction ? parseFloat(document.getElementById('auctionStartingPrice').value) : parseFloat(document.getElementById('productPrice').value)) || 0,
            stock: variantInventory ? variantInventory.total : (isAuction ? 1 : (parseInt(document.getElementById('productStock').value) || 0)),
            location: document.getElementById('productLocation').value || '',
            description: document.getElementById('productDescription').value || '',
            tags: document.getElementById('productTags').value.split(',').map(t => t.trim()).filter(t => t),
            specifications: specs,
            dynamicAttributes: dynamicAttrs,
            variantInventory: variantInventory,
            weight: document.getElementById('shipWeight') ? parseFloat(document.getElementById('shipWeight').value) || 0 : 0,
            dimensions: {
                length: document.getElementById('shipLength') ? parseFloat(document.getElementById('shipLength').value) || 0 : 0,
                width: document.getElementById('shipWidth') ? parseFloat(document.getElementById('shipWidth').value) || 0 : 0,
                height: document.getElementById('shipHeight') ? parseFloat(document.getElementById('shipHeight').value) || 0 : 0
            },
            fragility: document.getElementById('shipFragility') ? document.getElementById('shipFragility').value : 'Standard',
            shippingMethod: 'standard',
            shippingCost: window._currentShippingFee || 0,
            shippingTier: window._currentShippingTier || 'Unknown',
            escrowFee: window._currentEscrowFee || 0,
            escrowTier: window._currentEscrowTier || 0,
            returnPolicy: document.getElementById('returnPolicy').value || '',
            images: imageUrls,
            sellerId: currentUser.id,
            sellerName: currentUser.name || 'SafeTrade Merchant',
            isActive: false, 
            verified: false,
            status: targetStatus,
            dispute_agreement: document.getElementById('agreeDispute') ? document.getElementById('agreeDispute').checked : false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            views: 0,
            favorites: 0,
            averageRating: 0,
            totalReviews: 0
        };

        if (isAuction) {
            payload.listingType = 'auction';
            const startPrice = parseFloat(document.getElementById('auctionStartingPrice').value) || 0;
            payload.auction = {
                enabled: true,
                startingPrice: startPrice,
                minIncrement: parseFloat(document.getElementById('auctionMinIncrement').value) || 10,
                duration: parseInt(document.getElementById('auctionDuration').value) || 7,
                currentBid: startPrice,
                startTime: new Date().toISOString(),
                endTime: new Date(Date.now() + (parseInt(document.getElementById('auctionDuration').value) || 7) * 24 * 60 * 60 * 1000).toISOString()
            };
            // Map root fields for compatibility
            payload.startingBid = payload.auction.startingPrice;
            payload.bidIncrement = payload.auction.minIncrement;
            payload.auctionDuration = payload.auction.duration;
            payload.auctionEndsAt = payload.auction.endTime;
            payload.currentBid = payload.auction.currentBid;
        } else {
            payload.listingType = 'fixed';
        }

        // 5. Submit to DB
        await productRef.set(payload);

        // 6. Notify Seller (Only for non-drafts or informative)
        if (!isDraft) {
            firebase.database().ref(`users/${currentUser.id}/notifications`).push({
                title: 'Listing Submitted',
                message: `Your product "${payload.name}" is now pending AI and staff verification.`,
                type: 'success',
                read: false,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            
            showLoading(false);
            document.getElementById('successModal').classList.add('show');
        } else {
            showLoading(false);
            window.NotificationManager.showToast('Draft Saved', 'Your progress has been saved. You can find it in your Product Management dashboard.', 'success');
            setTimeout(() => {
                window.location.href = 'product-management.html';
            }, 1500);
        }

    } catch (error) {
        console.error('Upload Failed:', error);
        window.NotificationManager.showToast('Submission Failed', error.message, 'error');
        showLoading(false);
    }
}

/* --- UTILS --- */

function showLoading(show, text = 'Processing...') {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    if (overlay) overlay.classList.toggle('show', show);
    if (textEl) textEl.textContent = text;
}

async function verifyImageWithAI(file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('/api/verify-image', {
        method: 'POST',
        body: formData
    });
    if (!response.ok) return null;
    return await response.json();
}

async function fetchPriceComparison(query) {
    if (!query || query.length < 3) return;
    const container = document.getElementById('comparisonResults');
    container.innerHTML = `
        <div class="loading-comparison">
            <div class="spinner" style="width: 28px; height: 28px; border-width: 2px; border-top-color: var(--axiom-primary); border-radius: 50%; border-style: solid; animation: spin 1s linear infinite;"></div>
            <p>Scanning markets...</p>
        </div>
    `;

    try {
        const response = await fetch('/api/compare-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: query })
        });
        if (!response.ok) throw new Error('Service unavailable');
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            container.innerHTML = `<div class="comparison-placeholder"><p>No similar products found on Daraz or OLX.</p></div>`;
            return;
        }

        let minPrice = Infinity, maxPrice = 0, sumPrice = 0, count = 0;
        data.results.forEach(item => {
            const pMatch = (item.price || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
            if (pMatch) {
                const p = parseFloat(pMatch[0]);
                if (p > 0) {
                    if (p < minPrice) minPrice = p;
                    if (p > maxPrice) maxPrice = p;
                    sumPrice += p;
                    count++;
                }
            }
        });
        const avgPrice = count > 0 ? sumPrice / count : 0;
        if (minPrice === Infinity) minPrice = 0;

        const summaryHtml = count > 0 ? `
            <div style="display: flex; justify-content: space-between; background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                <div><span style="display: block; color: #64748b; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 2px;">Lowest</span><strong style="color: #10b981; font-size: 0.95rem;">Rs ${minPrice.toLocaleString()}</strong></div>
                <div><span style="display: block; color: #64748b; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 2px;">Average</span><strong style="color: #4f46e5; font-size: 0.95rem;">Rs ${Math.round(avgPrice).toLocaleString()}</strong></div>
                <div><span style="display: block; color: #64748b; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 2px;">Highest</span><strong style="color: #ef4444; font-size: 0.95rem;">Rs ${maxPrice.toLocaleString()}</strong></div>
            </div>
        ` : '';

        container.innerHTML = summaryHtml + data.results.map(item => `
            <a href="${item.link}" target="_blank" class="comparison-item">
                <div class="comparison-details">
                    <div class="comparison-title" title="${item.title}">${item.title}</div>
                    <div class="comparison-price">${item.price}</div>
                    <div class="comparison-source">
                        <span class="source-badge ${item.source.toLowerCase()}">${item.source}</span>
                        <span>• ${item.location || 'Pakistan'}</span>
                    </div>
                </div>
            </a>
        `).join('');
    } catch (err) {
        container.innerHTML = `<div class="comparison-placeholder"><p style="color: #ef4444;">Could not fetch market prices.</p></div>`;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showUnsafeModal(unsafeItems) {
    const modal = document.getElementById('unsafeItemsModal');
    const list = document.getElementById('unsafeItemsList');
    list.innerHTML = unsafeItems.map(img => {
        const v = img.verification;
        const reason = (v.reasons && v.reasons.join(', ')) || v.label || 'Unsafe content';
        return `<li><i class="fas fa-times-circle" style="margin-right: 8px;"></i>${reason}</li>`;
    }).join('');
    modal.classList.add('show');
}

window.closeUnsafeModal = () => document.getElementById('unsafeItemsModal').classList.remove('show');

/* --- TERMS MODAL --- */
window.showTermsModal = () => {
    const modal = document.getElementById('termsModal');
    if (modal) modal.classList.add('show');
};

window.closeTermsModal = () => {
    const modal = document.getElementById('termsModal');
    if (modal) modal.classList.remove('show');
};
