import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(appRoot, 'dist');
const publicEntries = [
    'index.html',
    'history.html',
    'style.css',
    'api-client.js',
    'local-history.js',
    'generation-worker.js',
    'script.js',
    'history.js',
    'assets',
];

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
}

if (
    process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await build();
    console.log('Product Swap static assets built in dist/');
}
