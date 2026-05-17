const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Konfigurasi GitHub
const GITHUB_USERNAME = 'readloud'; // GANTI DENGAN USERNAME ANDA
const GITHUB_REPO = 'auto-installer'; // GANTI DENGAN NAMA REPO ANDA
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // Set token untuk private repo

// Warna console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m'
};

function log(message, type = 'info') {
    const prefix = {
        info: `${colors.cyan}[INFO]${colors.reset}`,
        success: `${colors.green}[SUCCESS]${colors.reset}`,
        error: `${colors.red}[ERROR]${colors.reset}`,
        warning: `${colors.yellow}[WARNING]${colors.reset}`
    };
    console.log(`${prefix[type]} ${message}`);
}

async function getLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/releases/latest`,
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js',
                'Accept': 'application/vnd.github.v3+json'
            }
        };
        
        if (GITHUB_TOKEN) {
            options.headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    if (release.assets && release.assets.length > 0) {
                        resolve(release.assets[0].browser_download_url);
                    } else {
                        reject('No assets found in release');
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
                process.stdout.write(`\rDownload progress: ${percent}%`);
            });
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(); // New line after progress
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => {});
            reject(err);
        });
    });
}

async function getVersionFromNpm() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/users/${GITHUB_USERNAME}/packages/npm/${GITHUB_REPO}/versions`,
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js',
                'Accept': 'application/vnd.github.v3+json'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const versions = JSON.parse(data);
                    if (versions.length > 0) {
                        resolve(versions[0].name);
                    } else {
                        reject('No versions found');
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    console.log(`${colors.cyan}=== DOWNLOAD AUTO INSTALLER ===${colors.reset}\n`);
    
    log('Mengambil informasi versi terbaru...');
    
    try {
        // Get download URL from GitHub Releases
        const downloadUrl = await getLatestRelease();
        log(`Found latest release: ${downloadUrl}`, 'success');
        
        const outputPath = path.join(__dirname, 'auto-installer.exe');
        
        log('Mengunduh installer...');
        await downloadFile(downloadUrl, outputPath);
        
        log(`Installer berhasil diunduh ke: ${outputPath}`, 'success');
        
        const runNow = await question('\nJalankan installer sekarang? (y/n): ');
        if (runNow.toLowerCase() === 'y') {
            log('Menjalankan installer...', 'info');
            exec(outputPath, (error) => {
                if (error) {
                    log(`Gagal menjalankan installer: ${error.message}`, 'error');
                }
            });
        }
        
    } catch (error) {
        log(`Gagal mendownload: ${error.message}`, 'error');
        log('\nAlternatif: Download manual dari GitHub Releases', 'warning');
        log(`https://github.com/${GITHUB_USERNAME}/${GITHUB_REPO}/releases`, 'info');
    }
    
    rl.close();
}

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

main().catch(console.error);
