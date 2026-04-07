// ========================================
// PRODUCT-UPLOAD.JS - JavaScript for product upload functionality
// ========================================

// Global variables
let uploadedImages = [];
let specifications = [];
let currentUser = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
  initializeProductUpload();
});

async function initializeProductUpload() {
  try {
    console.log('🛍️ Product Upload: Starting initialization...');

    // Wait for AuthManager
    if (window.AuthManager) {
      await window.AuthManager.waitForInit();
      currentUser = window.AuthManager.getCurrentUser();

      if (!currentUser) {
        console.error('❌ Product Upload: User not authenticated');
        window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent('product-upload.html');
        return;
      }

      console.log('✅ Product Upload: User authenticated:', currentUser.name);
    }

    // Temporarily allow all authenticated users for testing
    // TODO: Restore seller role restriction after testing
    // if (currentUser.role !== 'Seller' && currentUser.role !== 'Admin') {
    //   alert('Only sellers can upload products. Please contact support to upgrade your account.');
    //   window.location.href = 'dashboard.html';
    //   return;
    // }

    setupEventListeners();
    initializeFormValidation();
    initializeImageUpload();
    initializeSpecifications();

    console.log('✅ Product Upload: Initialization complete');

  } catch (error) {
    console.error('❌ Product Upload: Initialization error:', error);
    showToast('Failed to initialize product upload', 'error');
  }
}

function setupEventListeners() {
  // Form submission
  const form = document.getElementById('productUploadForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  // Save draft
  const saveDraftBtn = document.getElementById('saveDraft');
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', saveAsDraft);
  }

  // Description character counter
  const descriptionTextarea = document.getElementById('productDescription');
  if (descriptionTextarea) {
    descriptionTextarea.addEventListener('input', updateCharacterCount);
  }

  // Tags input
  const tagsInput = document.getElementById('productTags');
  if (tagsInput) {
    tagsInput.addEventListener('input', updateTagPreview);
  }

  // Add specification button
  const addSpecBtn = document.getElementById('addSpecification');
  if (addSpecBtn) {
    addSpecBtn.addEventListener('click', addSpecification);
  }

  // Form validation on input
  const inputs = document.querySelectorAll('.form-input, .form-select, .form-textarea');
  inputs.forEach(input => {
    input.addEventListener('blur', validateField);
    input.addEventListener('input', clearFieldError);
  });

  // Price Comparison Trigger
  const productNameInput = document.getElementById('productName');
  if (productNameInput) {
    productNameInput.addEventListener('input', debounce(function (e) {
      fetchPriceComparison(e.target.value);
    }, 1000));
  }

  // Listing Type Toggle
  const listingTypeInputs = document.querySelectorAll('input[name="listingType"]');
  listingTypeInputs.forEach(input => {
    input.addEventListener('change', handleListingTypeChange);
  });
}

function initializeFormValidation() {
  // Real-time validation
  const requiredFields = document.querySelectorAll('[required]');
  requiredFields.forEach(field => {
    field.addEventListener('blur', validateField);
  });
}

function initializeImageUpload() {
  // Main image upload
  const mainImageUpload = document.getElementById('mainImageUpload');
  const mainImageInput = document.getElementById('mainImage');

  if (mainImageUpload && mainImageInput) {
    mainImageUpload.addEventListener('click', () => mainImageInput.click());
    mainImageUpload.addEventListener('dragover', handleDragOver);
    mainImageUpload.addEventListener('dragleave', handleDragLeave);
    mainImageUpload.addEventListener('drop', handleDrop);
    mainImageInput.addEventListener('change', (e) => handleMainImageUpload(e));
  }

  // Additional images upload
  const additionalImagesUpload = document.getElementById('additionalImagesUpload');
  const additionalImagesInput = document.getElementById('additionalImages');

  if (additionalImagesUpload && additionalImagesInput) {
    additionalImagesUpload.addEventListener('click', () => additionalImagesInput.click());
    additionalImagesUpload.addEventListener('dragover', handleDragOver);
    additionalImagesUpload.addEventListener('dragleave', handleDragLeave);
    additionalImagesUpload.addEventListener('drop', handleDrop);
    additionalImagesInput.addEventListener('change', (e) => handleAdditionalImagesUpload(e));
  }
}

function initializeSpecifications() {
  // Add initial specification row
  addSpecification();
}

// Image Upload Handlers
function handleListingTypeChange(e) {
  const type = e.target.value;
  const fixedPriceGroup = document.getElementById('fixedPriceGroup');
  const auctionSettings = document.getElementById('auctionSettings');

  if (type === 'fixed') {
    fixedPriceGroup.style.display = 'flex';
    auctionSettings.style.display = 'none';

    // Update required attributes
    document.getElementById('productPrice').setAttribute('required', 'required');
    document.getElementById('startingBid').removeAttribute('required');
    document.getElementById('bidIncrement').removeAttribute('required');
    document.getElementById('auctionDuration').removeAttribute('required');
  } else {
    fixedPriceGroup.style.display = 'none';
    auctionSettings.style.display = 'grid';

    // Update required attributes
    document.getElementById('productPrice').removeAttribute('required');
    document.getElementById('startingBid').setAttribute('required', 'required');
    document.getElementById('bidIncrement').setAttribute('required', 'required');
    document.getElementById('auctionDuration').setAttribute('required', 'required');
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');

  const files = Array.from(e.dataTransfer.files);
  const isMainImage = e.currentTarget.id === 'mainImageUpload';

  if (isMainImage) {
    handleMainImageUpload({ target: { files: files.slice(0, 1) } });
  } else {
    handleAdditionalImagesUpload({ target: { files: files.slice(0, 5) } });
  }
}

function handleMainImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!validateImageFile(file)) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    console.log('📸 Image loaded by FileReader');
    // Initial upload state
    const newImage = { file, url: e.target.result, isMain: true, verification: null };
    uploadedImages = [newImage];
    console.log('📸 uploadedImages updated:', uploadedImages.length);
    updateImagePreview();

    // Perform verification
    showLoading(true, 'Verifying image with AI...');
    try {
      console.log('🤖 Sending image for verification...');
      const verificationResult = await verifyImageWithAI(file);
      console.log('🤖 Verification result:', verificationResult);

      // Update the image with verification result
      // Check if the image is still in the array (hasn't been removed by user)
      const currentImageIndex = uploadedImages.findIndex(img => img.file === file);

      if (currentImageIndex !== -1) {
        uploadedImages[currentImageIndex].verification = verificationResult;

        if (verificationResult) {
          if (!verificationResult.isSafe) {
            showToast(`Warning: ${verificationResult.label} detected!`, 'error');
          } else {
            showToast('Image verified successfully', 'success');
          }
        } else {
          showToast('Verification failed (server error), but image uploaded.', 'warning');
        }

        console.log('📸 Updating preview with verification result');
        updateImagePreview();
      } else {
        console.warn('⚠️ Image was removed before verification completed');
      }
    } catch (err) {
      console.error('❌ Error in verification flow:', err);
      showToast('Verification error, but image kept.', 'warning');
    } finally {
      showLoading(false);
    }
  };
  reader.readAsDataURL(file);
}

function handleAdditionalImagesUpload(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const validFiles = files.filter(validateImageFile);
  if (validFiles.length === 0) return;

  const readers = validFiles.map(file => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        resolve({ file, url: e.target.result, isMain: false });
      };
      reader.readAsDataURL(file);
    });
  });

  Promise.all(readers).then(async (images) => {
    // Remove existing additional images (optional, based on requirement, but keeping current logic)
    // uploadedImages = uploadedImages.filter(img => img.isMain); // Commented out to allow appending if desired, or keep to replace. 
    // The previous logic replaced all additional images. Let's stick to that for now or append? 
    // The user said "upload additional images", usually implies appending or replacing. 
    // The original code was: uploadedImages = uploadedImages.filter(img => img.isMain);
    // Let's keep it consistent with original behavior: replace additional images batch.

    uploadedImages = uploadedImages.filter(img => img.isMain);

    // Add new images with null verification initially
    const newImages = images.map(img => ({ ...img, verification: null }));
    uploadedImages.push(...newImages);
    updateImagePreview();

    // Verify each new image
    if (newImages.length > 0) {
      showLoading(true, `Verifying ${newImages.length} images...`);

      try {
        for (const img of newImages) {
          console.log('🤖 Verifying additional image...');
          const result = await verifyImageWithAI(img.file);

          // Find the image in the main array and update it
          const targetImg = uploadedImages.find(uImg => uImg.file === img.file);
          if (targetImg) {
            targetImg.verification = result;
            updateImagePreview(); // Update one by one to show progress
          }
        }
        showToast('All images verified', 'success');
      } catch (error) {
        console.error('Error verifying additional images:', error);
        showToast('Some images could not be verified', 'warning');
      } finally {
        showLoading(false);
      }
    }
  });
}

function validateImageFile(file) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    showToast('Please upload only JPG, PNG, or WebP images', 'error');
    return false;
  }

  if (file.size > maxSize) {
    showToast('Image size must be less than 10MB', 'error');
    return false;
  }

  return true;
}

function updateImagePreview() {
  const preview = document.getElementById('imagePreview');
  if (!preview) {
    console.error('❌ updateImagePreview: Preview element not found');
    return;
  }

  console.log('🖼️ updateImagePreview called. Images:', uploadedImages.length);

  if (uploadedImages.length === 0) {
    preview.innerHTML = '';
    return;
  }

  preview.innerHTML = uploadedImages.map((image, index) => `
    <div class="image-preview-item ${image.verification?.isSafe === false ? 'unsafe-item' : ''}">
      <img src="${image.url}" alt="Product image ${index + 1}">
      ${image.isMain ? '<div class="main-badge">Main</div>' : ''}

      ${image.verification ? `
        <div class="verification-badge ${image.verification.isSafe ? 'safe' : 'unsafe'}">
          ${image.verification.isSafe
        ? '<i class="fas fa-check-circle"></i> Verified Safe'
        : `<i class="fas fa-exclamation-triangle"></i> Detected: ${image.verification.reasons ? image.verification.reasons[0] : (image.verification.label || 'Unsafe Item')}`}
        </div>
      ` : ''}

      <button type="button" class="remove-image" onclick="removeImage(${index})">×</button>
    </div>
  `).join('');
}

async function verifyImageWithAI(file) {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch('/api/verify-image', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Verification failed');
    }

    return await response.json();
  } catch (error) {
    console.error('AI Verification Error:', error);
    return null;
  }
}

async function comparePrices(title) {
  try {
    const response = await fetch('/api/compare-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title })
    });

    if (!response.ok) {
      throw new Error('Price comparison failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Price Comparison Error:', error);
    return null;
  }
}

function removeImage(index) {
  uploadedImages.splice(index, 1);
  updateImagePreview();
}

// Specifications
function addSpecification() {
  const container = document.getElementById('specificationsContainer');
  if (!container) return;

  const specRow = document.createElement('div');
  specRow.className = 'spec-row';
  specRow.innerHTML = `
    <input type="text" placeholder="Specification name" class="spec-name">
    <input type="text" placeholder="Value" class="spec-value">
    <button type="button" class="btn btn-secondary btn-small remove-spec" onclick="removeSpecification(this)">Remove</button>
  `;

  container.appendChild(specRow);
}

function removeSpecification(button) {
  const container = document.getElementById('specificationsContainer');
  if (container.children.length > 1) {
    button.closest('.spec-row').remove();
  } else {
    showToast('At least one specification is required', 'warning');
  }
}

// Form Validation
function validateField(e) {
  const field = e.target;
  const value = field.value.trim();

  // Remove existing error
  clearFieldError(e);

  // Required field validation
  if (field.hasAttribute('required') && !value) {
    showFieldError(field, 'This field is required');
    return false;
  }

  // Specific validations
  switch (field.name) {
    case 'name':
      if (value.length < 3) {
        showFieldError(field, 'Product name must be at least 3 characters');
        return false;
      }
      break;
    case 'price':
      const price = parseFloat(value);
      if (isNaN(price) || price < 0) {
        showFieldError(field, 'Please enter a valid price');
        return false;
      }
      break;
    case 'stock':
      const stock = parseInt(value);
      if (isNaN(stock) || stock < 0) {
        showFieldError(field, 'Please enter a valid stock quantity');
        return false;
      }
      break;
    case 'description':
      if (value.length < 10) {
        showFieldError(field, 'Description must be at least 10 characters');
        return false;
      }
      break;
    case 'startingBid':
      const startBid = parseFloat(value);
      if (isNaN(startBid) || startBid < 0) {
        showFieldError(field, 'Please enter a valid starting bid');
        return false;
      }
      break;
    case 'bidIncrement':
      const inc = parseFloat(value);
      if (isNaN(inc) || inc <= 0) {
        showFieldError(field, 'Increment must be greater than 0');
        return false;
      }
      break;
  }

  return true;
}

function showFieldError(field, message) {
  field.classList.add('error');

  // Remove existing error message
  const existingError = field.parentNode.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }

  // Add new error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  field.parentNode.appendChild(errorDiv);
}

function clearFieldError(e) {
  const field = e.target;
  field.classList.remove('error');

  const errorMessage = field.parentNode.querySelector('.error-message');
  if (errorMessage) {
    errorMessage.remove();
  }
}

// Character Counter
function updateCharacterCount(e) {
  const textarea = e.target;
  const count = textarea.value.length;
  const counter = document.getElementById('descriptionCount');

  if (counter) {
    counter.textContent = count;

    if (count > 1800) {
      counter.classList.add('error');
    } else if (count > 1500) {
      counter.classList.add('warning');
    } else {
      counter.classList.remove('warning', 'error');
    }
  }
}

// Tag Preview
function updateTagPreview(e) {
  const input = e.target;
  const tags = input.value.split(',').map(tag => tag.trim()).filter(tag => tag);
  const preview = document.getElementById('tagPreview');

  if (preview) {
    preview.innerHTML = tags.map(tag => `<span class="tag">${tag}</span>`).join('');
  }
}

// Form Submission
async function handleFormSubmit(e) {
  e.preventDefault();

  console.log('🛍️ Product Upload: Form submission started');

  // Validate form
  if (!validateForm()) {
    showToast('Please fix the errors in the form', 'error');
    return;
  }

  // Check if user agreed to terms
  const agreeTerms = document.getElementById('agreeTerms').checked;
  const confirmAccuracy = document.getElementById('confirmAccuracy').checked;
  const confirmOwnership = document.getElementById('confirmOwnership').checked;

  if (!agreeTerms || !confirmAccuracy || !confirmOwnership) {
    showToast('Please agree to all terms and confirmations', 'error');
    return;
  }

  showLoading(true, 'Uploading product...');

  try {
    console.log('📝 Collecting form data...');
    const formData = collectFormData();
    console.log('📦 Form data collected:', formData);

    console.log('🚀 Starting product upload...');
    const result = await uploadProduct(formData);

    if (result.success) {
      showSuccessModal();
      console.log('✅ Product Upload: Product uploaded successfully');
    } else {
      throw new Error(result.message || 'Failed to upload product');
    }

  } catch (error) {
    console.error('❌ Product Upload: Upload error:', error);
    console.error('❌ Error details:', error.stack);
    showToast(error.message || 'Failed to upload product', 'error');
    // Fallback alert if toast doesn't show or for critical errors
    if (error.code === 'storage/unauthorized') {
      alert('Permission denied: You do not have permission to upload images. Please check your login status.');
    }
  } finally {
    showLoading(false);
  }
}

function validateForm() {
  const requiredFields = document.querySelectorAll('[required]');
  let isValid = true;

  requiredFields.forEach(field => {
    if (!validateField({ target: field })) {
      isValid = false;
    }
  });

  // Check if main image is uploaded
  if (uploadedImages.filter(img => img.isMain).length === 0) {
    showToast('Please upload a main product image', 'error');
    isValid = false;
  }

  // Check for unsafe items
  const unsafeItems = uploadedImages.filter(img => img.verification && !img.verification.isSafe);
  if (unsafeItems.length > 0) {
    // Show custom unsafe modal
    const modal = document.getElementById('unsafeItemsModal');
    const list = document.getElementById('unsafeItemsList');

    if (modal && list) {
      list.innerHTML = unsafeItems.map(img => {
        // Extract reason from verification result
        let reason = 'Unsafe content detected';
        if (img.verification.reasons && img.verification.reasons.length > 0) {
          reason = img.verification.reasons.join(', ');
        } else if (img.verification.label) {
          reason = img.verification.label;
        }
        return `<li>${reason}</li>`;
      }).join('');

      modal.classList.add('show');
    } else {
      // Fallback if modal missing
      alert(`Cannot list product.\n\nThe following items were detected as unsafe:\n${unsafeItems.map(img => {
        let reason = 'Unsafe content detected';
        if (img.verification.reasons && img.verification.reasons.length > 0) {
          reason = img.verification.reasons.join(', ');
        }
        return `- ${reason}`;
      }).join('\n')}\n\nPlease remove these images to proceed.`);
    }

    showToast('Cannot upload: Unsafe items detected', 'error');
    isValid = false;
  }

  return isValid;
}

function closeUnsafeModal() {
  const modal = document.getElementById('unsafeItemsModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// Make global
window.closeUnsafeModal = closeUnsafeModal;

function collectFormData() {
  const form = document.getElementById('productUploadForm');
  const formData = new FormData(form);

  // Add specifications
  const specs = {};
  const specRows = document.querySelectorAll('.spec-row');
  specRows.forEach(row => {
    const name = row.querySelector('.spec-name').value.trim();
    const value = row.querySelector('.spec-value').value.trim();
    if (name && value) {
      specs[name] = value;
    }
  });

  // Add tags
  const tagsInput = document.getElementById('productTags');
  const tags = tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag);

  // Add images
  const images = uploadedImages.map(img => ({
    file: img.file,
    isMain: img.isMain
  }));

  return {
    name: formData.get('name'),
    description: formData.get('description'),
    price: formData.get('listingType') === 'auction' ? parseFloat(formData.get('startingBid')) : parseFloat(formData.get('price')),
    category: formData.get('category'),
    stock: parseInt(formData.get('stock')),
    condition: formData.get('condition'),
    location: formData.get('location') || '',
    specifications: specs,
    tags: tags,
    images: images,
    shippingMethod: formData.get('shippingMethod') || 'standard',
    shippingCost: parseFloat(formData.get('shippingCost')) || 0,
    returnPolicy: formData.get('returnPolicy') || '',
    sellerId: currentUser.id,
    sellerName: currentUser.name,
    listingType: formData.get('listingType'),
    startingBid: formData.get('listingType') === 'auction' ? parseFloat(formData.get('startingBid')) : null,
    bidIncrement: formData.get('listingType') === 'auction' ? parseFloat(formData.get('bidIncrement')) : null,
    auctionDuration: formData.get('listingType') === 'auction' ? parseInt(formData.get('auctionDuration')) : null,
    auctionEndsAt: formData.get('listingType') === 'auction' ? new Date(Date.now() + parseInt(formData.get('auctionDuration')) * 24 * 60 * 60 * 1000).toISOString() : null,
    currentBid: formData.get('listingType') === 'auction' ? parseFloat(formData.get('startingBid')) : null
  };
}

async function uploadProduct(productData) {
  try {
    console.log('🛍️ Starting product upload...');

    // 1. Upload Images
    console.log('📸 Uploading images...');
    const imageUrls = await uploadImages(productData.images);
    console.log('✅ Images uploaded:', imageUrls);

    // 2. Prepare Product Data
    const newProductRef = firebase.database().ref('products').push();
    const productId = newProductRef.key;

    const apiData = {
      ...productData,
      id: productId,
      images: imageUrls,
      isActive: true,
      isFeatured: false,
      views: 0,
      favorites: 0,
      averageRating: 0,
      totalReviews: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('📦 Saving product to Firebase RTDB:', productId);
    console.log('📦 Data being saved:', JSON.stringify(apiData, null, 2));

    // 3. Save to RTDB
    try {
      await newProductRef.set(apiData);
    } catch (dbError) {
      console.error('❌ RTDB Write Error:', dbError);
      alert(`Database Error: ${dbError.message}\nCode: ${dbError.code}`);
      throw dbError;
    }

    console.log('✅ Product saved successfully');

    return {
      success: true,
      message: 'Product uploaded successfully',
      data: { product: apiData }
    };

  } catch (error) {
    console.error('❌ Upload error:', error);
    if (error.code !== 'storage/unauthorized') { // Don't double alert
      alert(`Upload Failed: ${error.message}`);
    }
    throw error;
  }
}

async function uploadImages(images) {
  const uploadPromises = images.map(async (imageData) => {
    try {
      // Upload to Firebase Storage
      // Upload to Firebase Storage
      const storage = firebase.storage();
      const storageRef = storage.ref();
      // Use user ID in path to match security rules: products/{userId}/{fileName}
      const userId = currentUser ? currentUser.id : 'anonymous';
      const imageRef = storageRef.child(`products/${userId}/${Date.now()}_${imageData.file.name}`);

      const snapshot = await imageRef.put(imageData.file);
      const downloadURL = await snapshot.ref.getDownloadURL();

      return {
        url: downloadURL,
        isMain: imageData.isMain
      };
    } catch (error) {
      console.error('Image upload error:', error);
      throw error;
    }
  });

  return Promise.all(uploadPromises);
}

async function saveAsDraft() {
  console.log('🛍️ Product Upload: Saving as draft');

  const formData = collectFormData();
  formData.isActive = false; // Mark as draft

  showLoading(true, 'Saving draft...');

  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (result.success) {
      showToast('Draft saved successfully!', 'success');
      // Optionally redirect to management page
      setTimeout(() => {
        window.location.href = 'product-management.html';
      }, 2000);
    } else {
      throw new Error(result.message || 'Failed to save draft');
    }

  } catch (error) {
    console.error('❌ Product Upload: Draft save error:', error);
    showToast(error.message || 'Failed to save draft', 'error');
  } finally {
    showLoading(false);
  }
}

// Price Comparison Logic
async function fetchPriceComparison(query) {
  if (!query || query.length < 3) return;

  const container = document.getElementById('comparisonResults');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-comparison">
      <div class="spinner" style="width: 24px; height: 24px; border-width: 2px;"></div>
      <p>Searching best prices...</p>
    </div>
  `;

  try {
    // Call Python Microservice with Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000); // 40 second timeout for Live Scraping

    const response = await fetch('/api/compare-prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: query }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('Comparison service unavailable');
    }

    const data = await response.json();
    renderComparisonResults(data.results);

  } catch (error) {
    console.error('Price Comparison Error:', error);
    if (error.name === 'AbortError') {
      container.innerHTML = `
        <div class="comparison-placeholder">
          <p style="color: #ef4444;">Request timed out. Please try again.</p>
        </div>
      `;
    } else {
      container.innerHTML = `
          <div class="comparison-placeholder">
            <p style="color: #ef4444;">Could not fetch prices.<br>Make sure the comparison module is running.</p>
          </div>
        `;
    }
  }
}

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

  container.innerHTML = results.map(item => `
    <a href="${item.link}" target="_blank" class="comparison-item">
      <div class="comparison-details">
        <div class="comparison-title" title="${item.title}">${item.title}</div>
        <div class="comparison-price">${item.price}</div>
        <div class="comparison-source">
          <span class="source-badge ${item.source.toLowerCase()}">${item.source}</span>
          <span>• ${item.location}</span>
        </div>
      </div>
    </a>
  `).join('');
}

// Utility debounce
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

// Utility Functions
function showLoading(show, text = 'Processing...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');

  if (overlay) {
    overlay.classList.toggle('show', show);
  }

  if (loadingText) {
    loadingText.textContent = text;
  }
}

function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>${message}</span>
          <button style="background: none; border: none; cursor: pointer; margin-left: 12px;" onclick="this.parentElement.parentElement.remove()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
            </svg>
          </button>
        </div>
        `;

  // Add to page
  document.body.appendChild(toast);

  // Show toast
  setTimeout(() => toast.classList.add('show'), 100);

  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function showSuccessModal() {
  const modal = document.getElementById('successModal');
  if (modal) {
    modal.classList.add('show');
  }
}

function closeSuccessModal() {
  const modal = document.getElementById('successModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// Global functions for HTML onclick handlers
window.removeImage = removeImage;
window.removeSpecification = removeSpecification;
window.closeSuccessModal = closeSuccessModal;

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeProductUpload,
    handleFormSubmit,
    saveAsDraft,
    uploadProduct
  };
}
