import os
import sys
import subprocess
import urllib.request
import zipfile
import shutil
import json
import platform
from pathlib import Path

class Colors:
    RESET = '\033[0m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'

class AutoInstaller:
    def __init__(self):
        self.install_path = ""
        self.node_port = 3000
        self.mongo_port = 27017
        self.zip_url = ""
        
    def log(self, message, type="info"):
        prefix = {
            "info": f"{Colors.CYAN}[INFO]{Colors.RESET}",
            "success": f"{Colors.GREEN}[SUCCESS]{Colors.RESET}",
            "error": f"{Colors.RED}[ERROR]{Colors.RESET}",
            "warning": f"{Colors.YELLOW}[WARNING]{Colors.RESET}"
        }
        print(f"{prefix[type]} {message}")
    
    def run_command(self, command, cwd=None):
        try:
            if cwd:
                result = subprocess.run(command, shell=True, cwd=cwd, capture_output=True, text=True)
            else:
                result = subprocess.run(command, shell=True, capture_output=True, text=True)
            return result.returncode == 0, result.stdout, result.stderr
        except Exception as e:
            return False, "", str(e)
    
    def check_nodejs(self):
        self.log("Mengecek instalasi Node.js...")
        success, stdout, _ = self.run_command("node --version")
        if success:
            self.log(f"Node.js terinstall: {stdout.strip()}", "success")
            return True
        else:
            self.log("Node.js tidak terinstall!", "warning")
            return self.install_nodejs()
    
    def install_nodejs(self):
        self.log("Mengunduh Node.js installer...")
        if platform.system() == "Windows":
            node_url = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
            installer = "node_installer.msi"
            
            urllib.request.urlretrieve(node_url, installer)
            self.log("Menjalankan installer Node.js...")
            os.system(f"msiexec /i {installer} /quiet")
            os.remove(installer)
            self.log("Node.js berhasil diinstall!", "success")
            return True
        return False
    
    def check_mongodb(self):
        self.log("Mengecek instalasi MongoDB...")
        success, stdout, _ = self.run_command("mongod --version")
        if success:
            self.log(f"MongoDB terinstall: {stdout.split()[0]}", "success")
            return True
        else:
            self.log("MongoDB tidak terinstall!", "warning")
            return self.install_mongodb()
    
    def install_mongodb(self):
        self.log("Mengunduh MongoDB installer...")
        if platform.system() == "Windows":
            mongo_url = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.5-signed.msi"
            installer = "mongodb_installer.msi"
            
            urllib.request.urlretrieve(mongo_url, installer)
            self.log("Menjalankan installer MongoDB...")
            os.system(f"msiexec /i {installer} /quiet")
            os.remove(installer)
            self.log("MongoDB berhasil diinstall!", "success")
            return True
        return False
    
    def download_and_extract(self):
        zip_path = os.path.join(self.install_path, "script.zip")
        self.log(f"Mengunduh script dari {self.zip_url}...")
        
        try:
            urllib.request.urlretrieve(self.zip_url, zip_path)
            
            self.log("Mengekstrak file...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(self.install_path)
            
            os.remove(zip_path)
            self.log("Ekstraksi selesai!", "success")
            return True
        except Exception as e:
            self.log(f"Gagal download: {str(e)}", "error")
            return False
    
    def create_env_file(self):
        env_path = os.path.join(self.install_path, ".env")
        env_content = f"""# Server Configuration
PORT={self.node_port}
NODE_ENV=production

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:{self.mongo_port}/myapp
MONGODB_PORT={self.mongo_port}

# App Configuration
JWT_SECRET={os.urandom(24).hex()}
API_VERSION=v1
"""
        with open(env_path, 'w') as f:
            f.write(env_content)
        self.log(".env file berhasil dibuat", "success")
    
    def run_npm_install(self):
        self.log("Menjalankan npm install...")
        success, _, stderr = self.run_command("npm install", cwd=self.install_path)
        if success:
            self.log("npm install selesai!", "success")
            return True
        else:
            self.log(f"npm install gagal: {stderr}", "error")
            return False
    
    def install_pm2(self):
        self.log("Menginstall PM2...")
        success, _, stderr = self.run_command("npm install -g pm2")
        if success:
            self.log("PM2 berhasil diinstall!", "success")
            return True
        else:
            self.log(f"Install PM2 gagal: {stderr}", "error")
            return False
    
    def run_with_pm2(self):
        self.log("Menjalankan script dengan PM2...")
        # Cek apakah app sudah running
        success, stdout, _ = self.run_command("pm2 describe myapp")
        
        if success:
            self.log("App sudah berjalan, melakukan restart...")
            self.run_command("pm2 restart myapp", cwd=self.install_path)
        else:
            self.log("Menjalankan app baru...")
            self.run_command(f'pm2 start npm --name "myapp" -- start -- --port={self.node_port}', cwd=self.install_path)
        
        self.run_command("pm2 save")
        self.log("Script berjalan dengan PM2!", "success")
        return True
    
    def update_application(self):
        self.log("=== MEMULAI UPDATE ===", "info")
        
        # Backup .env
        env_path = os.path.join(self.install_path, ".env")
        env_backup = os.path.join(self.install_path, ".env.backup")
        if os.path.exists(env_path):
            shutil.copy2(env_path, env_backup)
            self.log(".env file dibackup", "success")
        
        # Download ulang
        if self.download_and_extract():
            # Restore .env
            if os.path.exists(env_backup):
                shutil.copy2(env_backup, env_path)
                os.remove(env_backup)
                self.log(".env file direstore", "success")
            
            # Npm install
            self.run_npm_install()
            
            # Restart PM2
            self.run_command("pm2 restart myapp", cwd=self.install_path)
            self.log("=== UPDATE SELESAI ===", "success")
    
    def main(self):
        print(f"{Colors.CYAN}=== AUTO INSTALLER NODEJS APP ==={Colors.RESET}\n")
        
        # Input konfigurasi
        self.install_path = input("Masukkan lokasi install (C:\\myapp): ").strip()
        if not self.install_path:
            self.install_path = "C:\\myapp"
        
        Path(self.install_path).mkdir(parents=True, exist_ok=True)
        
        port_input = input(f"Masukkan port Node.js (default: {self.node_port}): ").strip()
        if port_input:
            self.node_port = int(port_input)
        
        mongo_input = input(f"Masukkan port MongoDB (default: {self.mongo_port}): ").strip()
        if mongo_input:
            self.mongo_port = int(mongo_input)
        
        self.zip_url = input("Masukkan URL download script (.zip): ").strip()
        
        # Proses instalasi
        if not self.check_nodejs():
            self.log("Gagal install Node.js", "error")
            return
        
        if not self.check_mongodb():
            self.log("Gagal install MongoDB", "error")
            return
        
        if not self.download_and_extract():
            return
        
        self.create_env_file()
        
        if not self.run_npm_install():
            return
        
        if not self.install_pm2():
            return
        
        if not self.run_with_pm2():
            return
        
        self.log("\n=== INSTALLASI SELESAI ===", "success")
        self.log(f"Aplikasi berjalan di http://localhost:{self.node_port}", "info")
        
        # Menu update
        update = input("\nApakah ingin update? (y/n): ").strip().lower()
        if update == 'y':
            self.update_application()

if __name__ == "__main__":
    installer = AutoInstaller()
    installer.main()