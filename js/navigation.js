// ========================================
// NAVIGATION.JS - Category navigation for index.html
// ========================================

// Category tile navigation without changing markup
(function(){
  const mapping = {
    'Mobile': 'category-mobile.html',
    'Camera': 'category-camera.html',
    'Service': 'category-services.html',
    'Chair': 'category-furniture.html',
    'Dress': 'category-fashion.html',
    'Makeup': 'category-beauty.html',
    'Book': 'category-books.html',
    'Bat': 'category-sports.html',
    'Dumbbell': 'category-gym.html',
    'Pet Care': 'category-pets.html',
    'Laptop': 'category-computers.html',
    'Appliance': 'category-home.html'
  };
  document.querySelectorAll('.categories .cat').forEach(cat=>{
    cat.style.cursor = 'pointer';
    cat.addEventListener('click', ()=>{
      const title = (cat.querySelector('.cat-title')||{}).textContent || '';
      const url = mapping[title && title.trim()];
      if (url) window.location.href = url;
    });
  });
})();
