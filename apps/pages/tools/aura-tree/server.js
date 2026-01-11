const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const forge = require('node-forge');

const PORT = 3000;

console.log("---------------------------------------------------");
console.log("Initializing HTTPS Server...");

// 1. Force Generate New Certificates (Avoids stale/corrupt file issues)
console.log("Generating fresh self-signed certificates...");
try {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certObj = forge.pki.createCertificate();
    certObj.publicKey = keys.publicKey;
    certObj.serialNumber = '01';
    certObj.validity.notBefore = new Date();
    certObj.validity.notAfter = new Date();
    certObj.validity.notAfter.setFullYear(certObj.validity.notBefore.getFullYear() + 1);

    // Add SAN (Subject Alternative Name) for IP addresses
    const interfaces = os.networkInterfaces();
    const altNames = [{ type: 2, value: 'localhost' }]; // type 2 is dNSName

    Object.keys(interfaces).forEach((ifname) => {
        interfaces[ifname].forEach((iface) => {
            if ('IPv4' === iface.family && !iface.internal) {
                altNames.push({ type: 7, ip: iface.address }); // type 7 is iPAddress
            }
        });
    });

    const attrs = [{ name: 'commonName', value: 'localhost' }];
    certObj.setSubject(attrs);
    certObj.setIssuer(attrs);
    certObj.setExtensions([
        {
            name: 'subjectAltName',
            altNames: altNames
        }
    ]);

    certObj.sign(keys.privateKey);

    const pemKey = forge.pki.privateKeyToPem(keys.privateKey);
    const pemCert = forge.pki.certificateToPem(certObj);

    // Start Server with in-memory certs
    startServer(pemKey, pemCert);

} catch (err) {
    console.error("CRITICAL ERROR generating certificates:", err);
    console.error("Ensure 'node-forge' is installed: npm install node-forge");
    process.exit(1);
}

function startServer(key, cert) {
    const MIME_TYPES = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4'
    };

    const handler = (req, res) => {
        // API endpoint to list photos
        if (req.url === '/api/photos') {
            const photosDir = path.join(__dirname, 'assets', 'photos');
            fs.readdir(photosDir, (err, files) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to read photos directory' }));
                    return;
                }

                // Filter for image files only
                const imageFiles = files.filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
                });

                // Return array of photo paths
                const photoPaths = imageFiles.map(file => `assets/photos/${file}`);

                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Cross-Origin-Embedder-Policy': 'credentialless',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Resource-Policy': 'cross-origin'
                });
                res.end(JSON.stringify(photoPaths));
            });
            return;
        }

        // Decode URL to handle Chinese and other special characters
        let filePath = '.' + decodeURIComponent(req.url);
        if (filePath === './') filePath = './index.html';
        filePath = filePath.split('?')[0];

        // Security: prevent directory traversal
        // Resolve absolute paths to ensure we stay in root
        const absolutePath = path.resolve(filePath);
        const rootPath = path.resolve('.');

        // Check if the resolved path starts with the root path
        if (!absolutePath.startsWith(rootPath)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        const extname = String(path.extname(filePath)).toLowerCase();
        const contentType = MIME_TYPES[extname] || 'application/octet-stream';

        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    res.writeHead(404);
                    res.end('404 Not Found');
                } else {
                    res.writeHead(500);
                    res.end('Error: ' + error.code);
                }
            } else {
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cross-Origin-Embedder-Policy': 'credentialless',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Resource-Policy': 'cross-origin'
                });
                res.end(content, 'utf-8');
            }
        });
    };

    const server = https.createServer({ key, cert }, handler);

    server.listen(PORT, '0.0.0.0', () => {
        const interfaces = os.networkInterfaces();
        console.log(`HTTPS SERVER RUNNING!`);
        console.log(`---------------------------------------------------`);
        console.log(`Local access:   https://localhost:${PORT}/`);

        Object.keys(interfaces).forEach((ifname) => {
            interfaces[ifname].forEach((iface) => {
                if ('IPv4' === iface.family && !iface.internal) {
                    console.log(`Network access: https://${iface.address}:${PORT}/`);
                }
            });
        });
        console.log(`---------------------------------------------------`);
        console.log(`NOTE: If you still see SSL errors, use Chrome/Edge on your device`);
        console.log(`and click "Advanced" -> "Proceed" on the warning screen.`);
    });
}
