#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 SafeTradeHub Backend Setup Script');
console.log('=====================================\n');

// Check if .env exists
if (!fs.existsSync('.env')) {
  console.log('📄 Creating .env file from template...');
  if (fs.existsSync('.env.example')) {
    fs.copyFileSync('.env.example', '.env');
    console.log('✅ .env file created successfully!');
    console.log('⚠️  Please edit .env with your actual credentials\n');
  } else {
    console.log('❌ .env.example not found. Please create .env manually.\n');
  }
} else {
  console.log('✅ .env file already exists\n');
}

// Check if logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  console.log('📁 Creating logs directory...');
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('✅ Logs directory created\n');
}

// Check Node.js version
console.log('🔍 Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion >= 16) {
  console.log(`✅ Node.js ${nodeVersion} is compatible\n`);
} else {
  console.log(`❌ Node.js ${nodeVersion} is too old. Please upgrade to v16 or higher\n`);
}

// Display next steps
console.log('📋 Next Steps:');
console.log('1. Edit .env file with your credentials');
console.log('2. Run: npm install');
console.log('3. Run: pip install -r requirements.txt');
console.log('4. Start backend: npm run backend');
console.log('5. Start chatbot: python app.py');
console.log('\n🎉 Happy coding!');