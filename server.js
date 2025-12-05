import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://192.168.50.193:5595';
const API_KEY = process.env.API_KEY || 'sk-1234567890abcdef1234567890abcdef';
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];

// Middleware
app.use(cors());
app.use(express.json());

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
app.use(ipRestriction);
app.use(validateApiKey);

// Proxy configuration
const proxyOptions = {
  target: LM_STUDIO_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/v1': '/v1', // Keep /v1 prefix if needed
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying ${req.method} ${req.path} to ${LM_STUDIO_URL}`);
    // Forward original headers
    if (req.headers['content-type']) {
      proxyReq.setHeader('Content-Type', req.headers['content-type']);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Response: ${proxyRes.statusCode} for ${req.method} ${req.path}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(502).json({ 
      error: 'Bad Gateway',
      message: 'Unable to connect to LM Studio. Is it running?',
      details: err.message 
    });
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

