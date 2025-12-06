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
}

const PORT = process.env.PORT || '3000';
const API_KEY = process.env.API_KEY || 'sk-1234567890abcdef1234567890abcdef1234567890abcdef';

const url = `http://localhost:${PORT}/v1/models`;

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
    console.error(`Error: HTTP ${response.status} ${response.statusText}`);
    console.error(JSON.stringify(errorData, null, 2));
    process.exit(1);
  }

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
    console.error(`Error: Cannot connect to server at ${url}`);
    console.error('Make sure the server is running:');
    console.error('  pnpm run start:server');
    console.error('  or');
    console.error('  pnpm start');
  } else if (error.cause) {
    console.error('Error:', error.message);
    console.error('Cause:', error.cause.message || error.cause);
  } else {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
  process.exit(1);
}

