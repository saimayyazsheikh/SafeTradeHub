// ========================================
// PRODUCT-EDIT.JS - JavaScript for product edit functionality
// ========================================

// Global variables
let currentProduct = null;
let currentUser = null;
let uploadedImages = [];
let specifications = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  initializeProductEdit();
});

async function initializeProductEdit() {
  try {
    console.log('✏️ Product Edit: Starting initialization...');
    
    // Wait for AuthManager
    if (window.AuthManager) {
      await window.AuthManager.waitForInit();
      currentUser = window.AuthManager.getCurrentUser();
      
      if (!currentUser) {
        console.error('❌ Product Edit: User not authenticated');
        window.location.href = 'auth.html?mode=signin&redirect=' + encodeURIComponent('product-edit.html');
        return;
      }
      
      console.log('✅ Product Edit: User authenticated:', currentUser.name);
    }
    
    // Get product ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    
    if (!productId) {
      console.error('❌ Product Edit: No product ID provided');
      showToast('No product selected for editing', 'error');
      setTimeout(() => {
        window.location.href = 'product-management.html';
      }, 2000);
      return;
    }
    
    console.log('📦 Loading product:', productId);
    
    // Load product data
    await loadProductData(productId);
    
    // Setup form with product data
    populateForm();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Product Edit: Initialization complete');
    
  } catch (error) {
    console.error('❌ Product Edit: Initialization error:', error);
    showToast('Failed to initialize product edit', 'error');
  }
}

async function loadProductData(productId) {
  try {
    console.log('📥 Loading product data for:', productId);
    
    // TEMPORARY: Load from localStorage for testing
    const testProducts = JSON.parse(localStorage.getItem('testProducts') || '[]');
    currentProduct = testProducts.find(p => p.id === productId);
    
    if (!currentProduct) {
      throw new Error('Product not found');
    }
    
    console.log('✅ Product loaded:', currentProduct);
    
    /* ORIGINAL API CODE - COMMENTED OUT FOR TESTING
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/products/${productId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load product');
    }
    
    const result = await response.json();
    
    if (result.success) {
      currentProduct = result.data.product;
    } else {
      throw new Error(result.message || 'Failed to load product');
    }
    */
    
  } catch (error) {
    console.error('❌ Product Edit: Load product error:', error);
    showToast('Failed to load product data', 'error');
    throw error;
  }
}

function populateForm() {
  if (!currentProduct) return;
  
  console.log('📝 Populating form with product data');
  
  // Basic information
  document.getElementById('productName').value = currentProduct.name || '';
  document.getElementById('productCategory').value = currentProduct.category || '';
  document.getElementById('productCondition').value = currentProduct.condition || '';
  document.getElementById('productPrice').value = currentProduct.price || '';
  document.getElementById('productStock').value = currentProduct.stock || '';
  document.getElementById('productLocation').value = currentProduct.location || '';
  
  // Description
  document.getElementById('productDescription').value = currentProduct.description || '';
  updateCharacterCount({ target: document.getElementById('productDescription') });
  
  // Tags
  if (currentProduct.tags && currentProduct.tags.length > 0) {
    document.getElementById('productTags').value = currentProduct.tags.join(', ');
    updateTagPreview({ target: document.getElementById('productTags') });
  }
  
  // Images
  if (currentProduct.images && currentProduct.images.length > 0) {
    displayCurrentImages(currentProduct.images);
  }
  
  // Specifications
  if (currentProduct.specifications) {
    loadSpecifications(currentProduct.specifications);
  }
  
  // Shipping
  document.getElementById('shippingMethod').value = currentProduct.shippingMethod || 'standard';
  document.getElementById('shippingCost').value = currentProduct.shippingCost || '';
  document.getElementById('returnPolicy').value = currentProduct.returnPolicy || '';
  
  console.log('✅ Form populated successfully');
}

function displayCurrentImages(images) {
  const container = document.getElementById('currentImages');
  if (!container) return;
  
  container.innerHTML = images.map((image, index) => `
    <div class="current-image-item">
      <img src="${image.url}" alt="Product image ${index + 1}" class="current-image">
      <div class="image-info">
        <span class="image-label">${image.isMain ? 'Main Image' : `Image ${index + 1}`}</span>
        <button type="button" class="btn btn-secondary btn-small" onclick="removeCurrentImage(${index})">
          Remove
        </button>
      </div>
    </div>
  `).join('');
}

function loadSpecifications(specs) {
  const container = document.getElementById('specificationsContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  Object.entries(specs).forEach(([name, value]) => {
    addSpecificationRow(name, value);
  });
  
  // Add at least one empty row if no specifications
  if (Object.keys(specs).length === 0) {
    addSpecificationRow();
  }
}

function addSpecificationRow(name = '', value = '') {
  const container = document.getElementById('specificationsContainer');
  if (!container) return;
  
  const specRow = document.createElement('div');
  specRow.className = 'spec-row';
  specRow.innerHTML = `
    <input type="text" placeholder="Specification name" class="spec-name" value="${name}">
    <input type="text" placeholder="Value" class="spec-value" value="${value}">
    <button type="button" class="btn btn-secondary btn-small remove-spec" onclick="removeSpecification(this)">Remove</button>
  `;
  
  container.appendChild(specRow);
}

function setupEventListeners() {
  // Form submission
  const form = document.getElementById('productEditForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
        window.location.href = 'product-management.html';
      }
    });
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
    addSpecBtn.addEventListener('click', () => addSpecificationRow());
  }
  
  // Form validation on input
  const inputs = document.querySelectorAll('.form-input, .form-select, .form-textarea');
  inputs.forEach(input => {
    input.addEventListener('blur', validateField);
    input.addEventListener('input', clearFieldError);
  });
}

// Form Submission
async function handleFormSubmit(e) {
  e.preventDefault();
  
  console.log('✏️ Product Edit: Form submission started');
  
  // Validate form
  if (!validateForm()) {
    showToast('Please fix the errors in the form', 'error');
    return;
  }
  
  showLoading(true, 'Updating product...');
  
  try {
    const formData = collectFormData();
    const result = await updateProduct(formData);
    
    if (result.success) {
      showSuccessModal();
      console.log('✅ Product Edit: Product updated successfully');
    } else {
      throw new Error(result.message || 'Failed to update product');
    }
    
  } catch (error) {
    console.error('❌ Product Edit: Update error:', error);
    showToast(error.message || 'Failed to update product', 'error');
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
  
  return isValid;
}

function collectFormData() {
  const form = document.getElementById('productEditForm');
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
  
  return {
    id: currentProduct.id,
    name: formData.get('name'),
    description: formData.get('description'),
    price: parseFloat(formData.get('price')),
    category: formData.get('category'),
    stock: parseInt(formData.get('stock')),
    condition: formData.get('condition'),
    location: formData.get('location') || '',
    specifications: specs,
    tags: tags,
    images: currentProduct.images || [], // Keep existing images
    shippingMethod: formData.get('shippingMethod') || 'standard',
    shippingCost: parseFloat(formData.get('shippingCost')) || 0,
    returnPolicy: formData.get('returnPolicy') || '',
    sellerId: currentProduct.sellerId,
    sellerName: currentProduct.sellerName,
    // Keep existing metrics
    views: currentProduct.views || 0,
    favorites: currentProduct.favorites || 0,
    averageRating: currentProduct.averageRating || 0,
    totalReviews: currentProduct.totalReviews || 0,
    status: currentProduct.status || 'active',
    isActive: currentProduct.isActive !== undefined ? currentProduct.isActive : true,
    createdAt: currentProduct.createdAt,
    updatedAt: new Date().toISOString()
  };
}

async function updateProduct(productData) {
  try {
    console.log('🔄 Updating product:', productData.id);
    
    // TEMPORARY: Update localStorage for testing
    const testProducts = JSON.parse(localStorage.getItem('testProducts') || '[]');
    const productIndex = testProducts.findIndex(p => p.id === productData.id);
    
    if (productIndex !== -1) {
      testProducts[productIndex] = productData;
      localStorage.setItem('testProducts', JSON.stringify(testProducts));
      
      console.log('✅ Product updated in localStorage');
      
      return {
        success: true,
        message: 'Product updated successfully (TEST MODE)',
        data: {
          product: productData
        }
      };
    } else {
      throw new Error('Product not found');
    }
    
    /* ORIGINAL API CODE - COMMENTED OUT FOR TESTING
    const token = localStorage.getItem('authToken');
    const response = await fetch(`/api/products/${productData.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(productData)
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Failed to update product');
    }
    
    return result;
    */
    
  } catch (error) {
    console.error('❌ Update error:', error);
    throw error;
  }
}

// Utility Functions
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

function updateTagPreview(e) {
  const input = e.target;
  const tags = input.value.split(',').map(tag => tag.trim()).filter(tag => tag);
  const preview = document.getElementById('tagPreview');
  
  if (preview) {
    preview.innerHTML = tags.map(tag => `<span class="tag">${tag}</span>`).join('');
  }
}

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
window.removeCurrentImage = function(index) {
  if (confirm('Are you sure you want to remove this image?')) {
    currentProduct.images.splice(index, 1);
    displayCurrentImages(currentProduct.images);
  }
};

window.removeSpecification = function(button) {
  const container = document.getElementById('specificationsContainer');
  if (container.children.length > 1) {
    button.closest('.spec-row').remove();
  } else {
    showToast('At least one specification is required', 'warning');
  }
};

window.closeSuccessModal = closeSuccessModal;

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeProductEdit,
    loadProductData,
    populateForm,
    updateProduct
  };
}
