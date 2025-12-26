const fs = require('fs');

function deobfuscate(buffer) {
    const xorKey = 0x55;
    const decoded = new Uint8Array(buffer).map(b => b ^ xorKey);
    return new TextDecoder().decode(decoded).split(',').filter(Boolean);
}

function audit(filename) {
    if (!fs.existsSync(filename)) return;
    const buffer = fs.readFileSync(filename);
    const words = deobfuscate(buffer);

    const wordsEndingInS = words.filter(w => w.endsWith('S'));
    const plurals = wordsEndingInS.filter(w => !w.endsWith('SS'));

    console.log(`Audit for ${filename}:`);
    console.log(`Total words: ${words.length}`);
    console.log(`Words ending in S (excluding SS): ${plurals.length}`);
    if (plurals.length > 0) {
        console.log(`Sample candidates: ${plurals.slice(0, 15).join(', ')}`);
    }
    console.log('---');
}

audit('sol4.dat');
audit('sol5.dat');
audit('sol6.dat');
