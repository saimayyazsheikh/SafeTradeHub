// ========================================
// PRODUCT-UPLOAD.JS - JavaScript for product upload functionality
// ========================================

// Global variables
let uploadedImages = [];
let specifications = [];
let currentUser = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
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
  reader.onload = function(e) {
    uploadedImages = [{ file, url: e.target.result, isMain: true }];
    updateImagePreview();
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
      reader.onload = function(e) {
        resolve({ file, url: e.target.result, isMain: false });
      };
      reader.readAsDataURL(file);
    });
  });
  
  Promise.all(readers).then(images => {
    // Remove existing additional images
    uploadedImages = uploadedImages.filter(img => img.isMain);
    uploadedImages.push(...images);
    updateImagePreview();
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
  if (!preview) return;
  
  if (uploadedImages.length === 0) {
    preview.innerHTML = '';
    return;
  }
  
  preview.innerHTML = uploadedImages.map((image, index) => `
    <div class="image-preview-item">
      <img src="${image.url}" alt="Product image ${index + 1}">
      ${image.isMain ? '<div class="main-badge">Main</div>' : ''}
      <button type="button" class="remove-image" onclick="removeImage(${index})">×</button>
    </div>
  `).join('');
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
  
  return isValid;
}

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
    price: parseFloat(formData.get('price')),
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
    sellerName: currentUser.name
  };
}

async function uploadProduct(productData) {
  try {
    console.log('🛍️ Starting product upload...');
    
    // For testing purposes, skip image upload and use placeholder
    const imageUrls = productData.images.map((img, index) => ({
      url: `data:image/svg+xml;base64,${btoa(`
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#f3f4f6"/>
          <rect x="50" y="50" width="300" height="200" fill="#e5e7eb" rx="8"/>
          <text x="200" y="120" text-anchor="middle" fill="#6b7280" font-family="Arial" font-size="16">Product Image ${index + 1}</text>
          <text x="200" y="140" text-anchor="middle" fill="#9ca3af" font-family="Arial" font-size="12">400x300</text>
        </svg>
      `)}`,
      isMain: img.isMain
    }));
    
    console.log('📸 Using placeholder images for testing');
    
    // Prepare product data for API
    const apiData = {
      ...productData,
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
    
    console.log('📦 Product data prepared:', apiData);
    
    // TEMPORARY: Save to localStorage for testing (bypass API)
    console.log('🧪 TESTING MODE: Saving to localStorage instead of API');
    
    // Get existing products from localStorage
    const existingProducts = JSON.parse(localStorage.getItem('testProducts') || '[]');
    
    // Add new product
    const newProduct = {
      id: 'test_' + Date.now(),
      ...apiData
    };
    
    existingProducts.push(newProduct);
    localStorage.setItem('testProducts', JSON.stringify(existingProducts));
    
    console.log('✅ Product saved to localStorage:', newProduct);
    
    // Simulate API response
    return {
      success: true,
      message: 'Product uploaded successfully (TEST MODE)',
      data: {
        product: newProduct
      }
    };
    
    /* ORIGINAL API CODE - COMMENTED OUT FOR TESTING
    // Send to backend API
    const token = localStorage.getItem('authToken');
    console.log('🔑 Using token:', token ? 'Present' : 'Missing');
    
    // Test API connectivity first
    try {
      console.log('🔍 Testing API connectivity...');
      const testResponse = await fetch('/api/products', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('🔍 Test response status:', testResponse.status);
    } catch (testError) {
      console.error('❌ API connectivity test failed:', testError);
      throw new Error('Cannot connect to server. Please check if the backend is running.');
    }
    
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apiData)
    });
    
    console.log('📡 API Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ API Response:', result);
    
    if (result.success) {
      return result;
    } else {
      throw new Error(result.message || 'Failed to create product');
    }
    */
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    throw error;
  }
}

async function uploadImages(images) {
  const uploadPromises = images.map(async (imageData) => {
    try {
      // Upload to Firebase Storage
      const storage = firebase.storage();
      const storageRef = storage.ref();
      const imageRef = storageRef.child(`products/${Date.now()}_${imageData.file.name}`);
      
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
          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
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
