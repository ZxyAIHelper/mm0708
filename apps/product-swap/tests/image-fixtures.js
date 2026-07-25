'use strict';

const PNG_MAGIC = Buffer.from('89504e470d0a1a0a', 'hex');

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (
                (crc & 1) ? 0xedb88320 : 0
            );
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBuffer.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(
        crc32(Buffer.concat([typeBuffer, data])),
        8 + data.length,
    );
    return chunk;
}

function createZeroIdatPng() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        PNG_MAGIC,
        pngChunk('IHDR', header),
        pngChunk('IDAT'),
        pngChunk('IEND'),
    ]);
}

function createUndecodableJpeg() {
    return Buffer.from([
        0xff, 0xd8,
        0xff, 0xc0, 0x00, 0x0b,
        0x08, 0x00, 0x01, 0x00, 0x01,
        0x01, 0x01, 0x11, 0x00,
        0xff, 0xda, 0x00, 0x08,
        0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
        0x00,
        0xff, 0xd9,
    ]);
}

function createUndecodableWebp() {
    const buffer = Buffer.alloc(30);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(22, 4);
    buffer.write('WEBP', 8, 'ascii');
    buffer.write('VP8 ', 12, 'ascii');
    buffer.writeUInt32LE(10, 16);
    buffer[23] = 0x9d;
    buffer[24] = 0x01;
    buffer[25] = 0x2a;
    buffer.writeUInt16LE(1, 26);
    buffer.writeUInt16LE(1, 28);
    return buffer;
}

module.exports = {
    createUndecodableJpeg,
    createUndecodableWebp,
    createZeroIdatPng,
};
