// ========================================
// UPDATE-CATEGORIES.JS - Script to update all category pages
// ========================================

const fs = require('fs');
const path = require('path');

const categoryPages = [
  'category-camera.html',
  'category-computers.html', 
  'category-fashion.html',
  'category-beauty.html',
  'category-pets.html',
  'category-books.html',
  'category-furniture.html',
  'category-gym.html',
  'category-home.html',
  'category-services.html',
  'category-sports.html'
];

function updateCategoryPage(filename) {
  try {
    const filePath = path.join(__dirname, filename);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Extract category name from filename
    const categoryName = filename.replace('category-', '').replace('.html', '');
    
    // Add CSS link after style.css
    content = content.replace(
      /<link rel="stylesheet" href="style\.css" \/>/,
      `<link rel="stylesheet" href="style.css" />
  <link rel="stylesheet" href="css/category-template.css" />`
    );
    
    // Find and extract the script content
    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      
      // Create specific JS file for this category
      const jsContent = `// ========================================
// CATEGORY-${categoryName.toUpperCase()}.JS - JavaScript for ${filename}
// ========================================

${scriptContent}`;
      
      fs.writeFileSync(`js/category-${categoryName}.js`, jsContent);
      
      // Replace script with external reference
      content = content.replace(
        /<script>[\s\S]*?<\/script>/,
        `  <!-- External JavaScript Files -->
  <script src="js/category-${categoryName}.js"></script>`
      );
    }
    
    // Remove any style tags
    content = content.replace(/<style>[\s\S]*?<\/style>/g, '');
    
    // Write updated content
    fs.writeFileSync(filePath, content);
    
    console.log(`✅ Updated ${filename}`);
  } catch (error) {
    console.error(`❌ Error updating ${filename}:`, error.message);
  }
}

// Update all category pages
console.log('🚀 Starting category page updates...\n');

categoryPages.forEach(updateCategoryPage);

console.log('\n✨ All category pages updated successfully!');
