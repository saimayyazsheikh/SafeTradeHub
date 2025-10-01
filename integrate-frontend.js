#!/usr/bin/env node

// Quick script to add API integration to your HTML files
const fs = require('fs');
const path = require('path');

const htmlFiles = [
  'index.html',
  'auth.html', 
  'dashboard.html',
  'marketplace.html',
  'seller-dashboard.html',
  'buyer-dashboard.html',
  'product.html',
  'orders.html',
  'escrow.html'
];

const integrationScript = `
<!-- SafeTradeHub Backend Integration -->
<script src="frontend-api-integration.js"></script>
<script>
// Initialize SafeTradeHub API when page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('SafeTradeHub API ready!');
  
  // Auto-connect real-time features if user is logged in
  if (SafeTradeAPI.isAuthenticated()) {
    SafeTradeSocket.connect();
    console.log('Real-time features connected');
  }
});
</script>`;

console.log('🔧 SafeTradeHub HTML Integration Tool');
console.log('====================================\\n');

htmlFiles.forEach(filename => {
  const filePath = path.join(__dirname, filename);
  
  if (fs.existsSync(filePath)) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Check if already integrated
      if (content.includes('frontend-api-integration.js')) {
        console.log(`⏭️  ${filename} - Already integrated`);
        return;
      }
      
      // Add integration before closing body tag
      if (content.includes('</body>')) {
        content = content.replace('</body>', `${integrationScript}\\n</body>`);
        fs.writeFileSync(filePath, content);
        console.log(`✅ ${filename} - Integration added`);
      } else {
        console.log(`⚠️  ${filename} - No </body> tag found, skipping`);
      }
    } catch (error) {
      console.log(`❌ ${filename} - Error: ${error.message}`);
    }
  } else {
    console.log(`📄 ${filename} - File not found, skipping`);
  }
});

console.log('\\n🎉 Integration complete!');
console.log('\\n📋 Next steps:');
console.log('1. Start your backend: npm run backend');
console.log('2. Test the APIs: npm run test-api');
console.log('3. Open your HTML files - they now connect to the backend!');
console.log('4. Check browser console for connection status');