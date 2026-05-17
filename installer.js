const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const AdmZip = require('adm-zip');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Konfigurasi
let config = {
    installPath: '',
    port: 3000,
    mongoPort: 27017,
    zipUrl: 'https://example.com/your-script.zip', // GANTI DENGAN URL ZIP ANDA
    repoUrl: 'https://github.com/readloud/auto-installer.git' // Atau gunakan git
};

// Warna untuk console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
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

async function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function checkAndInstallNodeJS() {
    log('Mengecek instalasi Node.js...');
    try {
        const version = execSync('node --version', { stdio: 'pipe' }).toString().trim();
        log(`Node.js sudah terinstall: ${version}`, 'success');
        return true;
    } catch (error) {
        log('Node.js tidak ditemukan! Memulai instalasi...', 'warning');
        
        // Download Node.js installer untuk Windows
        const nodeVersion = '20.11.0';
        const nodeInstaller = `node-v${nodeVersion}-x64.msi`;
        const nodeUrl = `https://nodejs.org/dist/v${nodeVersion}/${nodeInstaller}`;
        
        log(`Mengunduh Node.js ${nodeVersion}...`);
        await downloadFile(nodeUrl, nodeInstaller);
        
        log('Menjalankan installer Node.js...');
        execSync(`msiexec /i "${nodeInstaller}" /quiet /norestart`, { stdio: 'inherit' });
        
        log('Node.js berhasil diinstall! Silakan restart terminal jika perlu.', 'success');
        return true;
    }
}

async function checkAndInstallMongoDB() {
    log('Mengecek instalasi MongoDB...');
    try {
        const version = execSync('mongod --version', { stdio: 'pipe' }).toString().split('\n')[0];
        log(`MongoDB sudah terinstall: ${version}`, 'success');
        return true;
    } catch (error) {
        log('MongoDB tidak ditemukan! Memulai instalasi...', 'warning');
        
        const mongoVersion = '7.0.5';
        const mongoInstaller = `mongodb-windows-x86_64-${mongoVersion}-signed.msi`;
        const mongoUrl = `https://fastdl.mongodb.org/windows/${mongoInstaller}`;
        
        log(`Mengunduh MongoDB ${mongoVersion}...`);
        await downloadFile(mongoUrl, mongoInstaller);
        
        log('Menjalankan installer MongoDB...');
        execSync(`msiexec /i "${mongoInstaller}" /quiet /norestart`, { stdio: 'inherit' });
        
        log('MongoDB berhasil diinstall!', 'success');
        return true;
    }
}

async function downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filename);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                log(`Download selesai: ${filename}`, 'success');
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filename, () => {});
            reject(err);
        });
    });
}

async function downloadAndExtractZip() {
    const zipPath = path.join(config.installPath, 'script.zip');
    log(`Mengunduh script dari ${config.zipUrl}...`);
    
    try {
        await downloadFile(config.zipUrl, zipPath);
        
        log('Mengekstrak file...');
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(config.installPath, true);
        
        fs.unlinkSync(zipPath);
        log('Ekstraksi selesai!', 'success');
    } catch (error) {
        log(`Gagal download/extract: ${error.message}`, 'error');
        throw error;
    }
}

async function createEnvFile() {
    const envPath = path.join(config.installPath, '.env');
    const envContent = `# Server Configuration
PORT=${config.port}
NODE_ENV=production

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:${config.mongoPort}/myapp
MONGODB_PORT=${config.mongoPort}

# App Configuration
JWT_SECRET=${Math.random().toString(36).substring(2, 15)}
API_VERSION=v1
`;

    fs.writeFileSync(envPath, envContent);
    log('.env file berhasil dibuat', 'success');
}

async function runNpmInstall() {
    log('Menjalankan npm install...');
    try {
        execSync('npm install', { cwd: config.installPath, stdio: 'inherit' });
        log('npm install selesai!', 'success');
    } catch (error) {
        log(`Gagal npm install: ${error.message}`, 'error');
        throw error;
    }
}

async function installPM2() {
    log('Menginstall PM2 secara global...');
    try {
        execSync('npm install -g pm2', { stdio: 'inherit' });
        log('PM2 berhasil diinstall!', 'success');
    } catch (error) {
        log(`Gagal install PM2: ${error.message}`, 'error');
        throw error;
    }
}

async function runWithPM2() {
    log('Menjalankan script dengan PM2...');
    try {
        // Cek apakah app sudah ada
        try {
            execSync('pm2 describe myapp', { stdio: 'pipe' });
            log('App sudah berjalan, melakukan restart...');
            execSync('pm2 restart myapp', { cwd: config.installPath, stdio: 'inherit' });
        } catch {
            log('Menjalankan app baru dengan PM2...');
            execSync(`pm2 start npm --name "myapp" -- start -- --port=${config.port}`, { 
                cwd: config.installPath, 
                stdio: 'inherit' 
            });
        }
        
        execSync('pm2 save', { stdio: 'inherit' });
        log('Script berjalan dengan PM2!', 'success');
    } catch (error) {
        log(`Gagal menjalankan PM2: ${error.message}`, 'error');
        throw error;
    }
}

async function updateApplication() {
    log('=== MEMULAI PROSES UPDATE ===', 'info');
    
    try {
        // Backup .env
        const envBackup = path.join(config.installPath, '.env.backup');
        if (fs.existsSync(path.join(config.installPath, '.env'))) {
            fs.copyFileSync(path.join(config.installPath, '.env'), envBackup);
            log('.env file dibackup', 'success');
        }
        
        // Download ulang zip
        await downloadAndExtractZip();
        
        // Restore .env
        if (fs.existsSync(envBackup)) {
            fs.copyFileSync(envBackup, path.join(config.installPath, '.env'));
            fs.unlinkSync(envBackup);
            log('.env file direstore', 'success');
        }
        
        // Jalankan npm install
        await runNpmInstall();
        
        // Restart PM2
        execSync('pm2 restart myapp', { cwd: config.installPath, stdio: 'inherit' });
        
        log('=== UPDATE SELESAI ===', 'success');
    } catch (error) {
        log(`Update gagal: ${error.message}`, 'error');
    }
}

async function main() {
    console.log(`${colors.bright}${colors.cyan}=== AUTO INSTALLER NODEJS APP ===${colors.reset}\n`);
    
    // Setup konfigurasi
    config.installPath = await question('Masukkan lokasi install (contoh: C:\\myapp): ');
    if (!fs.existsSync(config.installPath)) {
        fs.mkdirSync(config.installPath, { recursive: true });
        log(`Folder ${config.installPath} telah dibuat`, 'success');
    }
    
    config.port = await question(`Masukkan port untuk Node.js (default: ${config.port}): `) || config.port;
    config.mongoPort = await question(`Masukkan port untuk MongoDB (default: ${config.mongoPort}): `) || config.mongoPort;
    config.zipUrl = await question('Masukkan URL download script (.zip): ');
    
    console.log('\n');
    
    try {
        // Step 1: Cek dan install Node.js
        await checkAndInstallNodeJS();
        
        // Step 2: Cek dan install MongoDB
        await checkAndInstallMongoDB();
        
        // Step 3: Download dan extract zip
        await downloadAndExtractZip();
        
        // Step 4: Buat file .env
        await createEnvFile();
        
        // Step 5: Jalankan npm install
        await runNpmInstall();
        
        // Step 6: Install PM2
        await installPM2();
        
        // Step 7: Running dengan PM2
        await runWithPM2();
        
        log('\n=== INSTALLASI SELESAI ===', 'success');
        log(`Aplikasi berjalan di http://localhost:${config.port}`, 'info');
        
        // Menu update
        const shouldUpdate = await question('\nApakah ingin melakukan update sekarang? (y/n): ');
        if (shouldUpdate.toLowerCase() === 'y') {
            await updateApplication();
        }
        
    } catch (error) {
        log(`Instalasi gagal: ${error.message}`, 'error');
    }
    
    rl.close();
}

// Jalankan main function
main().catch(console.error);
