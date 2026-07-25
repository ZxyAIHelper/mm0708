import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { publicCatalog } = require('./server/template-registry');
const appRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(appRoot, 'dist');
const publicEntries = [
    'index.html',
    'create.html',
    'history.html',
    'profile.html',
    'style.css',
    'app.css',
    'api-client.js',
    'local-history.js',
    'version-history.js',
    'merchant-store.js',
    'generation-worker.js',
    'script.js',
    'history.js',
    'home.js',
    'profile.js',
    'templates.js',
    'creator-form.js',
    'creator-meta.js',
    'chat-materials.js',
    'dish-library-client.js',
    'assets',
];

function browserCatalogSource() {
    return `globalThis.__TEMPLATE_CATALOG__ = ${JSON.stringify(
        publicCatalog(),
        null,
        2,
    )};\n`;
}

export async function build() {
    await rm(distRoot, { recursive: true, force: true });
    await mkdir(distRoot, { recursive: true });

    for (const entry of publicEntries) {
        await cp(
            path.join(appRoot, entry),
            path.join(distRoot, entry),
            { recursive: true },
        );
    }

    await writeFile(
        path.join(distRoot, 'template-catalog.js'),
        browserCatalogSource(),
        'utf8',
    );
}

if (
    process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await build();
    console.log('Product Swap static assets built in dist/');
}
