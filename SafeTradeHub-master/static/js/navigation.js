// ========================================
// NAVIGATION.JS - Enhanced navigation for SafeTradeHub
// ========================================

// Category tile navigation with analytics and user experience improvements
(function () {
  const categoryMapping = {
    'Mobile': { url: 'category-mobile.html', searchTerm: 'mobile phone smartphone' },
    'Camera': { url: 'category-camera.html', searchTerm: 'camera photography dslr' },
    'Service': { url: 'category-services.html', searchTerm: 'service professional' },
    'Chair': { url: 'category-furniture.html', searchTerm: 'chair furniture office' },
    'Dress': { url: 'category-fashion.html', searchTerm: 'dress fashion clothing' },
    'Makeup': { url: 'category-beauty.html', searchTerm: 'makeup beauty cosmetics' },
    'Book': { url: 'category-books.html', searchTerm: 'book education learning' },
    'Bat': { url: 'category-sports.html', searchTerm: 'bat sports equipment' },
    'Dumbbell': { url: 'category-gym.html', searchTerm: 'dumbbell fitness gym workout' },
    'Pet Care': { url: 'category-pets.html', searchTerm: 'pet care animal' },
    'Laptop': { url: 'category-computers.html', searchTerm: 'laptop computer tech' },
    'Appliance': { url: 'category-home.html', searchTerm: 'appliance home kitchen' }
  };

  // Enhanced category navigation
  function initializeCategoryNavigation() {
    document.querySelectorAll('.categories .cat').forEach(cat => {
      cat.style.cursor = 'pointer';
      cat.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';

      // Add hover effects
      cat.addEventListener('mouseenter', function () {
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
      });

      cat.addEventListener('mouseleave', function () {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = '';
      });

      cat.addEventListener('click', function () {
        const title = (this.querySelector('.cat-title') || {}).textContent || '';
        const category = categoryMapping[title.trim()];

        if (category) {
          // Track category click
          trackCategoryClick(title);

          // Show loading state
          showCategoryLoading(this);

          // Navigate to category or search
          if (category.url && isPageAvailable(category.url)) {
            window.location.href = category.url;
          } else {
            // Fallback if category page doesn't exist
            if (window.SafeTradeHub) {
              window.SafeTradeHub.showNotification('Category page coming soon!', 'info');
            }
          }
        }
      });
    });
  }

  // Track category clicks for analytics
  function trackCategoryClick(categoryName) {
    try {
      const analytics = JSON.parse(localStorage.getItem('categoryAnalytics') || '{}');
      analytics[categoryName] = (analytics[categoryName] || 0) + 1;
      analytics.lastClicked = new Date().toISOString();
      localStorage.setItem('categoryAnalytics', JSON.stringify(analytics));

      if (window.SafeTradeHub) {
        window.SafeTradeHub.showNotification(`Browsing ${categoryName} category...`, 'info');
      }
    } catch (error) {
      console.error('Error tracking category click:', error);
    }
  }

  // Show loading state for category
  function showCategoryLoading(categoryElement) {
    const originalContent = categoryElement.innerHTML;
    categoryElement.style.opacity = '0.7';

    // Restore after a short delay if navigation fails
    setTimeout(() => {
      categoryElement.style.opacity = '1';
    }, 2000);
  }

  // Check if a page is available (simple check)
  function isPageAvailable(url) {
    // For now, assume all category pages exist
    // In a real implementation, you could make an AJAX request to check
    return true;
  }

  // Enhanced product card interactions on homepage
  function initializeProductCards() {
    document.querySelectorAll('[data-add-to-cart]').forEach(button => {
      button.addEventListener('click', function (e) {
        e.preventDefault();

        // Check if user is authenticated
        if (!isUserLoggedIn()) {
          showLoginPrompt();
          return;
        }

        const productData = {
          id: this.dataset.id,
          title: this.dataset.name,
          price: parseFloat(this.dataset.price),
          img: this.dataset.img,
          desc: this.dataset.desc || `${this.dataset.name} - Premium quality product`
        };

        // Add visual feedback
        this.style.transform = 'scale(0.95)';
        this.style.opacity = '0.7';

        setTimeout(() => {
          this.style.transform = 'scale(1)';
          this.style.opacity = '1';
        }, 150);

        // Use central state management
        if (window.SafeTradeHub) {
          window.SafeTradeHub.cart.add(productData);
        } else {
          // Fallback for legacy compatibility
          console.warn('SafeTradeHub not available, using fallback');
          addToCart(productData.id, productData.title, productData.price, productData.img, productData.desc);
        }
      });
    });
  }

  // Authentication helper functions - Use global AuthManager
  function isUserLoggedIn() {
    // Use global AuthManager if available
    if (window.AuthManager && window.AuthManager.isInitialized) {
      return window.AuthManager.isAuthenticated();
    }

    // Fallback to localStorage check
    const authToken = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');

    return !!(authToken && userData);
  }

  function showLoginPrompt() {
    const shouldRedirect = confirm('Please sign in to add items to your cart. Would you like to go to the login page?');
    if (shouldRedirect) {
      window.location.href = 'auth.html?mode=signin';
    }
  }

  // Initialize everything when DOM is ready
  function initialize() {
    initializeCategoryNavigation();
    initializeProductCards();

    // Add page-specific enhancements
    if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
      initializeHomepageFeatures();
    }
  }

  // Homepage-specific features
  function initializeHomepageFeatures() {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });

    // Intersection Observer for animations
    if ('IntersectionObserver' in window) {
      const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }
        });
      }, observerOptions);

      // Observe categories and product cards
      document.querySelectorAll('.cat, .card').forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(element);
      });
    }
  }

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Export for global access
  window.SafeTradeNavigation = {
    trackCategoryClick,
    initializeCategoryNavigation,
    initializeProductCards
  };
})();
