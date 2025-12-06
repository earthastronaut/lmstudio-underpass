import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load .env file
const envPath = join(projectRoot, '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`✓ Loaded .env file from: ${envPath}`);
} else {
  console.warn(`⚠️  .env file not found at: ${envPath}`);
}

const REMOTE_URL = process.env.REMOTE_URL || 'https://lmstudio.planplayrepeat.com';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('❌ Error: API_KEY not found in .env file');
  console.error('Make sure you have API_KEY set in your .env file');
  process.exit(1);
}

const url = `${REMOTE_URL}/v1/models`;

console.log(`Testing remote connection to: ${url}`);
console.log(`Using API key: ${API_KEY.substring(0, 10)}...${API_KEY.substring(API_KEY.length - 4)}`);
console.log(`API key length: ${API_KEY.length} characters`);
console.log('');

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    console.error(`❌ Error: HTTP ${response.status} ${response.statusText}`);
    console.error(JSON.stringify(errorData, null, 2));
    process.exit(1);
  }

  const data = await response.json();
  console.log('✅ Successfully connected to remote server!');
  console.log('');
  console.log('Response:');
  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
    console.error(`❌ Error: Cannot connect to server at ${url}`);
    console.error('Check that:');
    console.error('  1. The server is running and accessible');
    console.error('  2. The URL is correct');
    console.error('  3. There are no firewall/network issues');
  } else if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
    console.error(`❌ Error: Cannot resolve hostname ${new URL(url).hostname}`);
    console.error('Check that the domain name is correct and DNS is resolving');
  } else if (error.code === 'CERT_HAS_EXPIRED' || error.message.includes('certificate')) {
    console.error(`❌ Error: SSL certificate issue`);
    console.error('The server certificate may be expired or invalid');
  } else if (error.cause) {
    console.error('❌ Error:', error.message);
    console.error('Cause:', error.cause.message || error.cause);
  } else {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
  process.exit(1);
}
