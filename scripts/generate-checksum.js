const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

async function main() {
    const exePath = path.join(__dirname, '../auto-installer.exe');
    
    if (fs.existsSync(exePath)) {
        const checksum = await generateChecksum(exePath);
        console.log(`SHA256: ${checksum}`);
        
        // Save to file
        fs.writeFileSync('checksum.txt', checksum);
        console.log('Checksum saved to checksum.txt');
    } else {
        console.error('EXE file not found!');
    }
}

main().catch(console.error);