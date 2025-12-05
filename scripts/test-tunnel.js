import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Check if .env file exists
const envPath = join(projectRoot, '.env');
if (!existsSync(envPath)) {
  console.error('❌ ERROR: .env file not found');
  console.error(`   Expected location: ${envPath}`);
  console.error('   Please create a .env file or run: cp .env.example .env');
  process.exit(1);
}

console.log('📋 Loading environment variables...');
console.log(`   .env file: ${envPath}\n`);

// Load .env file
dotenv.config({ path: envPath });

const EXTERNAL_DOMAIN = process.env.EXTERNAL_DOMAIN;
const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || '3000';
const LM_STUDIO_URL = process.env.LM_STUDIO_URL;

// Validate environment variables
console.log('🔍 Checking environment variables...');
if (!EXTERNAL_DOMAIN) {
  console.error('❌ ERROR: EXTERNAL_DOMAIN not set in .env file');
  console.error('   Please add EXTERNAL_DOMAIN=https://lmstudio.yourdomain.com to your .env file');
  process.exit(1);
} else {
  console.log(`   ✅ EXTERNAL_DOMAIN: ${EXTERNAL_DOMAIN}`);
}

if (!API_KEY) {
  console.error('❌ ERROR: API_KEY not set in .env file');
  console.error('   Please add API_KEY=sk-... to your .env file');
  console.error('   Or run: npm run generate-key:save');
  process.exit(1);
} else {
  console.log(`   ✅ API_KEY: ${API_KEY.substring(0, 10)}... (${API_KEY.length} chars)`);
  if (!API_KEY.startsWith('sk-')) {
    console.warn('   ⚠️  WARNING: API_KEY should start with "sk-"');
  }
}

if (PORT) {
  console.log(`   ✅ PORT: ${PORT}`);
}

if (LM_STUDIO_URL) {
  console.log(`   ✅ LM_STUDIO_URL: ${LM_STUDIO_URL}`);
} else {
  console.warn('   ⚠️  LM_STUDIO_URL not set (using default)');
}

// Remove trailing slash if present
const baseUrl = EXTERNAL_DOMAIN.replace(/\/$/, '');

// Validate URL format
if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
  console.error('❌ ERROR: EXTERNAL_DOMAIN must start with http:// or https://');
  console.error(`   Current value: ${baseUrl}`);
  process.exit(1);
}

console.log('\n🧪 Starting tunnel connection tests...\n');
console.log(`📍 Testing URL: ${baseUrl}`);
console.log(`🔑 Using API Key: ${API_KEY.substring(0, 15)}...\n`);

// Test health endpoint
async function testHealth() {
  console.log('1️⃣  Testing health endpoint...');
  const healthUrl = `${baseUrl}/health`;
  console.log(`   🔗 URL: ${healthUrl}`);
  console.log(`   📤 Method: GET`);
  console.log(`   ⏱️  Sending request...`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'lmstudio-underpass-test'
      }
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`   ⏱️  Response time: ${responseTime}ms`);
    console.log(`   📊 Status: ${response.status} ${response.statusText}`);
    
    // Log IP-related headers
    const headers = Object.fromEntries(response.headers.entries());
    console.log(`   📋 Headers:`, headers);
    console.log(`   🌐 IP-related headers:`);
    if (headers['cf-connecting-ip'] || headers['CF-Connecting-IP']) {
      console.log(`      - CF-Connecting-IP: ${headers['cf-connecting-ip'] || headers['CF-Connecting-IP']}`);
    }
    if (headers['x-forwarded-for']) {
      console.log(`      - X-Forwarded-For: ${headers['x-forwarded-for']}`);
    }
    if (headers['x-real-ip']) {
      console.log(`      - X-Real-IP: ${headers['x-real-ip']}`);
    }
    if (headers['cf-ray']) {
      console.log(`      - CF-Ray: ${headers['cf-ray']} (Cloudflare request ID)`);
    }
    
    // Handle Cloudflare-specific errors
    if (response.status === 522) {
      console.log('   ❌ Health check failed - Cloudflare 522 error (Connection timed out)');
      console.log(`   💡 Troubleshooting:`);
      console.log(`      - The tunnel cannot reach your local server`);
      console.log(`      - Verify local server is running: npm start`);
      console.log(`      - Check if server is listening on port ${PORT || '3000'}`);
      console.log(`      - Test locally: curl http://localhost:${PORT || '3000'}/health`);
      console.log(`      - Verify tunnel config points to correct port: http://localhost:${PORT || '3000'}`);
      console.log(`      - Check if firewall is blocking connections`);
      console.log(`      - Ensure cloudflared tunnel is running: cloudflared tunnel run lmstudio-tunnel`);
      
      // Try to read error page for more info
      try {
        const errorText = await response.text();
        if (errorText.includes('522')) {
          console.log(`   📄 Cloudflare error page detected`);
        }
      } catch (e) {
        // Ignore if we can't read the body
      }
      return false;
    }
    
    // Read response body once
    const contentType = response.headers.get('content-type') || '';
    let responseText = '';
    let data = null;
    
    try {
      responseText = await response.text();
      
      // Try to parse as JSON if content-type suggests it
      if (contentType.includes('application/json') || responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          // Not valid JSON, keep as text
        }
      }
    } catch (readError) {
      console.log(`   ⚠️  Could not read response body: ${readError.message}`);
    }
    
    if (response.ok && data && data.status === 'ok') {
      console.log('   ✅ Health check passed');
      console.log(`   📊 Response data:`, JSON.stringify(data, null, 2));
      if (data.lmStudioUrl) {
        console.log(`   🔗 LM Studio URL: ${data.lmStudioUrl}`);
      }
      return true;
    } else {
      console.log('   ❌ Health check failed - unexpected response');
      if (data) {
        console.log(`   📊 Response data:`, JSON.stringify(data, null, 2));
      } else if (responseText) {
        console.log(`   📄 Response (first 500 chars): ${responseText.substring(0, 500)}`);
      }
      
      // Additional troubleshooting for non-522 errors
      if (response.status >= 500) {
        console.log(`   💡 Server error (${response.status}):`);
        console.log(`      - Check server logs for errors`);
        console.log(`      - Verify server is running and healthy`);
      } else if (response.status === 404) {
        console.log(`   💡 404 Not Found:`);
        console.log(`      - Verify the /health endpoint exists`);
        console.log(`      - Check server routing configuration`);
      }
      
      return false;
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`   ⏱️  Request failed after: ${responseTime}ms`);
    console.log(`   ❌ Health check failed`);
    console.log(`   🔴 Error type: ${error.constructor.name}`);
    console.log(`   🔴 Error message: ${error.message}`);
    
    // Provide specific troubleshooting based on error type
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log(`   💡 Troubleshooting:`);
      console.log(`      - Check if the domain ${baseUrl} is correct`);
      console.log(`      - Verify DNS is pointing to Cloudflare`);
      console.log(`      - Ensure cloudflared tunnel is running: cloudflared tunnel run lmstudio-tunnel`);
      console.log(`      - Check if local server is running: npm start`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`   💡 Troubleshooting:`);
      console.log(`      - Request timed out - check network connectivity`);
      console.log(`      - Verify tunnel is active in Cloudflare dashboard`);
    } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
      console.log(`   💡 Troubleshooting:`);
      console.log(`      - SSL certificate issue detected`);
      console.log(`      - Verify domain is properly configured in Cloudflare`);
    }
    
    return false;
  }
}

// Test API endpoint with authentication
async function testApiEndpoint() {
  console.log('\n2️⃣  Testing API endpoint with authentication...');
  const apiUrl = `${baseUrl}/v1/models`;
  console.log(`   🔗 URL: ${apiUrl}`);
  console.log(`   📤 Method: GET`);
  console.log(`   🔑 Authorization: Bearer ${API_KEY.substring(0, 15)}...`);
  console.log(`   ⏱️  Sending request...`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'lmstudio-underpass-test'
      }
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`   ⏱️  Response time: ${responseTime}ms`);
    console.log(`   📊 Status: ${response.status} ${response.statusText}`);
    
    // Log IP-related headers
    const headers = Object.fromEntries(response.headers.entries());
    console.log(`   📋 Headers:`, headers);
    console.log(`   🌐 IP-related headers:`);
    if (headers['cf-connecting-ip'] || headers['CF-Connecting-IP']) {
      console.log(`      - CF-Connecting-IP: ${headers['cf-connecting-ip'] || headers['CF-Connecting-IP']}`);
    }
    if (headers['x-forwarded-for']) {
      console.log(`      - X-Forwarded-For: ${headers['x-forwarded-for']}`);
    }
    if (headers['x-real-ip']) {
      console.log(`      - X-Real-IP: ${headers['x-real-ip']}`);
    }
    if (headers['cf-ray']) {
      console.log(`      - CF-Ray: ${headers['cf-ray']} (Cloudflare request ID)`);
    }
    
    // Handle Cloudflare-specific errors
    if (response.status === 522) {
      console.log('   ❌ API endpoint failed - Cloudflare 522 error (Connection timed out)');
      console.log(`   💡 Troubleshooting:`);
      console.log(`      - The tunnel cannot reach your local server`);
      console.log(`      - Verify local server is running: npm start`);
      console.log(`      - Check if server is listening on port ${PORT || '3000'}`);
      console.log(`      - Test locally: curl http://localhost:${PORT || '3000'}/v1/models`);
      console.log(`      - Verify tunnel config points to correct port: http://localhost:${PORT || '3000'}`);
      console.log(`      - Check if firewall is blocking connections`);
      console.log(`      - Ensure cloudflared tunnel is running: cloudflared tunnel run lmstudio-tunnel`);
      console.log(`      - Verify LM Studio is running and accessible`);
      
      // Try to read error page for more info
      try {
        const errorText = await response.text();
        if (errorText.includes('522')) {
          console.log(`   📄 Cloudflare error page detected`);
        }
      } catch (e) {
        // Ignore if we can't read the body
      }
      return false;
    }
    
    // Read response body once
    const contentType = response.headers.get('content-type') || '';
    let responseText = '';
    let responseData = null;
    
    try {
      responseText = await response.text();
      
      // Try to parse as JSON if content-type suggests it or looks like JSON
      if (contentType.includes('application/json') || responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          // Not valid JSON, keep as text
        }
      }
    } catch (readError) {
      console.log(`   ⚠️  Could not read response body: ${readError.message}`);
    }
    
    if (response.ok) {
      console.log('   ✅ API endpoint accessible');
      if (responseData) {
        console.log(`   📦 Response type: ${Array.isArray(responseData) ? 'Array' : typeof responseData}`);
        if (Array.isArray(responseData)) {
          console.log(`   📦 Array length: ${responseData.length}`);
          if (responseData.length > 0) {
            console.log(`   📦 First item keys: ${Object.keys(responseData[0]).join(', ')}`);
          }
        } else if (typeof responseData === 'object' && responseData !== null) {
          console.log(`   📦 Object keys: ${Object.keys(responseData).join(', ')}`);
        }
      } else if (responseText) {
        console.log(`   📦 Response (first 200 chars): ${responseText.substring(0, 200)}`);
      }
      return true;
    } else {
      console.log('   ❌ API endpoint failed');
      
      // Provide specific troubleshooting based on status code
      if (response.status === 401) {
        console.log(`   🔴 401 Unauthorized - Authentication failed`);
        console.log(`   💡 Troubleshooting:`);
        console.log(`      - Verify API_KEY in .env matches the key you're using`);
        console.log(`      - Check that API_KEY starts with "sk-"`);
        console.log(`      - Ensure Authorization header format is correct: "Bearer sk-..."`);
        if (responseData && responseData.error) {
          console.log(`      - Server error: ${responseData.error}`);
        }
      } else if (response.status === 403) {
        console.log(`   🔴 403 Forbidden - Access denied`);
        console.log(`   💡 Troubleshooting:`);
        console.log(`      - Check ALLOWED_IPS in .env (may be blocking your IP)`);
        console.log(`      - For development, set ALLOWED_IPS to empty or include your IP`);
        if (responseData && responseData.error) {
          console.log(`      - Server error: ${responseData.error}`);
        }
      } else if (response.status === 502) {
        console.log(`   🔴 502 Bad Gateway - Cannot reach LM Studio`);
        console.log(`   💡 Troubleshooting:`);
        console.log(`      - Verify LM Studio is running`);
        console.log(`      - Check LM_STUDIO_URL in .env: ${LM_STUDIO_URL || 'not set'}`);
        console.log(`      - Test LM Studio directly: curl ${LM_STUDIO_URL || 'http://localhost:5595'}/v1/models`);
        if (responseData && responseData.message) {
          console.log(`      - Server message: ${responseData.message}`);
        }
      } else if (response.status === 404) {
        console.log(`   🔴 404 Not Found - Endpoint not found`);
        console.log(`   💡 Troubleshooting:`);
        console.log(`      - Verify the endpoint path is correct: /v1/models`);
        console.log(`      - Check if LM Studio is running and accessible`);
      }
      
      if (responseData) {
        console.log(`   📄 Error response:`, JSON.stringify(responseData, null, 2));
      } else if (responseText) {
        console.log(`   📄 Error response (first 500 chars): ${responseText.substring(0, 500)}`);
      }
      
      return false;
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`   ⏱️  Request failed after: ${responseTime}ms`);
    console.log(`   ❌ API endpoint failed`);
    console.log(`   🔴 Error type: ${error.constructor.name}`);
    console.log(`   🔴 Error message: ${error.message}`);
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log(`   💡 Troubleshooting:`);
      console.log(`      - Network connectivity issue`);
      console.log(`      - Verify tunnel is running and domain is correct`);
    }
    
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  const healthPassed = await testHealth();
  const apiPassed = await testApiEndpoint();
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 Final Results');
  console.log('='.repeat(60));
  console.log(`   Health Check: ${healthPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   API Endpoint: ${apiPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('='.repeat(60));
  
  if (healthPassed && apiPassed) {
    console.log('\n✅ All tests passed! Tunnel is working correctly.');
    console.log(`\n🎉 Your tunnel is accessible at: ${baseUrl}`);
    console.log(`   You can now use this URL with your API key: ${API_KEY.substring(0, 15)}...`);
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Quick checklist:');
    console.log('\n📝 Step-by-step verification:');
    
    if (!healthPassed) {
      console.log('\n   🔴 Health check failed:');
      console.log('   1. Check if local server is running:');
      console.log('      → Run: npm start');
      console.log('      → Test locally: curl http://localhost:' + PORT + '/health');
      console.log('   2. Check if Cloudflare tunnel is running:');
      console.log('      → Run: cloudflared tunnel run lmstudio-tunnel');
      console.log('      → Check status: cloudflared tunnel info lmstudio-tunnel');
      console.log('   3. Verify tunnel configuration:');
      console.log('      → Check: ~/.cloudflared/config.yml');
      console.log('      → Ensure service points to: http://localhost:' + PORT);
      console.log('   4. Check Cloudflare dashboard:');
      console.log('      → Zero Trust → Networks → Tunnels');
      console.log('      → Tunnel should show as "Healthy"');
    }
    
    if (!apiPassed) {
      console.log('\n   🔴 API endpoint failed:');
      console.log('   1. Verify API key:');
      console.log('      → Check .env file for API_KEY');
      console.log('      → Ensure it starts with "sk-"');
      console.log('      → Regenerate if needed: npm run generate-key:save');
      console.log('   2. Check LM Studio:');
      console.log('      → Verify LM Studio is running');
      console.log('      → Test directly: curl ' + (LM_STUDIO_URL || 'http://localhost:5595') + '/v1/models');
      console.log('      → Check LM_STUDIO_URL in .env: ' + (LM_STUDIO_URL || 'not set'));
      console.log('   3. Check IP restrictions:');
      console.log('      → Review ALLOWED_IPS in .env');
      console.log('      → For testing, temporarily set ALLOWED_IPS to empty');
    }
    
    console.log('\n💡 For more help, check the Troubleshooting section in README.md');
    process.exit(1);
  }
}

runTests();

