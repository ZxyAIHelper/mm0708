const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const PORT = 8790;
const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || '';
const DOUBAO_IMAGE_MODEL = process.env.DOUBAO_IMAGE_MODEL || process.env.DOUBAO_ENDPOINT_ID || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let resolved = path.join(ROOT, clean);
  if (clean.endsWith('/')) {
    resolved = path.join(ROOT, clean, 'index.html');
  }
  return resolved;
}

async function handleGenerateMeme(req, res) {
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const prompt = String(body.prompt || '').trim();
    const image = body.image || body.referenceImage || '';

    if (!prompt) {
      return send(res, 400, JSON.stringify({ error: 'Prompt is required.' }), { 'Content-Type': MIME['.json'] });
    }

    if (!DOUBAO_API_KEY || !DOUBAO_IMAGE_MODEL) {
      return send(res, 500, JSON.stringify({ error: 'Missing DOUBAO_API_KEY or DOUBAO_IMAGE_MODEL.' }), { 'Content-Type': MIME['.json'] });
    }

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DOUBAO_API_KEY}`
      },
      body: JSON.stringify({
        model: DOUBAO_IMAGE_MODEL,
        prompt,
        ...(image ? { image } : {})
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return send(res, response.status, JSON.stringify({ error: 'Doubao API Error', details: data }), { 'Content-Type': MIME['.json'] });
    }

    const imageValue = data?.data?.[0]?.b64_json || data?.data?.[0]?.url || null;
    const imageUrl = imageValue && imageValue.startsWith('http') ? imageValue : imageValue ? `data:image/png;base64,${imageValue}` : null;
    return send(res, 200, JSON.stringify({ imageUrl, raw: data }), { 'Content-Type': MIME['.json'] });
  } catch (error) {
    return send(res, 500, JSON.stringify({ error: error.message }), { 'Content-Type': MIME['.json'] });
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if ((req.url === '/api/generate-meme' || req.url === '/api/generate-meme/') && req.method === 'POST') {
    return handleGenerateMeme(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed');
  }

  let filePath = safePath(req.url === '/' ? '/index.html' : req.url);
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  if (!fs.existsSync(filePath)) return send(res, 404, 'File not found');

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) return send(res, 404, 'File not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  send(res, 200, content, { 'Content-Type': contentType });
});

server.listen(PORT, () => {
  console.log(`Poster dev server listening on http://localhost:${PORT}`);
});
