/**
 * PRODUCT-EDIT.JS - Axiom Protocol Enhanced
 * Handles product updating, media management, and modern side-nav navigation.
 */

let currentProduct = null;
let currentUser = null;
let newImagesToUpload = [];
let removedImagesUrls = []; // Track to potentially cleanup storage (optional)

document.addEventListener('DOMContentLoaded', async () => {
    await initEditFlow();
});

async function initEditFlow() {
    try {
        // 1. Auth Guard
        if (window.AuthManager) {
            await window.AuthManager.waitForInit();
            currentUser = window.AuthManager.getCurrentUser();
            if (!currentUser) {
                window.location.href = 'auth.html?mode=signin&redirect=product-edit.html' + window.location.search;
                return;
            }
        }

        // 2. Load Data
        const params = new URLSearchParams(window.location.search);
        const productId = params.get('id');
        
        if (!productId) {
            window.NotificationManager.showToast('Error', 'No product ID provided', 'error');
            setTimeout(() => window.location.href = 'product-management.html', 2000);
            return;
        }

        const snapshot = await firebase.database().ref(`products/${productId}`).once('value');
        currentProduct = snapshot.val();
        
        if (!currentProduct) {
            window.NotificationManager.showToast('Error', 'Product not found', 'error');
            return;
        }

        // 3. Setup UI
        populateGeneralInfo();
        displayCurrentImages();
        displaySpecifications();
        setupNavigation();
        setupEventListeners();

        showLoading(false);
    } catch (error) {
        console.error('Init Error:', error);
        window.NotificationManager.showToast('System Error', error.message, 'error');
        showLoading(false);
    }
}

/* --- UI POPULATION --- */

function populateGeneralInfo() {
    // Basic Info
    document.getElementById('productName').value = currentProduct.name || '';
    document.getElementById('productCategory').value = currentProduct.category || '';
    document.getElementById('productCondition').value = currentProduct.condition || 'new';
    document.getElementById('productPrice').value = currentProduct.price || 0;
    document.getElementById('productStock').value = currentProduct.stock || 1;
    document.getElementById('productLocation').value = currentProduct.location || '';
    
    // Auction Info
    const auction = currentProduct.auction || {};
    const auctionToggle = document.getElementById('auctionEnabled');
    const auctionFields = document.getElementById('auctionFields');
    const fixedPriceGroup = document.getElementById('fixedPriceGroup');

    if (auction.enabled) {
        auctionToggle.checked = true;
        auctionFields.style.display = 'grid';
        if (fixedPriceGroup) fixedPriceGroup.classList.add('hidden-price');
        const inventoryGroup = document.getElementById('inventoryGroup');
        const productStock = document.getElementById('productStock');
        if (inventoryGroup) {
            inventoryGroup.classList.add('hidden-price');
            if (productStock) productStock.removeAttribute('required');
        }
        if (productStock) productStock.value = 1;

        document.getElementById('auctionStartingPrice').value = auction.startingPrice || '';
        document.getElementById('auctionMinIncrement').value = auction.minIncrement || '';
        document.getElementById('auctionDuration').value = auction.duration || '7';
    }
    
    // Details
    document.getElementById('productDescription').value = currentProduct.description || '';
    updateCharCount(currentProduct.description || '');
    
    document.getElementById('productTags').value = (currentProduct.tags || []).join(', ');
    updateTagPreview((currentProduct.tags || []).join(', '));
    
    // Shipping
    document.getElementById('shippingMethod').value = currentProduct.shippingMethod || 'standard';
    document.getElementById('returnPolicy').value = currentProduct.returnPolicy || '';

    // Price Comparison (Initial Load)
    if (currentProduct.name) {
        fetchPriceComparison(currentProduct.name);
    }
}

function displayCurrentImages() {
    const container = document.getElementById('currentImages');
    const images = currentProduct.images || [];
    
    if (images.length === 0) {
        container.innerHTML = `<p style="color: #94a3b8; font-style: italic;">No images available.</p>`;
        return;
    }

    container.innerHTML = images.map((img, idx) => `
        <div class="image-thumb" data-url="${img.url}">
            <img src="${img.url}" alt="Product image">
            <button type="button" class="remove-img-btn" onclick="removeExistingImage(${idx})" title="Remove Image">
                <i class="fas fa-times"></i>
            </button>
            ${img.isMain ? '<div class="image-status-marker" style="background: rgba(79, 70, 229, 0.9);">MAIN</div>' : ''}
        </div>
    `).join('');
}

function displaySpecifications() {
    const container = document.getElementById('specificationsContainer');
    const specs = currentProduct.specifications || {};
    container.innerHTML = '';
    
    const keys = Object.keys(specs);
    if (keys.length === 0) {
        addSpecificationRow(); // Add one empty row
    } else {
        keys.forEach(key => addSpecificationRow(key, specs[key]));
    }
}

/* --- EVENT LISTENERS & NAVIGATION --- */

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
    document.getElementById('productDescription').addEventListener('input', (e) => updateCharCount(e.target.value));
    
    // Tag Preview
    document.getElementById('productTags').addEventListener('input', (e) => updateTagPreview(e.target.value));
    
    // Spec Button
    document.getElementById('addSpecification').addEventListener('click', () => addSpecificationRow());
    
    // New Image Upload
    document.getElementById('newImagesInput').addEventListener('change', handleFileSelection);
    
    // Form Submission
    document.getElementById('productEditForm').addEventListener('submit', handleFormSubmit);
    
    // Save as Draft (Specific to Edit page)
    const draftBtn = document.getElementById('saveDraftEdit');
    if (draftBtn) {
        draftBtn.addEventListener('click', (e) => {
            handleFormSubmit(e, 'draft');
        });
    }

    // Cancel
    document.getElementById('cancelEdit').addEventListener('click', () => {
        window.location.href = 'product-management.html';
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
                if (productStock) productStock.value = 1;
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
}

function updateCharCount(text) {
    const counter = document.getElementById('descriptionCount');
    counter.textContent = text.length;
    counter.style.color = text.length > 1800 ? '#ef4444' : '#64748b';
}

function updateTagPreview(text) {
    const preview = document.getElementById('tagPreview');
    const tags = text.split(',').map(t => t.trim()).filter(t => t !== '');
    preview.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
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

/* --- IMAGE MANAGEMENT --- */

window.removeExistingImage = (idx) => {
    const img = currentProduct.images[idx];
    removedImagesUrls.push(img.url);
    currentProduct.images.splice(idx, 1);
    displayCurrentImages();
};

function handleFileSelection(e) {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const newImageObj = {
                file: file,
                url: event.target.result,
                verification: { status: 'verifying' } // Initial state
            };
            
            newImagesToUpload.push(newImageObj);
            renderNewImagesPreview();
            
            // Trigger AI Verification
            try {
                const result = await verifyImageWithAI(file);
                newImageObj.verification = result || { isSafe: true }; // Fallback if AI fails but we want to allow it
                renderNewImagesPreview();
            } catch (err) {
                console.error('Verification failed:', err);
                newImageObj.verification = { isSafe: true }; // Non-blocking on network error for now
                renderNewImagesPreview();
            }
        };
        reader.readAsDataURL(file);
    });
}

function renderNewImagesPreview() {
    const container = document.getElementById('newImagesPreview');
    container.innerHTML = newImagesToUpload.map((imgObj, idx) => {
        const v = imgObj.verification;
        let badgeHtml = '';
        
        if (v.status === 'verifying') {
            badgeHtml = `<div class="verification-badge verifying"><i class="fas fa-spinner fa-spin"></i> Checking...</div>`;
        } else if (v.isSafe === true) {
            badgeHtml = `<div class="verification-badge safe"><i class="fas fa-check-circle"></i> Safe</div>`;
        } else if (v.isSafe === false) {
            const rawReason = (v.reasons && v.reasons[0]) || v.label || 'Unsafe content';
            // Prettify: convert "SOME_REASON" to "Some Reason"
            const prettyReason = rawReason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            badgeHtml = `<div class="verification-badge unsafe" title="${rawReason}"><i class="fas fa-exclamation-triangle"></i> Detected: ${prettyReason}</div>`;
        }

        return `
            <div class="image-thumb ${v.isSafe === false ? 'unsafe-item' : ''}">
                <img src="${imgObj.url}" alt="New upload">
                <button type="button" class="remove-img-btn" onclick="removeNewImage(${idx})">
                    <i class="fas fa-times"></i>
                </button>
                ${badgeHtml}
                <div class="image-status-marker">NEW</div>
            </div>
        `;
    }).join('');
}

window.removeNewImage = (idx) => {
    newImagesToUpload.splice(idx, 1);
    renderNewImagesPreview();
}

/* --- CORE UPDATE LOGIC --- */

async function handleFormSubmit(e, targetStatus = 'pending_verification') {
    if (e) e.preventDefault();
    
    const isDraft = targetStatus === 'draft';
    const msg = isDraft ? 'Save this as a draft?' : 'Are you sure you want to list this product? It will be sent for verification.';
    
    const confirm = await window.NotificationManager.showConfirm(
        isDraft ? 'Save Draft' : 'Update & List',
        msg
    );
    
    if (!confirm) return;

    // AI Safety Gate: Check for unsafe items in new uploads (Only if not a draft)
    const unsafeItems = newImagesToUpload.filter(img => img.verification && img.verification.isSafe === false);
    if (!isDraft && unsafeItems.length > 0) {
        showUnsafeModal(unsafeItems);
        return;
    }

    try {
        showLoading(true, 'Syncing revisions...');
        
        // 1. Upload new images if any
        const uploadedMedia = await uploadRemainingImages();
        
        // 2. Construct final image array
        const finalImages = [
            ...(currentProduct.images || []),
            ...uploadedMedia
        ];
        
        if (!isDraft && finalImages.length === 0) {
            throw new Error('At least one image is required for listing.');
        }

        // 3. Ensure a main image exists
        const hasMain = finalImages.some(img => img.isMain);
        if (!hasMain) finalImages[0].isMain = true;

        // 4. Collect other fields
        const specs = {};
        document.querySelectorAll('.spec-row-item').forEach(row => {
            const k = row.querySelector('.spec-key').value.trim();
            const v = row.querySelector('.spec-val').value.trim();
            if (k && v) specs[k] = v;
        });

        const isAuction = document.getElementById('auctionEnabled').checked;
        const auctionData = {
            enabled: isAuction,
            startingPrice: isAuction ? parseFloat(document.getElementById('auctionStartingPrice').value) : null,
            minIncrement: isAuction ? parseFloat(document.getElementById('auctionMinIncrement').value) : null,
            duration: isAuction ? parseInt(document.getElementById('auctionDuration').value) : null,
            updatedAt: new Date().toISOString()
        };

        if (isAuction) {
            if (!auctionData.startingPrice || auctionData.startingPrice <= 0) throw new Error('Auction starting price must be greater than 0');
            if (!auctionData.minIncrement || auctionData.minIncrement <= 0) throw new Error('Auction minimum increment must be greater than 0');
        }

        const updatePayload = {
            name: document.getElementById('productName').value,
            category: document.getElementById('productCategory').value,
            condition: document.getElementById('productCondition').value,
            price: isAuction ? auctionData.startingPrice : (parseFloat(document.getElementById('productPrice').value) || 0),
            stock: isAuction ? 1 : (parseInt(document.getElementById('productStock').value) || 0),
            location: document.getElementById('productLocation').value || '',
            description: document.getElementById('productDescription').value || '',
            tags: document.getElementById('productTags').value.split(',').map(t => t.trim()).filter(t => t),
            specifications: specs,
            shippingMethod: 'standard',
            shippingCost: 0,
            returnPolicy: document.getElementById('returnPolicy').value || '',
            images: finalImages,
            auction: auctionData,
            status: targetStatus,
            updatedAt: new Date().toISOString()
        };

        await firebase.database().ref(`products/${currentProduct.id}`).update(updatePayload);
        
        // 5. Notify Seller if promoted from Draft to Pending
        if (targetStatus === 'pending_verification') {
            firebase.database().ref(`users/${currentUser.id}/notifications`).push({
                title: 'Listing Submitted',
                message: `Your product "${updatePayload.name}" is now pending AI and staff verification.`,
                type: 'success',
                read: false,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }

        showLoading(false);
        const successMsg = isDraft ? 'Draft updated successfully!' : 'Product listed for verification!';
        window.NotificationManager.showToast('Success', successMsg, 'success');
        
        setTimeout(() => {
            window.location.href = 'product-management.html';
        }, 1500);

    } catch (error) {
        console.error('Update Failed:', error);
        window.NotificationManager.showToast('Update Failed', error.message, 'error');
        showLoading(false);
    }
}

async function uploadRemainingImages() {
    if (newImagesToUpload.length === 0) return [];
    
    const results = [];
    for (const imgObj of newImagesToUpload) {
        const ref = firebase.storage().ref(`products/${currentUser.id}/${Date.now()}_${imgObj.file.name}`);
        const snapshot = await ref.put(imgObj.file);
        const url = await snapshot.ref.getDownloadURL();
        results.push({ url, isMain: false });
    }
    return results;
}

function showLoading(show, text = 'Processing...') {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    if (overlay) overlay.classList.toggle('show', show);
    if (textEl) textEl.textContent = text;
}

// ========================================
// Price Comparison Module Logic
// ========================================

/**
 * Fetches price comparison from Daraz/OLX API
 * @param {string} query Product name
 */
async function fetchPriceComparison(query) {
    if (!query || query.length < 3) return;

    const container = document.getElementById('comparisonResults');
    if (!container) return;

    container.innerHTML = `
        <div class="loading-comparison">
            <div class="spinner" style="width: 28px; height: 28px; border-width: 2px; border-top-color: var(--axiom-primary);"></div>
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
        renderComparisonResults(data.results);
    } catch (error) {
        console.error('Comparison Error:', error);
        container.innerHTML = `
            <div class="comparison-placeholder">
                <i class="fas fa-exclamation-circle" style="font-size: 1.5rem; color: #f87171; margin-bottom: 8px; display: block;"></i>
                <p style="color: #ef4444; font-size: 0.8rem;">Could not fetch market prices.</p>
            </div>
        `;
    }
}

/**
 * Renders comparison item cards
 * @param {Array} results Array of product results
 */
function renderComparisonResults(results) {
    const container = document.getElementById('comparisonResults');
    if (!container) return;

    if (!results || results.length === 0) {
        container.innerHTML = `
            <div class="comparison-placeholder">
                <p>No similar products found on Daraz or OLX.</p>
            </div>
        `;
        return;
    }

    let minPrice = Infinity, maxPrice = 0, sumPrice = 0, count = 0;
    results.forEach(item => {
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

    container.innerHTML = summaryHtml + results.map(item => `
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
}

/**
 * Utility: Debounce
 */
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

/**
 * AI CORE: Verifies image content via backend API
 */
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

/**
 * SAFETY CORE: Modal Management
 */
function showUnsafeModal(unsafeItems) {
    const modal = document.getElementById('unsafeItemsModal');
    const list = document.getElementById('unsafeItemsList');
    
    if (modal && list) {
        list.innerHTML = unsafeItems.map(img => {
            const v = img.verification;
            const reason = (v.reasons && v.reasons.join(', ')) || v.label || 'Unsafe content detected';
            return `<li><i class="fas fa-times-circle" style="margin-right: 8px;"></i>${reason}</li>`;
        }).join('');
        
        modal.classList.add('show');
    }
}

function closeUnsafeModal() {
    const modal = document.getElementById('unsafeItemsModal');
    if (modal) modal.classList.remove('show');
}

window.closeUnsafeModal = closeUnsafeModal;
