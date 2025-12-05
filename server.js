import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
// Disable X-Powered-By header to make proxy transparent
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://192.168.50.193:5595';
const API_KEY = process.env.API_KEY || 'sk-1234567890abcdef1234567890abcdef';
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];

// Middleware
// Note: CORS removed to make proxy transparent - LM Studio will handle CORS if needed
// Note: Do NOT use express.json() as it consumes the request body stream
// The proxy needs the raw body stream to forward to LM Studio
// http-proxy-middleware will handle the body stream automatically

// Request logging middleware - log requester IP for all requests
app.use((req, res, next) => {
  // Get client IP from various sources (Cloudflare first, then others)
  const cfConnectingIp = req.headers['cf-connecting-ip'] || req.headers['CF-Connecting-IP'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  const xRealIp = req.headers['x-real-ip'];
  const requesterIp = cfConnectingIp ||
                     req.ip || 
                     (xForwardedFor ? xForwardedFor.split(',')[0].trim() : null) ||
                     xRealIp ||
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress ||
                     'unknown';

  console.log(`[Request] ${req.method} ${req.path} from IP: ${requesterIp}`);
  next();
});

// IP Restriction Middleware
const ipRestriction = (req, res, next) => {
  if (ALLOWED_IPS.length === 0) {
    // If no IPs are configured, allow all (for development)
    return next();
  }

  // Cloudflare provides the real client IP in CF-Connecting-IP header
  // Check this first for requests coming through Cloudflare Tunnel
  const cfConnectingIp = req.headers['cf-connecting-ip'] || req.headers['CF-Connecting-IP'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  const xRealIp = req.headers['x-real-ip'];
  const clientIp = cfConnectingIp ||
                   req.ip || 
                   (xForwardedFor ? xForwardedFor.split(',')[0].trim() : null) ||
                   xRealIp ||
                   req.connection?.remoteAddress ||
                   req.socket?.remoteAddress;

  // Log IP detection details
  console.log(`[IP Detection] ${req.method} ${req.path}`);
  console.log(`  - CF-Connecting-IP: ${cfConnectingIp || '(not present)'}`);
  console.log(`  - X-Forwarded-For: ${xForwardedFor || '(not present)'}`);
  console.log(`  - X-Real-IP: ${xRealIp || '(not present)'}`);
  console.log(`  - req.ip: ${req.ip || '(not set)'}`);
  console.log(`  - req.connection.remoteAddress: ${req.connection?.remoteAddress || '(not set)'}`);
  console.log(`  - req.socket.remoteAddress: ${req.socket?.remoteAddress || '(not set)'}`);
  console.log(`  - Detected Client IP: ${clientIp || '(unable to determine)'}`);

  if (!clientIp) {
    console.log(`  ❌ Blocked: Unable to determine client IP`);
    return res.status(403).json({ error: 'Unable to determine client IP' });
  }

  // If request is from localhost (via cloudflared tunnel), allow it
  // Cloudflared tunnel forwards requests from localhost, so we can't get the real client IP
  // In this case, we rely on API key authentication for security
  const isLocalhost = clientIp === '127.0.0.1' || 
                      clientIp === '::1' || 
                      clientIp === '::ffff:127.0.0.1' ||
                      clientIp.startsWith('127.') ||
                      clientIp === 'localhost';
  
  if (isLocalhost) {
    console.log(`  ✅ Allowed: Request from localhost (via cloudflared tunnel) - relying on API key auth`);
    return next();
  }

  // Check if IP is in allowed list
  const isAllowed = ALLOWED_IPS.some(allowedIp => {
    // Support CIDR notation (e.g., 192.168.1.0/24)
    if (allowedIp.includes('/')) {
      const [network, prefixLength] = allowedIp.split('/');
      const mask = ~(2 ** (32 - parseInt(prefixLength)) - 1);
      const networkNum = ipToNumber(network) & mask;
      const clientNum = ipToNumber(clientIp) & mask;
      return networkNum === clientNum;
    }
    return clientIp === allowedIp || clientIp.startsWith(allowedIp);
  });

  if (!isAllowed) {
    console.log(`  ❌ Blocked: IP ${clientIp} is not in ALLOWED_IPS list`);
    console.log(`  📋 ALLOWED_IPS: ${ALLOWED_IPS.join(', ')}`);
    return res.status(403).json({ error: 'IP address not allowed' });
  }

  console.log(`  ✅ Allowed: IP ${clientIp} is in ALLOWED_IPS list`);

  next();
};

// Helper function to convert IP to number
function ipToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

// Helper function to get Cloudflare error descriptions
function getCloudflareErrorDescription(statusCode) {
  const descriptions = {
    520: 'Web Server Returned an Unknown Error',
    521: 'Web Server Is Down',
    522: 'Connection Timed Out',
    523: 'Origin Is Unreachable',
    524: 'A Timeout Occurred',
    525: 'SSL Handshake Failed',
    526: 'Invalid SSL Certificate',
    527: 'Railgun Error',
    530: 'Origin DNS Error'
  };
  return descriptions[statusCode] || 'Unknown Cloudflare Error';
}

// OpenAPI Key Validation Middleware
const validateApiKey = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ 
      error: 'Missing authorization header',
      message: 'Please provide an API key in the Authorization header'
    });
  }

  // Support both "Bearer <key>" and "sk-<key>" formats
  let providedKey = authHeader;
  if (authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.substring(7);
  }

  // Validate OpenAPI key format (starts with "sk-")
  if (!providedKey.startsWith('sk-')) {
    return res.status(401).json({ 
      error: 'Invalid API key format',
      message: 'API key must start with "sk-"'
    });
  }

  // Validate key length (OpenAPI keys are typically 32+ characters after "sk-")
  if (providedKey.length < 10) {
    return res.status(401).json({ 
      error: 'Invalid API key format',
      message: 'API key is too short'
    });
  }

  // Check if key matches configured key
  if (providedKey !== API_KEY) {
    console.log(`Invalid API key attempt: ${providedKey.substring(0, 10)}...`);
    return res.status(401).json({ 
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }

  // Key is valid, proceed
  next();
};

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    lmStudioUrl: LM_STUDIO_URL 
  });
});

// Apply middleware to all routes except health check
// Note: IP restriction disabled - relying on API key authentication for security
// Cloudflare tunnel doesn't preserve original client IPs, making IP restriction unreliable
// app.use(ipRestriction);
app.use(validateApiKey);

// Proxy configuration - configured to be transparent
const proxyOptions = {
  target: LM_STUDIO_URL,
  changeOrigin: true,
  selfHandleResponse: true, // Take full control of response handling
  timeout: 100000, // 100 second timeout (Cloudflare default is 100s, so match it)
  proxyTimeout: 100000, // Timeout for proxy requests
  pathRewrite: {
    '^/v1': '/v1', // Keep /v1 prefix if needed
  },
  // Remove proxy-identifying headers to make proxy transparent
  headers: {
    // Don't add any identifying headers
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying ${req.method} ${req.path} to ${LM_STUDIO_URL}`);
    console.log(`  Request body length: ${req.headers['content-length'] || 'unknown'}`);
    console.log(`  Content-Type: ${req.headers['content-type'] || 'unknown'}`);
    
    // Remove proxy-identifying headers from the request
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-forwarded-proto');
    proxyReq.removeHeader('x-forwarded-host');
    proxyReq.removeHeader('x-real-ip');
    proxyReq.removeHeader('cf-connecting-ip');
    proxyReq.removeHeader('cf-ray');
    proxyReq.removeHeader('authorization'); // Remove our API key before forwarding
    
    // Set Host header to match LM Studio (makes it look like direct connection)
    try {
      const targetUrl = new URL(LM_STUDIO_URL);
      proxyReq.setHeader('Host', targetUrl.host);
    } catch (e) {
      // If URL parsing fails, keep original host
    }
    
    // Log what we're sending
    console.log(`  Forwarding to: ${LM_STUDIO_URL}${req.path}`);
    console.log(`  Host header: ${proxyReq.getHeader('host')}`);
    
    // Log when the request is actually sent
    proxyReq.on('error', (err) => {
      console.error(`  ❌ Error sending request to LM Studio:`, err);
      console.error(`     Error code: ${err.code}`);
      console.error(`     Error message: ${err.message}`);
    });
    
    proxyReq.on('finish', () => {
      console.log(`  ✅ Request body sent to LM Studio`);
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`✅ Response received from LM Studio: ${proxyRes.statusCode} for ${req.method} ${req.path}`);
    console.log(`  Response headers:`, Object.keys(proxyRes.headers));
    console.log(`  Content-Type: ${proxyRes.headers['content-type'] || 'unknown'}`);
    console.log(`  Content-Length: ${proxyRes.headers['content-length'] || 'unknown'}`);
    
    // Check for Cloudflare error responses (520-530 are Cloudflare-specific errors)
    // These indicate Cloudflare cannot reach the origin server
    if (proxyRes.statusCode >= 520 && proxyRes.statusCode <= 530) {
      const errorDesc = getCloudflareErrorDescription(proxyRes.statusCode);
      console.error(`⚠️  Cloudflare error detected: ${proxyRes.statusCode} - ${errorDesc}`);
      
      // Provide specific error messages based on error type
      if (proxyRes.statusCode === 524) {
        console.error(`  ❌ Timeout occurred - Cloudflare timed out waiting for response`);
        console.error(`  💡 This usually means:`);
        console.error(`     - LM Studio is taking too long to respond`);
        console.error(`     - The request is too large or complex`);
        console.error(`     - Network latency is high`);
        console.error(`     - LM Studio may be overloaded or stuck`);
      } else if (proxyRes.statusCode === 522) {
        console.error(`  ❌ Connection timed out - Cloudflare cannot connect to origin`);
        console.error(`  💡 This usually means:`);
        console.error(`     - Local server is not running`);
        console.error(`     - Firewall is blocking connections`);
        console.error(`     - Port mismatch between tunnel config and server`);
      } else if (proxyRes.statusCode === 530) {
        console.error(`  ❌ DNS error - Cloudflare cannot resolve origin`);
        console.error(`  💡 This usually means:`);
        console.error(`     - Tunnel configuration is incorrect`);
        console.error(`     - DNS resolution failed`);
      } else {
        console.error(`  ❌ Cloudflare error - cannot reach origin server`);
        console.error(`  💡 This usually means:`);
        console.error(`     - Local server is not running`);
        console.error(`     - Tunnel is not properly configured`);
        console.error(`     - Port mismatch between tunnel config and server`);
      }
      
      // Collect the response body to check if it's a Cloudflare error page
      let bodyChunks = [];
      proxyRes.on('data', (chunk) => {
        bodyChunks.push(chunk);
      });
      
      proxyRes.on('end', () => {
        const body = Buffer.concat(bodyChunks).toString('utf-8');
        
        // Check if this looks like a Cloudflare error page
        const isCloudflareError = body.includes('Cloudflare') || 
                                 body.includes('cf-wrapper') || 
                                 body.includes('cf-alert') ||
                                 body.includes('Cloudflare Tunnel error') ||
                                 body.includes('A timeout occurred') ||
                                 body.includes('Error code 524') ||
                                 body.includes('Error code 522') ||
                                 body.includes('Error code 530');
        
        if (isCloudflareError) {
          console.error(`  📄 Confirmed: Cloudflare error page detected`);
          
          // Build troubleshooting message based on error type
          let troubleshooting = {};
          if (proxyRes.statusCode === 524) {
            troubleshooting = {
              'Check LM Studio': 'Verify LM Studio is running and responsive',
              'Check response time': 'LM Studio may be taking too long to process the request',
              'Try simpler request': 'The request might be too complex or large',
              'Check network': 'Network latency might be causing timeouts',
              'Increase timeout': 'Consider increasing Cloudflare timeout settings'
            };
          } else {
            troubleshooting = {
              'Check local server': 'Verify the server is running: npm start',
              'Check tunnel': 'Ensure cloudflared tunnel is running: cloudflared tunnel run lmstudio-tunnel',
              'Check port': `Verify tunnel config points to: http://localhost:${PORT || 3000}`,
              'Test locally': `Test server directly: curl http://localhost:${PORT || 3000}/health`
            };
          }
          
          // Return a proper JSON error instead of the HTML
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Bad Gateway',
            message: proxyRes.statusCode === 524 
              ? 'Request timed out - Cloudflare timed out waiting for response'
              : 'Cloudflare tunnel cannot reach the origin server',
            details: `Cloudflare error ${proxyRes.statusCode}: ${errorDesc}`,
            troubleshooting
          }));
        } else {
          // Not a Cloudflare error, forward the response as-is
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          res.end(body);
        }
      });
      
      proxyRes.on('error', (err) => {
        console.error('Error reading proxy response:', err);
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Error reading response from origin server'
        });
      });
      
      return;
    }
    
    // For non-Cloudflare errors, handle the response normally
    // Log error responses from LM Studio for debugging
    if (proxyRes.statusCode >= 400) {
      console.error(`⚠️  LM Studio returned error: ${proxyRes.statusCode}`);
      console.error(`  💡 If you see "context length" errors, the prompt is too long for the model`);
      console.error(`  💡 Solutions: Increase context length in LM Studio, use a larger model, or reduce prompt size`);
    }
    
    // For all responses (success and error), handle normally
    // Remove Express/Node proxy-identifying headers from response
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['x-powered-by'];
    delete responseHeaders['X-Powered-By'];
    delete responseHeaders['x-forwarded-for'];
    delete responseHeaders['x-forwarded-proto'];
    delete responseHeaders['x-forwarded-host'];
    delete responseHeaders['via'];
    delete responseHeaders['Via'];
    
    // Write response headers
    res.writeHead(proxyRes.statusCode, responseHeaders);
    
    // Pipe the response body (for streaming responses, this will stream)
    proxyRes.pipe(res);
    proxyRes.on('error', (err) => {
      console.error('Error piping proxy response:', err);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Error reading response from origin server'
        });
      }
    });
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    console.error('  Error code:', err.code);
    console.error('  Error message:', err.message);
    console.error('  Request URL:', req.url);
    console.error('  Target:', LM_STUDIO_URL);
    
    // Check for timeout errors
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.message.includes('timeout')) {
      console.error('  ⏱️  Timeout error detected');
      res.status(504).json({ 
        error: 'Gateway Timeout',
        message: 'Request to LM Studio timed out',
        details: err.message,
        troubleshooting: {
          'Check LM Studio': 'Verify LM Studio is running and responsive',
          'Check response time': 'LM Studio may be taking too long to process the request',
          'Try simpler request': 'The request might be too complex or large',
          'Check network': 'Network connectivity issues may be causing timeouts'
        }
      });
    } else if (err.code === 'ECONNREFUSED') {
      console.error('  🔌 Connection refused');
      res.status(502).json({ 
        error: 'Bad Gateway',
        message: 'Unable to connect to LM Studio. Is it running?',
        details: err.message,
        troubleshooting: {
          'Check LM Studio': `Verify LM Studio is running at ${LM_STUDIO_URL}`,
          'Test connection': `Test directly: curl ${LM_STUDIO_URL}/v1/models`,
          'Check URL': `Verify LM_STUDIO_URL in .env is correct: ${LM_STUDIO_URL}`
        }
      });
    } else {
      res.status(502).json({ 
        error: 'Bad Gateway',
        message: 'Unable to connect to LM Studio',
        details: err.message,
        errorCode: err.code
      });
    }
  },
  logLevel: 'info'
};

// Create proxy middleware
const proxy = createProxyMiddleware(proxyOptions);

// Proxy all requests to LM Studio
app.use('/', proxy);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LM Studio Tunnel Server running on port ${PORT}`);
  console.log(`📡 Proxying to: ${LM_STUDIO_URL}`);
  console.log(`🔑 API Key configured: ${API_KEY.substring(0, 10)}...`);
  console.log(`🔒 IP Restrictions: ${ALLOWED_IPS.length > 0 ? ALLOWED_IPS.join(', ') : 'None (allowing all)'}`);
  console.log(`\nHealth check: http://localhost:${PORT}/health`);
});

