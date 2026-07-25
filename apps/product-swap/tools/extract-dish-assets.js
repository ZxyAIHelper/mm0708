'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const catalog = require('../dish-assets/catalog.json');

const CROPS = [
    [622, 39, 86, 86],
    [712, 39, 86, 86],
    [802, 39, 86, 86],
    [622, 132, 86, 86],
    [712, 132, 86, 86],
    [802, 132, 86, 86],
    [622, 224, 86, 86],
    [712, 224, 86, 86],
    [802, 224, 86, 86],
    [31, 330, 137, 136],
    [171, 330, 137, 136],
    [31, 470, 137, 136],
    [171, 470, 137, 136],
    [322, 132, 88, 86],
    [416, 132, 88, 86],
    [510, 132, 88, 86],
    [416, 224, 88, 86],
    [510, 224, 88, 86],
];

async function extract(sourcePath) {
    if (!sourcePath) {
        throw new Error('Usage: node tools/extract-dish-assets.js <reference.png>');
    }
    const outputRoot = path.resolve(__dirname, '..', 'assets', 'dish-library');
    await fs.mkdir(outputRoot, { recursive: true });
    const source = sharp(path.resolve(sourcePath));
    const metadata = await source.metadata();
    if (metadata.width < 890 || metadata.height < 608) {
        throw new Error('Reference image is smaller than expected');
    }
    for (const [index, item] of catalog.entries()) {
        const [left, top, width, height] = CROPS[index];
        await sharp(path.resolve(sourcePath))
            .extract({ left, top, width, height })
            .resize(480, 480, { fit: 'cover' })
            .webp({ quality: 68 })
            .toFile(path.join(outputRoot, `${item.id}.webp`));
    }
    await fs.copyFile(
        path.resolve(__dirname, '..', 'dish-assets', 'catalog.json'),
        path.join(outputRoot, 'catalog.json'),
    );
}

if (require.main === module) {
    extract(process.argv[2]).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { CROPS, extract };
