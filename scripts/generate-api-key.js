import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Generate a secure random API key
function generateApiKey() {
  // Generate 32 random bytes and convert to hex (64 characters)
  const randomBytes = crypto.randomBytes(32);
  const hexString = randomBytes.toString('hex');
  
  // Return as OpenAPI format (sk- prefix + hex string)
  return `sk-${hexString}`;
}

// Read .env file if it exists
function readEnvFile() {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) {
    return null;
  }
  return readFileSync(envPath, 'utf-8');
}

// Update or create .env file with new API key
function updateEnvFile(newKey) {
  const envPath = join(projectRoot, '.env');
  const envExamplePath = join(projectRoot, '.env.example');
  
  let envContent;
  
  if (existsSync(envPath)) {
    // Read existing .env file
    envContent = readFileSync(envPath, 'utf-8');
    
    // Replace existing API_KEY if present, otherwise add it
    if (envContent.includes('API_KEY=')) {
      envContent = envContent.replace(/API_KEY=.*/g, `API_KEY=${newKey}`);
    } else {
      envContent += `\nAPI_KEY=${newKey}\n`;
    }
  } else {
    // Create new .env from .env.example if it exists
    if (existsSync(envExamplePath)) {
      envContent = readFileSync(envExamplePath, 'utf-8');
      envContent = envContent.replace(/API_KEY=.*/g, `API_KEY=${newKey}`);
    } else {
      // Create minimal .env file
      envContent = `API_KEY=${newKey}\n`;
    }
  }
  
  writeFileSync(envPath, envContent, 'utf-8');
  console.log(`✅ API key saved to .env file`);
}

// Main execution
const newApiKey = generateApiKey();

console.log('\n🔑 Generated new API key:');
console.log(newApiKey);
console.log('\n');

// Ask if user wants to update .env file
const args = process.argv.slice(2);
if (args.includes('--save') || args.includes('-s')) {
  updateEnvFile(newApiKey);
} else {
  console.log('💡 Tip: Add --save or -s flag to automatically update your .env file');
  console.log('   Example: npm run generate-key -- --save\n');
}

