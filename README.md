# LM Studio Underpass

A secure tunnel server that validates OpenAPI keys and proxies requests to your local LM Studio instance. Perfect for exposing your local LM Studio to external clients with authentication and IP restrictions.

## Features

- 🔐 **OpenAPI Key Validation** - Validates API keys in the standard OpenAPI format (starts with `sk-`)
- 🔒 **IP Restrictions** - Restrict access to specific IP addresses or CIDR ranges
- 🌐 **Proxy/Tunnel** - Seamlessly forwards requests to your local LM Studio
- 🚀 **Easy Deployment** - Deploy locally with Cloudflare Tunnel
- ✅ **Health Checks** - Built-in health check endpoint

## Prerequisites

- Node.js 18+ installed
- LM Studio running locally at `http://192.168.50.193:5595` (or your configured URL)
- Cloudflare account (for Cloudflare Tunnel)

## Local Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Generate a secure API key:**
   ```bash
   # Generate and display a new API key
   npm run generate-key
   
   # Generate and automatically save to .env file
   npm run generate-key:save
   ```
   
   Or manually configure your `.env` file:
   ```env
   PORT=3000
   LM_STUDIO_URL=http://192.168.50.193:5595
   API_KEY=sk-your-secure-api-key-here
   ALLOWED_IPS=192.168.1.100,10.0.0.0/8
   EXTERNAL_DOMAIN=https://lmstudio.yourdomain.com
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Test the health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```
   
   Or use the automated test script (requires `EXTERNAL_DOMAIN` in `.env`):
   ```bash
   npm test
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `LM_STUDIO_URL` | Your local LM Studio URL | `http://192.168.50.193:5595` |
| `API_KEY` | OpenAPI key for authentication | `sk-1234567890abcdef...` |
| `ALLOWED_IPS` | Comma-separated list of allowed IPs | Empty (allows all) |
| `EXTERNAL_DOMAIN` | Your Cloudflare tunnel domain (for testing) | None |

### IP Restrictions

The `ALLOWED_IPS` variable supports:
- **Single IPs**: `192.168.1.100`
- **CIDR notation**: `192.168.1.0/24` (entire subnet)
- **Multiple entries**: `192.168.1.100,10.0.0.0/8,172.16.0.0/12`

**Important**: Leave `ALLOWED_IPS` empty during development to allow all connections. Always set it in production!

## Deployment

This server runs locally on your machine and uses Cloudflare Tunnel to expose it to the internet. This provides a simple, secure way to access your local LM Studio from anywhere.

### Setup Steps

1. **Run the server locally:**
   ```bash
   npm start
   ```

2. **Install cloudflared:**
   ```bash
   brew install cloudflared  # macOS
   # or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
   ```

3. **Onboard your domain to Cloudflare (if not already added):**
   
   If you have a domain on Namecheap (or another registrar) that you want to use:
   
   a. **Add domain to Cloudflare:**
      - Go to https://dash.cloudflare.com/
      - Click "Add a Site" or "Add Site"
      - Enter your domain name (e.g., `yourdomain.com`)
      - Select a plan (Free plan works fine)
      - Cloudflare will scan your existing DNS records
   
   b. **Update nameservers at Namecheap:**
      - After adding your domain, Cloudflare will show you two nameservers (e.g., `alice.ns.cloudflare.com` and `bob.ns.cloudflare.com`)
      - Log in to your Namecheap account
      - Go to Domain List → Manage your domain
      - Under "Nameservers", select "Custom DNS"
      - Replace the existing nameservers with the two Cloudflare nameservers
      - Click "Save"
   
   c. **Wait for DNS propagation:**
      - It can take 24-48 hours for DNS changes to fully propagate
      - Cloudflare will show "Active" status when the domain is ready
      - You can check status in the Cloudflare dashboard
   
   **Note**: You can proceed with tunnel setup even while DNS is propagating, but the tunnel won't work until the domain is fully active in Cloudflare.

4. **Authenticate with Cloudflare:**
   ```bash
   cloudflared tunnel login
   ```
   
   This will open your browser to authenticate with Cloudflare. You'll be prompted to:
   - **Select a zone**: A zone is a domain you manage in Cloudflare (e.g., `example.com`, `yourdomain.com`)
   - **Find your zones**: If you're not sure which zones you have, you can:
     - Check the Cloudflare dashboard at https://dash.cloudflare.com/
     - Look in the left sidebar under "Websites" to see all your domains
     - Select the zone (domain) where you want to host your tunnel
   
   **Alternative - Specify zone directly:**
   If you know your domain, you can specify it directly:
   ```bash
   cloudflared tunnel login --url https://yourdomain.com
   ```
   
   After authentication, the origin certificate will be automatically downloaded to `~/.cloudflared/cert.pem`.

5. **Create tunnel:**
   ```bash
   cloudflared tunnel create lmstudio-tunnel
   ```

6. **Configure tunnel:**
   Create `config.yml` (usually in `~/.cloudflared/`):
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /path/to/credentials.json
   
   ingress:
     - hostname: lmstudio.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```
   
   **Note**: After creating the tunnel, you'll get a tunnel ID and the path to `credentials.json`. Use these values in your config file.

7. **Run tunnel:**
   ```bash
   cloudflared tunnel run lmstudio-tunnel
   ```

8. **Test the tunnel:**
   
   **First, verify your local server is running:**
   ```bash
   curl http://localhost:3000/health
   ```
   You should see a JSON response with status "ok".
   
   **Test through the tunnel:**
   ```bash
   curl https://lmstudio.yourdomain.com/health
   ```
   Replace `lmstudio.yourdomain.com` with your actual hostname from the config.
   
   **Test with API key (full request):**
   ```bash
   curl -H "Authorization: Bearer sk-your-api-key" \
        https://lmstudio.yourdomain.com/v1/models
   ```
   
   **Check tunnel status:**
   ```bash
   cloudflared tunnel info lmstudio-tunnel
   ```
   
   **Automated testing (recommended):**
   Make sure `EXTERNAL_DOMAIN` is set in your `.env` file, then:
   ```bash
   npm test
   ```
   This will automatically test both the health endpoint and API authentication.
   
   **Verify tunnel is running:**
   - The tunnel process should show "Connection established" in the terminal
   - Check the Cloudflare dashboard → Zero Trust → Networks → Tunnels
   - The tunnel should show as "Healthy" with a green status

Your server will now be accessible at `https://lmstudio.yourdomain.com` (or whatever hostname you configured).

**Note**: Your local machine needs to be running for the server to be accessible. For 24/7 availability, consider running this on a server or using a service that keeps your machine online.

## Usage

### Making Requests

All requests must include the API key in the Authorization header:

```bash
curl -H "Authorization: Bearer sk-your-api-key" \
     -H "Content-Type: application/json" \
     https://your-server.com/v1/models
```

Or using the key directly:

```bash
curl -H "Authorization: sk-your-api-key" \
     -H "Content-Type: application/json" \
     https://your-server.com/v1/models
```

### Example: Chat Completion

```bash
curl -X POST https://your-server.com/v1/chat/completions \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## Security Best Practices

1. **Use a strong API key**: Generate a secure key using `npm run generate-key:save` (creates a cryptographically secure key starting with `sk-`)
2. **Set IP restrictions**: Always configure `ALLOWED_IPS` in production
3. **Use HTTPS**: Cloudflare Tunnel automatically provides HTTPS/SSL encryption
4. **Rotate keys**: Change your API key periodically using `npm run generate-key:save`
5. **Monitor logs**: Check server logs for unauthorized access attempts

## Troubleshooting

### Connection Refused

- Ensure LM Studio is running and accessible at the configured URL
- Check firewall settings on your local machine (see "Firewall Issues" section below)
- Verify the `LM_STUDIO_URL` is correct
- Test local connectivity: `curl http://localhost:3000/health`

### 401 Unauthorized

- Verify your API key matches the `API_KEY` in your `.env`
- Ensure the Authorization header is formatted correctly
- Check that the key starts with `sk-`

### 403 Forbidden (IP)

- Verify your IP is in the `ALLOWED_IPS` list
- Check if you're behind a proxy (the server uses `X-Forwarded-For` header)
- For development, temporarily remove IP restrictions

### 502 Bad Gateway

- LM Studio is not running or not accessible
- Check network connectivity between server and LM Studio
- Verify the `LM_STUDIO_URL` is correct

### 522 Connection Timed Out (Cloudflare)

This error means Cloudflare Tunnel cannot reach your local server. Common causes:

- **Local server not running**: Ensure `npm start` is running
- **Wrong port in tunnel config**: Verify `~/.cloudflared/config.yml` points to the correct port
- **Firewall blocking connections**: See "Firewall Issues" below
- **Tunnel not running**: Ensure `cloudflared tunnel run` is active

### Firewall Issues

If you're getting connection errors (522, connection refused, etc.), your firewall might be blocking the connection between the tunnel and your local server.

#### macOS Firewall Check

**Method 1: Using System Settings (Recommended - Easiest)**

1. **Open System Settings:**
   - Click the Apple menu → **System Settings** (or **System Preferences** on macOS Monterey and earlier)
   - Go to **Network** → **Firewall** (or **Security & Privacy** → **Firewall** on older macOS)

2. **Enable and configure firewall:**
   - If firewall is OFF, click the lock icon (bottom left) and enter your password, then turn it ON
   - Click **Options...** or **Firewall Options...**

3. **Allow Node.js:**
   - Look for **node** or **Node.js** in the list of applications
   - If you see it and it says "Block incoming connections", click it and change to "Allow incoming connections"
   - If Node.js is NOT in the list:
     - Click the **+** button to add an application
     - Navigate to where Node.js is installed. Common locations:
       - `/usr/local/bin/node` (Homebrew)
       - `/opt/homebrew/bin/node` (Apple Silicon Homebrew)
       - `/usr/bin/node` (system Node.js)
     - Or use this command to find Node.js:
       ```bash
       which node
       ```
     - Select the `node` executable and click **Add**
     - Make sure it's set to "Allow incoming connections"

4. **Click OK** to save changes

**Method 2: Using Terminal (If GUI doesn't work)**

1. **Find your Node.js path:**
   ```bash
   which node
   ```
   This will show something like `/usr/local/bin/node` or `/opt/homebrew/bin/node`

2. **Check current firewall status:**
   ```bash
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps
   ```

3. **Add and allow Node.js:**
   ```bash
   # Replace /path/to/node with your actual Node.js path from step 1
   NODE_PATH=$(which node)
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$NODE_PATH"
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$NODE_PATH"
   ```

4. **Verify it's allowed:**
   ```bash
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps | grep -i node
   ```
   You should see your Node.js path with "ALFW" (Allow) status

**Method 3: Allow when prompted (Temporary)**

1. Start your server: `npm start`
2. macOS will show a popup asking if you want to allow Node.js
3. Click **Allow** (you may need to enter your password)
4. This will automatically add Node.js to the allowed list

**Test if it's working:**
```bash
# Test if server is accessible locally
curl http://localhost:3000/health

# If local works but tunnel doesn't, firewall is likely blocking
# After allowing Node.js, test again with: npm test
```

#### Linux Firewall Check

1. **Check if firewall is running:**
   ```bash
   # For UFW (Ubuntu/Debian)
   sudo ufw status
   
   # For firewalld (CentOS/RHEL)
   sudo firewall-cmd --list-all
   
   # For iptables
   sudo iptables -L -n
   ```

2. **Allow the port:**
   ```bash
   # UFW
   sudo ufw allow 3000/tcp
   
   # firewalld
   sudo firewall-cmd --permanent --add-port=3000/tcp
   sudo firewall-cmd --reload
   ```

#### Windows Firewall Check

1. **Open Windows Defender Firewall:**
   - Search for "Windows Defender Firewall" in Start menu
   - Click "Allow an app or feature through Windows Defender Firewall"

2. **Allow Node.js:**
   - Click "Change settings"
   - Find Node.js in the list and check both "Private" and "Public"
   - If Node.js isn't listed, click "Allow another app" and add it

3. **Or allow the port:**
   - Click "Advanced settings"
   - Create a new Inbound Rule for TCP port 3000 (or your PORT)

#### Quick Test

To quickly test if the firewall is the issue:

1. **Temporarily disable firewall** (for testing only!)
2. **Run your server**: `npm start`
3. **Run tunnel**: `cloudflared tunnel run lmstudio-tunnel`
4. **Test**: `npm test`

If it works with the firewall disabled, you know the firewall is the issue. Re-enable it and configure it properly using the steps above.

#### Alternative: Use 127.0.0.1 instead of localhost

Sometimes using `127.0.0.1` instead of `localhost` in your tunnel config can help:
```yaml
ingress:
  - hostname: lmstudio.yourdomain.com
    service: http://127.0.0.1:3000  # Use 127.0.0.1 instead of localhost
```

## License

MIT

