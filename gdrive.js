/**
 * VaultOne Google Drive Sync Module
 * Manages OAuth2 authorization and file backup/restore using Google Drive API (v3).
 * Supports both actual Google API and a simulated mock mode for instant evaluation.
 */

class GoogleDriveSync {
    constructor() {
        this.clientId = localStorage.getItem('gdrive_client_id') || '';
        this.accessToken = null;
        this.tokenClient = null;
        this.isMockMode = !this.clientId;
        this.isGapiLoaded = false;
        this.isGsiLoaded = false;
    }

    setClientId(clientId) {
        this.clientId = clientId;
        if (clientId) {
            localStorage.setItem('gdrive_client_id', clientId);
            this.isMockMode = false;
            this.initGis();
        } else {
            localStorage.removeItem('gdrive_client_id');
            this.isMockMode = true;
        }
    }

    // Load external Google scripts
    loadScripts(onReady) {
        if (this.isMockMode) {
            onReady();
            return;
        }

        // Load GIS (Google Identity Services)
        const gsiScript = document.createElement('script');
        gsiScript.src = 'https://accounts.google.com/gsi/client';
        gsiScript.async = true;
        gsiScript.defer = true;
        gsiScript.onload = () => {
            this.isGsiLoaded = true;
            this.initGis();
            if (this.isGapiLoaded && this.isGsiLoaded) onReady();
        };
        document.head.appendChild(gsiScript);

        // Load GAPI (Google API Client)
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.async = true;
        gapiScript.defer = true;
        gapiScript.onload = () => {
            gapi.load('client', async () => {
                await gapi.client.init({});
                this.isGapiLoaded = true;
                if (this.isGapiLoaded && this.isGsiLoaded) onReady();
            });
        };
        document.head.appendChild(gapiScript);
    }

    initGis() {
        if (!this.clientId || typeof google === 'undefined') return;
        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive.appdata',
            callback: (response) => {
                if (response.error !== undefined) {
                    console.error('OAuth 錯誤:', response);
                    return;
                }
                this.accessToken = response.access_token;
                if (this.authCallback) this.authCallback(this.accessToken);
            },
        });
    }

    // Authenticate and get token
    async authenticate() {
        if (this.isMockMode) {
            return this.simulateAuthentication();
        }

        return new Promise((resolve, reject) => {
            this.authCallback = (token) => resolve(token);
            if (this.accessToken) {
                resolve(this.accessToken);
                return;
            }
            if (!this.tokenClient) {
                reject(new Error("Google Identity Services 未初始化，請檢查 Client ID"));
                return;
            }
            // Request token (prompts user Google Sign-In)
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    // Backup to Google Drive
    async backup(encryptedDataString) {
        if (this.isMockMode) {
            return this.simulateBackup(encryptedDataString);
        }

        const token = await this.authenticate();
        
        // Find existing backup file in AppData folder
        const fileId = await this.findBackupFile(token);

        const metadata = {
            name: 'vaultone_backup.enc',
            mimeType: 'application/json',
        };

        if (!fileId) {
            // Create a new file
            metadata.parents = ['appDataFolder'];
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([encryptedDataString], { type: 'text/plain' }));

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: form
            });

            if (!response.ok) throw new Error("無法建立雲端備份檔案");
            return await response.json();
        } else {
            // Update existing file
            const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'text/plain'
                },
                body: encryptedDataString
            });

            if (!response.ok) throw new Error("無法更新雲端備份檔案");
            return await response.json();
        }
    }

    // Restore from Google Drive
    async restore() {
        if (this.isMockMode) {
            return this.simulateRestore();
        }

        const token = await this.authenticate();
        const fileId = await this.findBackupFile(token);

        if (!fileId) {
            throw new Error("在您的 Google 雲端硬碟中找不到 VaultOne 備份檔案");
        }

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("無法從雲端下載備份資料");
        return await response.text();
    }

    // Helper: Find file in appDataFolder
    async findBackupFile(token) {
        const query = encodeURIComponent("name = 'vaultone_backup.enc' and trashed = false");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("搜尋雲端檔案失敗");
        const result = await response.json();
        if (result.files && result.files.length > 0) {
            return result.files[0].id;
        }
        return null;
    }

    // --- MOCK SIMULATIONS FOR INSTANT EVALUATION ---

    async simulateAuthentication() {
        return new Promise((resolve) => {
            // Create a temporary beautiful modal for Google Account simulation
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6);
                display: flex; align-items: center; justify-content: center;
                z-index: 10000; font-family: sans-serif;
                backdrop-filter: blur(5px);
            `;
            modal.innerHTML = `
                <div style="background: #ffffff; width: 340px; padding: 24px; border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.25); text-align: center;">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_Color_Logo.svg" alt="Google" style="height: 32px; margin-bottom: 16px;">
                    <h3 style="margin: 0 0 8px 0; color: #1f1f1f; font-size: 18px; font-weight: 500;">使用 Google 帳戶登入</h3>
                    <p style="margin: 0 0 20px 0; color: #5f6368; font-size: 13px;">將備份儲存至您的雲端硬碟隱藏資料夾</p>
                    <div style="border: 1px solid #dadce0; border-radius: 8px; padding: 12px; display: flex; align-items: center; cursor: pointer; text-align: left; margin-bottom: 20px;" id="mock-profile">
                        <div style="width: 36px; height: 36px; background: #e8f0fe; color: #1a73e8; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px;">S</div>
                        <div>
                            <div style="font-size: 14px; font-weight: 500; color: #3c4043;">Samsung User</div>
                            <div style="font-size: 12px; color: #5f6368;">s26.user@gmail.com</div>
                        </div>
                    </div>
                    <button style="width: 100%; padding: 10px; background: #1a73e8; color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px; margin-bottom: 8px;" id="mock-login-btn">以 Samsung User 身分登入</button>
                    <button style="width: 100%; padding: 10px; background: transparent; color: #5f6368; border: 1px solid #dadce0; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px;" id="mock-cancel-btn">取消</button>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('#mock-login-btn').onclick = () => {
                document.body.removeChild(modal);
                this.accessToken = "mock_access_token_123456";
                resolve(this.accessToken);
            };

            modal.querySelector('#mock-cancel-btn').onclick = () => {
                document.body.removeChild(modal);
                resolve(null);
            };

            modal.querySelector('#mock-profile').onclick = () => {
                modal.querySelector('#mock-login-btn').click();
            };
        });
    }

    async simulateBackup(encryptedDataString) {
        const token = await this.authenticate();
        if (!token) throw new Error("使用者取消 Google 登入");
        
        return new Promise((resolve) => {
            setTimeout(() => {
                localStorage.setItem('gdrive_mock_backup_file', encryptedDataString);
                localStorage.setItem('gdrive_mock_backup_date', new Date().toISOString());
                resolve({ id: "mock_gdrive_file_id_789", name: "vaultone_backup.enc" });
            }, 1000); // Simulate network latency
        });
    }

    async simulateRestore() {
        const token = await this.authenticate();
        if (!token) throw new Error("使用者取消 Google 登入");

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                const encryptedDataString = localStorage.getItem('gdrive_mock_backup_file');
                if (!encryptedDataString) {
                    reject(new Error("在您的 Google 雲端硬碟中找不到 VaultOne 備份檔案"));
                } else {
                    resolve(encryptedDataString);
                }
            }, 1000); // Simulate network latency
        });
    }

    // Check if cloud backup exists (returns string date or null)
    getMockBackupInfo() {
        if (this.isMockMode) {
            const date = localStorage.getItem('gdrive_mock_backup_date');
            return date ? new Date(date).toLocaleString('zh-TW') : null;
        }
        return "雲端 API 模式已啟用";
    }
}

window.GoogleDriveSync = new GoogleDriveSync();
