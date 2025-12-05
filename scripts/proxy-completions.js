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

// Get prompt from command line arguments
const prompt = process.argv.slice(2).join(' ');

if (!prompt) {
  console.error('Error: Please provide a prompt text');
  console.error('Usage: npm run proxy:completions "<prompt text>"');
  process.exit(1);
}

const url = `http://localhost:${PORT}/v1/chat/completions`;

const requestBody = {
  model: 'local-model', // LM Studio will use the default model
  messages: [
    {
      role: 'user',
      content: prompt
    }
  ]
};

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
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

