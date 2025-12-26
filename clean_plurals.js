const fs = require('fs');

function deobfuscate(buffer) {
    const xorKey = 0x55;
    const decoded = new Uint8Array(buffer).map(b => b ^ xorKey);
    return new TextDecoder().decode(decoded).split(',').filter(Boolean);
}

function obfuscate(words) {
    const xorKey = 0x55;
    const str = words.join(',');
    const encoded = new TextEncoder().encode(str);
    return Buffer.from(encoded.map(b => b ^ xorKey));
}

function cleanup(filename) {
    if (!fs.existsSync(filename)) return;
    const buffer = fs.readFileSync(filename);
    const words = deobfuscate(buffer);

    const originalCount = words.length;
    // Filter: Keep words NOT ending in S OR words ending in SS
    const cleaned = words.filter(w => !w.endsWith('S') || w.endsWith('SS'));
    const removedCount = originalCount - cleaned.length;

    const outputBuffer = obfuscate(cleaned);
    fs.writeFileSync(filename, outputBuffer);

    console.log(`Cleaned ${filename}:`);
    console.log(`- Original: ${originalCount}`);
    console.log(`- Removed:  ${removedCount} (likely plurals)`);
    console.log(`- Remaining: ${cleaned.length}`);
    console.log('---');
}

cleanup('sol4.dat');
cleanup('sol5.dat');
cleanup('sol6.dat');
