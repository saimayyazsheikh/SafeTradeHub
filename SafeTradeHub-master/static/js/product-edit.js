// ========================================
// PRODUCT-EDIT.JS - JavaScript for product edit functionality
// ========================================

// Global variables
let currentProduct = null;
let currentUser = null;
let uploadedImages = [];
let specifications = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
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

    const snapshot = await firebase.database().ref('products/' + productId).once('value');
    currentProduct = snapshot.val();

    if (!currentProduct) {
      throw new Error('Product not found');
    }

    // Ensure ID is set
    currentProduct.id = productId;

    console.log('✅ Product loaded:', currentProduct);

  } catch (error) {
    console.error('❌ Product Edit: Load product error:', error);
    showToast('Failed to load product data', 'error');
    throw error;
  }
}

async function updateProduct(productData) {
  try {
    console.log('🔄 Updating product:', productData.id);

    await firebase.database().ref('products/' + productData.id).update(productData);

    return {
      success: true,
      message: 'Product updated successfully',
      data: {
        product: productData
      }
    };

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
window.removeCurrentImage = function (index) {
  if (confirm('Are you sure you want to remove this image?')) {
    currentProduct.images.splice(index, 1);
    displayCurrentImages(currentProduct.images);
  }
};

window.removeSpecification = function (button) {
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
