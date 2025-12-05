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

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
  
  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

