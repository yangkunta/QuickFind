/**
 * VaultOne Main Application Logic
 * Manages State, UI rendering, event listeners, auto-lock, and interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // PWA Service Worker Registration & Install
    // ==========================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered:', reg))
                .catch(err => console.log('SW registration failed:', err));
        });
    }

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        const btnInstallApp = document.getElementById('btn-install-app');
        const installSectionTitle = document.getElementById('install-section-title');
        const installSectionGroup = document.getElementById('install-section-group');
        
        if (btnInstallApp && installSectionTitle && installSectionGroup) {
            installSectionTitle.style.display = 'block';
            installSectionGroup.style.display = 'block';
            
            btnInstallApp.onclick = async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        installSectionTitle.style.display = 'none';
                        installSectionGroup.style.display = 'none';
                    }
                    deferredPrompt = null;
                }
            };
        }
    });

    // --- Application State ---
    let vaultRecords = [];
    let masterPassword = ''; // In-memory cache while app is unlocked
    let currentRecordForDetail = null;
    let autoLockTimer = null;
    const AUTO_LOCK_TIMEOUT = 60000; // 60 seconds of inactivity
    let isShowingAll = false; // Controls default empty state
    let csvPreviewData = []; // Holds CSV data during preview

    // --- DOM Elements ---
    // Screens
    const lockScreen = document.getElementById('lock-screen');
    const mainVaultView = document.getElementById('main-vault-view');
    const mainSettingsView = document.getElementById('main-settings-view');
    
    // Lock Screen Elements
    const lockScreenTitle = document.getElementById('lock-screen-title');
    const lockScreenSubtitle = document.getElementById('lock-screen-subtitle');
    const lockStateActive = document.getElementById('lock-state-active');
    const lockStateInput = document.getElementById('lock-state-input');
    const lockPasswordInput = document.getElementById('lock-password-input');
    const lockPwdToggle = document.getElementById('lock-pwd-toggle');
    const lockSubmitBtn = document.getElementById('lock-submit-btn');
    const fingerprintBtn = document.getElementById('fingerprint-btn');
    const pwdFallbackBtn = document.getElementById('pwd-fallback-btn');
    const biometricBackBtn = document.getElementById('biometric-back-btn');

    // Vault Main UI Elements
    const pageTitle = document.getElementById('page-title');
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const showAllBtn = document.getElementById('show-all-btn');
    const vaultRecordsList = document.getElementById('vault-records-list');
    const addFab = document.getElementById('add-fab');

    // Bottom Navigation Tabs
    const tabVault = document.getElementById('tab-vault');
    const tabMaint = document.getElementById('tab-maint');
    const tabSettings = document.getElementById('tab-settings');

    // Add/Edit Bottom Sheet
    const addSheetOverlay = document.getElementById('add-sheet-overlay');
    const addSheet = document.getElementById('add-sheet');
    const addSheetTitle = document.getElementById('add-sheet-title');
    const closeAddSheet = document.getElementById('close-add-sheet');
    const addRecordForm = document.getElementById('add-record-form');
    const recordIdInput = document.getElementById('record-id');
    const recordCategory = document.getElementById('record-category');
    const recordNotes = document.getElementById('record-notes');
    const recordDescription = document.getElementById('record-description');
    const saveRecordBtn = document.getElementById('save-record-btn');

    // Detail View Bottom Sheet
    const detailSheetOverlay = document.getElementById('detail-sheet-overlay');
    const detailSheet = document.getElementById('detail-sheet');
    const closeDetailSheet = document.getElementById('close-detail-sheet');
    const detailCardIcon = document.getElementById('detail-card-icon');
    const detailTitle = document.getElementById('detail-title');
    const detailNotes = document.getElementById('detail-notes');
    const detailDescription = document.getElementById('detail-description');
    const detailEditBtn = document.getElementById('detail-edit-btn');
    const detailDeleteBtn = document.getElementById('detail-delete-btn');

    // Auth Verification Prompt Sheet
    const authPromptOverlay = document.getElementById('auth-prompt-overlay');
    const authPromptSheet = document.getElementById('auth-prompt-sheet');
    const closeAuthPrompt = document.getElementById('close-auth-prompt');
    const authPromptPassword = document.getElementById('auth-prompt-password');
    const authPromptSubmitBtn = document.getElementById('auth-prompt-submit-btn');
    const authPromptMsg = document.getElementById('auth-prompt-msg');
    let pendingAuthCallback = null; // Stores action to take after auth verify

    // Settings Panel Elements
    const settingClientId = document.getElementById('setting-client-id');
    const saveClientIdBtn = document.getElementById('save-client-id-btn');
    const btnCloudBackup = document.getElementById('btn-cloud-backup');
    const btnCloudRestore = document.getElementById('btn-cloud-restore');
    const cloudBackupInfo = document.getElementById('cloud-backup-info');
    const btnLocalExport = document.getElementById('btn-local-export');
    const localImportFile = document.getElementById('local-import-file');
    const csvImportFile = document.getElementById('csv-import-file');
    const btnChangePwd = document.getElementById('btn-change-pwd');
    const btnResetVault = document.getElementById('btn-reset-vault');

    // CSV Preview Sheet
    const csvPreviewOverlay = document.getElementById('csv-preview-overlay');
    const csvPreviewSheet = document.getElementById('csv-preview-sheet');
    const closeCsvPreview = document.getElementById('close-csv-preview');
    const csvPreviewCount = document.getElementById('csv-preview-count');
    const csvPreviewList = document.getElementById('csv-preview-list');
    const csvSelectAllBtn = document.getElementById('csv-select-all-btn');
    const csvImportSubmitBtn = document.getElementById('csv-import-submit-btn');

    // Toast
    const toastMsg = document.getElementById('toast-msg');

    // --- Core Helper Functions ---

    // Display a quick One UI Toast notification
    function showToast(text, duration = 2000) {
        toastMsg.innerText = text;
        toastMsg.classList.add('show');
        setTimeout(() => {
            toastMsg.classList.remove('show');
        }, duration);
    }

    // Check if vault is initialized
    function isVaultInitialized() {
        return localStorage.getItem('vaultone_db') !== null;
    }

    // Check if biometric (Quick Unlock) is available (requires password cached in sessionStorage)
    function isBiometricSessionAvailable() {
        return sessionStorage.getItem('vaultone_cached_pwd') !== null;
    }

    // Save Master Password in temporary session storage (wiped when tab closes)
    function cachePasswordInSession(password) {
        sessionStorage.setItem('vaultone_cached_pwd', password);
    }

    // --- Onboarding & Lock Screen Management ---

    function initLockScreen() {
        lockPasswordInput.value = '';
        if (!isVaultInitialized()) {
            // First time setup
            lockScreenTitle.innerText = "設定主密碼";
            lockScreenSubtitle.innerText = "請建立您的主金庫加密密碼 (請務必記住)";
            lockStateActive.style.display = 'none';
            lockStateInput.style.display = 'flex';
            lockSubmitBtn.innerText = "建立新保險箱";
            biometricBackBtn.style.display = 'none';
        } else if (isBiometricSessionAvailable()) {
            // Biometrics is set up and cached (Quick Unlock is active)
            lockScreenTitle.innerText = "VaultOne 鎖定中";
            lockScreenSubtitle.innerText = "使用三星 S26 螢幕指紋快速解鎖";
            lockStateActive.style.display = 'flex';
            lockStateInput.style.display = 'none';
            biometricBackBtn.style.display = 'none';
        } else {
            // Needs master password (session expired or first run)
            lockScreenTitle.innerText = "VaultOne 鎖定中";
            lockScreenSubtitle.innerText = "請輸入主密碼以解鎖您的保險箱";
            lockStateActive.style.display = 'none';
            lockStateInput.style.display = 'flex';
            lockSubmitBtn.innerText = "解鎖保險箱";
            biometricBackBtn.style.display = 'none';
        }
        
        lockScreen.classList.remove('unlock-anim');
    }

    // Setup or Unlock Action
    async function handleUnlock() {
        const enteredPassword = lockPasswordInput.value;
        if (!enteredPassword) {
            showToast("請輸入密碼！");
            return;
        }

        if (!isVaultInitialized()) {
            // Create a new empty vault
            try {
                masterPassword = enteredPassword;
                vaultRecords = [];
                // Save empty records
                await saveVaultToStorage(enteredPassword);
                cachePasswordInSession(enteredPassword);
                
                showToast("保險箱初始化成功！");
                unlockApp();
            } catch (e) {
                showToast("初始化錯誤，請重試");
                console.error(e);
            }
        } else {
            // Decrypt existing vault
            const dbData = JSON.parse(localStorage.getItem('vaultone_db'));
            try {
                const decryptedStr = await window.VaultCrypto.decryptVault(
                    dbData.ciphertext,
                    dbData.iv,
                    dbData.salt,
                    enteredPassword
                );
                
                masterPassword = enteredPassword;
                vaultRecords = JSON.parse(decryptedStr);
                cachePasswordInSession(enteredPassword);
                
                showToast("解鎖成功！");
                unlockApp();
            } catch (e) {
                showToast("解鎖失敗：密碼錯誤！");
                lockPasswordInput.value = '';
            }
        }
    }

    // Unlock transition animation
    function unlockApp() {
        lockScreen.classList.add('unlock-anim');
        resetAutoLockTimer();
        renderRecords();
        updateGoogleDriveUI();
    }

    // Lock the app
    function lockApp() {
        masterPassword = '';
        vaultRecords = [];
        // Optional: Keep sessionStorage so fingerprint works, but lock standard view
        initLockScreen();
    }

    // Simulated fingerprint recognition with S26 tactile feedback feeling
    function triggerSimulatedFingerprint() {
        if (!isBiometricSessionAvailable()) {
            showToast("指紋金鑰過期，請使用主密碼解鎖");
            pwdFallbackBtn.click();
            return;
        }
        
        showToast("指紋辨識中...");
        setTimeout(async () => {
            const cachedPwd = sessionStorage.getItem('vaultone_cached_pwd');
            const dbData = JSON.parse(localStorage.getItem('vaultone_db'));
            
            try {
                const decryptedStr = await window.VaultCrypto.decryptVault(
                    dbData.ciphertext,
                    dbData.iv,
                    dbData.salt,
                    cachedPwd
                );
                masterPassword = cachedPwd;
                vaultRecords = JSON.parse(decryptedStr);
                
                showToast("指紋辨識完成");
                unlockApp();
            } catch (e) {
                showToast("指紋解鎖失敗，請輸入主密碼");
                sessionStorage.removeItem('vaultone_cached_pwd');
                pwdFallbackBtn.click();
            }
        }, 800); // 800ms scanning delay
    }

    // --- Auto-Lock Mechanism ---

    function resetAutoLockTimer() {
        if (autoLockTimer) clearTimeout(autoLockTimer);
        // Only trigger auto lock if we are actually unlocked (lock screen hidden)
        if (lockScreen.classList.contains('unlock-anim')) {
            autoLockTimer = setTimeout(() => {
                lockApp();
                showToast("閒置逾時，保險箱已鎖定");
            }, AUTO_LOCK_TIMEOUT);
        }
    }

    // Reset timer on user activity
    ['click', 'touchstart', 'scroll', 'keypress'].forEach(evt => {
        window.addEventListener(evt, resetAutoLockTimer);
    });

    // Background lock: lock app instantly when user switches apps or minimizes
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            lockApp();
        }
    });

    // --- Vault Database Storage ---

    async function saveVaultToStorage(password) {
        const jsonStr = JSON.stringify(vaultRecords);
        const encrypted = await window.VaultCrypto.encryptVault(jsonStr, password);
        localStorage.setItem('vaultone_db', JSON.stringify(encrypted));
    }

    // Helper: Smart icon selection based on category/notes
    function getSmartIcon(category, notes) {
        const cat = (category || '').toLowerCase();
        const n = (notes || '').toLowerCase();
        if (cat.includes('卡') || cat.includes('card') || cat.includes('bank') || cat.includes('銀行') || cat.includes('金融') || cat.includes('pay')) {
            return 'credit_card';
        }
        if (cat.includes('帳密') || cat.includes('密碼') || cat.includes('password') || cat.includes('login') || cat.includes('登入')) {
            return 'vpn_key';
        }
        if (n.includes('mail') || n.includes('信箱') || n.includes('郵件') || n.includes('gmail') || n.includes('outlook') || n.includes('yahoo')) {
            return 'mail';
        }
        if (n.includes('google') || n.includes('facebook') || n.includes('line') || n.includes('apple') || n.includes('microsoft')) {
            return 'account_circle';
        }
        return 'description'; // Default notes icon
    }

    // --- UI Rendering ---

    function renderRecords(filterText = '') {
        vaultRecordsList.innerHTML = '';
        const normalizedFilter = filterText.toLowerCase().trim();

        if (!normalizedFilter && !isShowingAll) {
            vaultRecordsList.innerHTML = `
                <div style="text-align: center; padding: 48px 0; color: var(--text-muted);">
                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 8px; display: block;">search</span>
                    請輸入關鍵字，或點擊「全部」顯示所有資料
                </div>
            `;
            return;
        }

        // Filter records
        const filtered = vaultRecords.filter(rec => {
            if (normalizedFilter) {
                const categoryMatch = (rec.category || '').toLowerCase().includes(normalizedFilter);
                const notesMatch = (rec.notes || '').toLowerCase().includes(normalizedFilter);
                const descMatch = (rec.description || '').toLowerCase().includes(normalizedFilter);
                return categoryMatch || notesMatch || descMatch;
            }
            return true;
        });

        if (filtered.length === 0) {
            vaultRecordsList.innerHTML = `
                <div style="text-align: center; padding: 48px 0; color: var(--text-muted);">
                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 8px; display: block;">no_accounts</span>
                    無符合條件的保險箱紀錄
                </div>
            `;
            return;
        }

        // Sort alphabetically by category, then by updated date
        filtered.sort((a, b) => {
            const catCompare = (a.category || '').localeCompare(b.category || '', 'zh-TW', { sensitivity: 'accent' });
            if (catCompare !== 0) return catCompare;
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });

        const cardGroup = document.createElement('div');
        cardGroup.className = 'card-group';

        filtered.forEach(rec => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.onclick = () => showDetailSheet(rec);

            const displayIcon = getSmartIcon(rec.category, rec.notes);
            
            // Subtitle logic
            const subtitleText = truncateString(rec.description || '無詳細說明', 25);
            const mainTitle = rec.notes ? rec.notes.split('\n')[0].substring(0, 20) : '(無標題)';

            const isMaintMode = document.body.classList.contains('maintenance-mode');

            // Action buttons
            let actionButtonsHtml = '';
            if (isMaintMode) {
                actionButtonsHtml = `
                    <button class="copy-btn maint-edit-btn" data-id="${rec.id}" title="編輯">
                        <span class="material-symbols-rounded" style="font-size: 18px; color: var(--accent-blue);">edit</span>
                    </button>
                    <button class="copy-btn maint-delete-btn" data-id="${rec.id}" title="刪除">
                        <span class="material-symbols-rounded" style="font-size: 18px; color: var(--accent-red);">delete</span>
                    </button>
                `;
            } else {
                actionButtonsHtml = `
                    <button class="copy-btn copy-shortcut-btn" data-type="notes" data-id="${rec.id}" title="複製備註">
                        <span class="material-symbols-rounded" style="font-size: 18px;">content_copy</span>
                    </button>
                `;
            }

            item.innerHTML = `
                <div class="item-left">
                    <div class="item-icon" style="background-color: rgba(62, 130, 252, 0.08);">
                        <span class="material-symbols-rounded">${displayIcon}</span>
                    </div>
                    <div class="item-details" style="display: flex; flex-direction: column; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="item-title">${escapeHTML(mainTitle)}</span>
                            <span style="font-size: 10px; background: rgba(255, 255, 255, 0.1); color: var(--text-secondary); padding: 1px 6px; border-radius: 8px;">${escapeHTML(rec.category || '未分類')}</span>
                        </div>
                        <div class="item-username">${subtitleText}</div>
                    </div>
                </div>
                <div class="item-right" onclick="event.stopPropagation();">
                    ${actionButtonsHtml}
                </div>
            `;
            cardGroup.appendChild(item);
        });

        vaultRecordsList.appendChild(cardGroup);

        // Add copy-shortcut event listeners
        document.querySelectorAll('.copy-shortcut-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const record = vaultRecords.find(r => r.id === id);
                if (!record) return;
                copyToClipboard(record.notes, "備註已複製");
            };
        });

        // Add maintenance action event listeners
        document.querySelectorAll('.maint-edit-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const record = vaultRecords.find(r => r.id === id);
                if (record) showAddSheet(record);
            };
        });
        
        document.querySelectorAll('.maint-delete-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const record = vaultRecords.find(r => r.id === id);
                if (record) {
                    currentRecordForDetail = record;
                    handleDeleteRecord();
                }
            };
        });
    }

    // --- Bottom Sheet Modal Handlers ---

    // Open Bottom Sheet helper
    function openBottomSheet(overlay, sheet) {
        overlay.classList.add('active');
        sheet.classList.add('active');
        resetAutoLockTimer();
    }

    // Close Bottom Sheet helper
    function closeBottomSheet(overlay, sheet) {
        overlay.classList.remove('active');
        sheet.classList.remove('active');
        resetAutoLockTimer();
    }

    // Open Add / Edit sheet
    function showAddSheet(record = null) {
        addRecordForm.reset();
        
        // Reset scroll position to top
        const sheetBody = addSheet.querySelector('.bottom-sheet-body');
        if (sheetBody) sheetBody.scrollTop = 0;

        if (record) {
            // Edit mode
            addSheetTitle.innerText = "編輯安全紀錄";
            recordIdInput.value = record.id;
            recordCategory.value = record.category || '';
            recordNotes.value = record.notes || '';
            recordDescription.value = record.description || '';
        } else {
            // Create mode
            addSheetTitle.innerText = "新增安全紀錄";
            recordIdInput.value = '';
            recordCategory.value = '';
            recordNotes.value = '';
            recordDescription.value = '';
        }

        openBottomSheet(addSheetOverlay, addSheet);
        recordCategory.focus();
    }

    // Detail sheet presentation
    function showDetailSheet(record) {
        currentRecordForDetail = record;
        
        // Reset scroll position to top
        const detailBody = detailSheet.querySelector('.bottom-sheet-body');
        if (detailBody) detailBody.scrollTop = 0;

        let displayTitle = record.notes ? record.notes.split('\n')[0].substring(0, 20) : "無標題";

        detailTitle.innerHTML = `${escapeHTML(displayTitle)} <span style="font-size:11px; font-weight:500; background:rgba(62, 130, 252, 0.15); color:var(--accent-blue); padding:3px 8px; border-radius:12px; margin-left:8px; vertical-align:middle;">${escapeHTML(record.category || '未分類')}</span>`;
        detailNotes.innerText = record.notes || "無備註內容";
        detailDescription.innerText = record.description || "無詳細說明";

        const displayIcon = getSmartIcon(record.category, record.notes);
        detailCardIcon.innerHTML = `<span class="material-symbols-rounded">${displayIcon}</span>`;

        openBottomSheet(detailSheetOverlay, detailSheet);
    }

    // Sensitive Operation Verification
    function verifyIdentity(msg, callback) {
        authPromptMsg.innerText = msg;
        authPromptPassword.value = '';
        pendingAuthCallback = callback;
        openBottomSheet(authPromptOverlay, authPromptSheet);
        authPromptPassword.focus();
    }

    // --- Action Handlers ---

    // Save/Update Record
    async function handleSaveRecord(e) {
        if (e) e.preventDefault();
        const id = recordIdInput.value;
        const category = recordCategory.value;
        const notes = recordNotes.value.trim();
        const description = recordDescription.value.trim();

        if (id) {
            // Update
            const index = vaultRecords.findIndex(r => r.id === id);
            if (index !== -1) {
                vaultRecords[index] = {
                    ...vaultRecords[index],
                    category,
                    notes,
                    description,
                    updatedAt: new Date().toISOString()
                };
            }
        } else {
            // Create
            const newRecord = {
                id: generateId(),
                category,
                notes,
                description,
                updatedAt: new Date().toISOString()
            };
            vaultRecords.push(newRecord);
        }

        try {
            await saveVaultToStorage(masterPassword);
            showToast("已成功儲存！");
            closeBottomSheet(addSheetOverlay, addSheet);
            renderRecords(searchInput.value);
        } catch (e) {
            showToast("儲存失敗！");
            console.error(e);
        }
    }

    // Delete Record
    function handleDeleteRecord() {
        if (!currentRecordForDetail) return;
        
        verifyIdentity(`確認刪除「${currentRecordForDetail.title}」？此操作無法還原。`, async () => {
            vaultRecords = vaultRecords.filter(r => r.id !== currentRecordForDetail.id);
            try {
                await saveVaultToStorage(masterPassword);
                showToast("已刪除紀錄");
                closeBottomSheet(detailSheetOverlay, detailSheet);
                renderRecords(searchInput.value);
            } catch (e) {
                showToast("刪除失敗");
            }
        });
    }

    // Password generator function
    function generateRandomPassword() {
        const length = 16;
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
        let retVal = "";
        const values = new Uint32Array(length);
        window.crypto.getRandomValues(values);
        for (let i = 0, l = charset.length; i < length; ++i) {
            retVal += charset[values[i] % l];
        }
        recordPassword.value = retVal;
        checkPasswordStrength(retVal);
        showToast("已產生高強度密碼");
    }

    // Password Strength Checker
    function checkPasswordStrength(pwd) {
        if (!pwd) {
            strengthContainer.style.display = 'none';
            return;
        }
        strengthContainer.style.display = 'block';
        
        let score = 0;
        if (pwd.length >= 8) score++;
        if (pwd.length >= 14) score++;
        if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;

        const bars = [document.getElementById('bar-1'), document.getElementById('bar-2'), document.getElementById('bar-3'), document.getElementById('bar-4')];
        bars.forEach(bar => {
            bar.style.backgroundColor = 'var(--border-color)';
        });

        let labelText = '';
        let labelColor = '';
        
        if (score <= 1) {
            labelText = '密碼強度：非常薄弱 ⚠️';
            labelColor = 'var(--accent-red)';
            bars[0].style.backgroundColor = 'var(--accent-red)';
        } else if (score === 2 || score === 3) {
            labelText = '密碼強度：中等';
            labelColor = 'var(--accent-yellow)';
            bars[0].style.backgroundColor = 'var(--accent-yellow)';
            bars[1].style.backgroundColor = 'var(--accent-yellow)';
            bars[2].style.backgroundColor = 'var(--accent-yellow)';
        } else {
            labelText = '密碼強度：極強安全';
            labelColor = 'var(--accent-green)';
            bars.forEach(bar => bar.style.backgroundColor = 'var(--accent-green)');
        }

        strengthLabel.innerText = labelText;
        strengthLabel.style.color = labelColor;
    }

    // --- Google Drive Backup / Restore UI Interactions ---

    function updateGoogleDriveUI() {
        const info = window.GoogleDriveSync.getMockBackupInfo();
        cloudBackupInfo.innerText = info ? `上次備份：${info}` : "未曾備份過";
        settingClientId.value = window.GoogleDriveSync.clientId;
    }

    async function handleCloudBackup() {
        try {
            showToast("正在加密金庫並上傳到雲端...");
            // The JSON in localStorage is already encrypted. We upload the encrypted string.
            const encryptedPayload = localStorage.getItem('vaultone_db');
            if (!encryptedPayload) {
                showToast("無本地保險箱資料可供備份");
                return;
            }

            await window.GoogleDriveSync.backup(encryptedPayload);
            showToast("雲端備份成功！");
            updateGoogleDriveUI();
        } catch (e) {
            showToast(e.message || "雲端備份失敗");
        }
    }

    async function handleCloudRestore() {
        verifyIdentity("確認從雲端還原？此操作將覆蓋您目前手機上的資料。", async () => {
            try {
                showToast("正在下載雲端備份...");
                const encryptedPayload = await window.GoogleDriveSync.restore();
                
                // Let's verify decryption of the downloaded file with current master password
                const dbData = JSON.parse(encryptedPayload);
                const decryptedStr = await window.VaultCrypto.decryptVault(
                    dbData.ciphertext,
                    dbData.iv,
                    dbData.salt,
                    masterPassword
                );

                // Success! Write to local storage and update memory
                localStorage.setItem('vaultone_db', encryptedPayload);
                vaultRecords = JSON.parse(decryptedStr);
                
                showToast("從雲端還原成功！");
                renderRecords(searchInput.value);
            } catch (e) {
                showToast(e.message || "雲端還原失敗，可能密碼不同或無雲端備份");
            }
        });
    }

    // --- Local Backup / Import Interactions ---

    function handleLocalExport() {
        const encryptedPayload = localStorage.getItem('vaultone_db');
        if (!encryptedPayload) {
            showToast("沒有保險箱資料可以匯出");
            return;
        }

        const blob = new Blob([encryptedPayload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vaultone_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("加密備份檔案匯出成功");
    }

    function handleLocalImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = event.target.result;
                const dbData = JSON.parse(content);
                
                // Verify structure
                if (!dbData.ciphertext || !dbData.iv || !dbData.salt) {
                    throw new Error("無效的備份檔案格式");
                }

                verifyIdentity("匯入此備份會覆蓋目前的所有保險箱紀錄。請輸入目前的主密碼以驗證：", async () => {
                    try {
                        // Check if we can decrypt it with the entered password
                        const decryptedStr = await window.VaultCrypto.decryptVault(
                            dbData.ciphertext,
                            dbData.iv,
                            dbData.salt,
                            masterPassword
                        );

                        // Save to storage
                        localStorage.setItem('vaultone_db', content);
                        vaultRecords = JSON.parse(decryptedStr);
                        
                        showToast("本地檔案匯入並還原成功！");
                        renderRecords(searchInput.value);
                    } catch (err) {
                        showToast("還原失敗：此備份檔的加密主密碼與目前密碼不相符！");
                    }
                });
            } catch (err) {
                showToast("匯入失敗：檔案格式不正確！");
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset file input
    }

    function handleCsvImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target.result;
                const lines = parseCSVText(csvText);
                csvPreviewData = [];

                for (let i = 0; i < lines.length; i++) {
                    const cols = lines[i];
                    if (cols.length >= 1 && cols.some(c => c.trim())) {
                        csvPreviewData.push({
                            category: (cols[0] || '').trim(),
                            notes: (cols[1] || '').trim(),
                            description: (cols[2] || '').trim(),
                            selected: true // Default to selected
                        });
                    }
                }

                if (csvPreviewData.length > 0) {
                    showCsvPreviewSheet();
                } else {
                    showToast("找不到有效資料匯入");
                }
            } catch (err) {
                showToast("匯入失敗：檔案格式不正確！");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function showCsvPreviewSheet() {
        csvPreviewCount.innerText = `找到 ${csvPreviewData.length} 筆資料`;
        renderCsvPreviewList();
        openBottomSheet(csvPreviewOverlay, csvPreviewSheet);
    }

    function renderCsvPreviewList() {
        csvPreviewList.innerHTML = '';
        csvPreviewData.forEach((item, index) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '12px';
            div.style.padding = '12px';
            div.style.background = 'var(--bg-secondary)';
            div.style.borderRadius = '12px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.selected;
            checkbox.style.width = '20px';
            checkbox.style.height = '20px';
            checkbox.onchange = (e) => {
                item.selected = e.target.checked;
            };

            const content = document.createElement('div');
            content.style.flex = '1';
            content.style.overflow = 'hidden';
            
            const title = item.notes ? item.notes.split('\n')[0].substring(0, 20) : '(無標題)';
            content.innerHTML = `
                <div style="font-weight: 500; font-size: 14px; margin-bottom: 2px;">${escapeHTML(title)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">分類: ${escapeHTML(item.category || '未分類')}</div>
            `;

            div.appendChild(checkbox);
            div.appendChild(content);
            csvPreviewList.appendChild(div);
        });
    }

    if (csvSelectAllBtn) {
        csvSelectAllBtn.onclick = () => {
            const anyUnselected = csvPreviewData.some(item => !item.selected);
            csvPreviewData.forEach(item => item.selected = anyUnselected);
            renderCsvPreviewList();
        };
    }

    if (csvImportSubmitBtn) {
        csvImportSubmitBtn.onclick = () => {
            const selectedData = csvPreviewData.filter(item => item.selected);
            if (selectedData.length === 0) {
                showToast("請至少勾選一筆資料！");
                return;
            }

            verifyIdentity(`確定匯入選取的 ${selectedData.length} 筆資料？`, async () => {
                selectedData.forEach(item => {
                    vaultRecords.push({
                        id: generateId(),
                        category: item.category,
                        notes: item.notes,
                        description: item.description,
                        updatedAt: new Date().toISOString()
                    });
                });

                try {
                    await saveVaultToStorage(masterPassword);
                    showToast(`成功匯入 ${selectedData.length} 筆資料！`);
                    closeBottomSheet(csvPreviewOverlay, csvPreviewSheet);
                    if (pageTitle.innerText === "查詢" || pageTitle.innerText === "維護") {
                        renderRecords(searchInput.value);
                    }
                } catch (e) {
                    showToast("儲存失敗！");
                }
            });
        };
    }

    function parseCSVText(text) {
        let ret = [];
        let curRow = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i+1];
            
            if (inQuote) {
                if (char === '"') {
                    if (nextChar === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuote = false;
                    }
                } else {
                    cur += char;
                }
            } else {
                if (char === '"') {
                    inQuote = true;
                } else if (char === ',') {
                    curRow.push(cur);
                    cur = '';
                } else if (char === '\n' || char === '\r') {
                    if (char === '\r' && nextChar === '\n') i++;
                    curRow.push(cur);
                    if (curRow.some(c => c)) ret.push(curRow);
                    curRow = [];
                    cur = '';
                } else {
                    cur += char;
                }
            }
        }
        curRow.push(cur);
        if (curRow.some(c => c)) ret.push(curRow);
        return ret;
    }

    // Change Master Password
    function handleChangePassword() {
        verifyIdentity("為安全起見，請先驗證目前的主密碼：", () => {
            // Prompt for new password
            const newPassword = prompt("請輸入您的新主密碼：");
            if (!newPassword) {
                showToast("變更取消");
                return;
            }
            if (newPassword.length < 4) {
                showToast("密碼強度過低，請輸入較長密碼");
                return;
            }

            setTimeout(async () => {
                try {
                    masterPassword = newPassword;
                    cachePasswordInSession(newPassword);
                    await saveVaultToStorage(newPassword);
                    showToast("主密碼已變更，資料已重新加密");
                } catch (e) {
                    showToast("主密碼變更失敗");
                }
            }, 100);
        });
    }

    // Wipe all data
    function handleWipeVault() {
        const doubleCheck = confirm("警告：此操作會完全清除手機上的保險箱資料。您確定要繼續嗎？");
        if (!doubleCheck) return;

        verifyIdentity("請輸入您的主密碼以授權完全清除：", () => {
            localStorage.clear();
            sessionStorage.clear();
            showToast("所有本地資料已安全擦除");
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        });
    }

    // --- EVENT LISTENERS & TRIGGERS ---

    // Lock screen triggers
    lockSubmitBtn.onclick = handleUnlock;
    lockPasswordInput.onkeypress = (e) => { if (e.key === 'Enter') handleUnlock(); };
    fingerprintBtn.onclick = triggerSimulatedFingerprint;
    
    pwdFallbackBtn.onclick = () => {
        lockStateActive.style.display = 'none';
        lockStateInput.style.display = 'flex';
        if (isBiometricSessionAvailable()) {
            biometricBackBtn.style.display = 'inline';
        }
    };
    
    biometricBackBtn.onclick = () => {
        lockStateActive.style.display = 'flex';
        lockStateInput.style.display = 'none';
        biometricBackBtn.style.display = 'none';
    };

    lockPwdToggle.onclick = () => {
        const isPwd = lockPasswordInput.type === 'password';
        lockPasswordInput.type = isPwd ? 'text' : 'password';
        lockPwdToggle.innerHTML = `<span class="material-symbols-rounded">${isPwd ? 'visibility_off' : 'visibility'}</span>`;
    };

    // Tabs switching
    function switchTab(tabName) {
        tabVault.classList.remove('active');
        if (tabMaint) tabMaint.classList.remove('active');
        tabSettings.classList.remove('active');
        
        mainVaultView.style.display = 'none';
        mainSettingsView.style.display = 'none';
        
        if (tabName === 'vault') {
            tabVault.classList.add('active');
            mainVaultView.style.display = 'flex';
            document.body.classList.remove('maintenance-mode');
            pageTitle.innerText = "查詢";
            isShowingAll = false;
            searchInput.value = '';
            searchClearBtn.style.display = 'none';
            renderRecords('');
        } else if (tabName === 'maint') {
            if (tabMaint) tabMaint.classList.add('active');
            mainVaultView.style.display = 'flex';
            document.body.classList.add('maintenance-mode');
            pageTitle.innerText = "維護";
            isShowingAll = false;
            searchInput.value = '';
            searchClearBtn.style.display = 'none';
            renderRecords('');
        } else if (tabName === 'settings') {
            tabSettings.classList.add('active');
            mainSettingsView.style.display = 'flex';
            updateGoogleDriveUI();
        }
    }

    tabVault.onclick = () => switchTab('vault');
    if (tabMaint) tabMaint.onclick = () => switchTab('maint');
    tabSettings.onclick = () => switchTab('settings');

    // Search functionality
    searchInput.oninput = () => {
        const val = searchInput.value;
        searchClearBtn.style.display = val ? 'block' : 'none';
        isShowingAll = false;
        renderRecords(val);
    };

    searchClearBtn.onclick = () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        isShowingAll = false;
        renderRecords('');
        searchInput.focus();
    };

    if (showAllBtn) {
        showAllBtn.onclick = () => {
            searchInput.value = '';
            searchClearBtn.style.display = 'none';
            isShowingAll = true;
            renderRecords('');
        };
    }

    // Add Record Sheet Open/Close
    addFab.onclick = () => showAddSheet(null);
    closeAddSheet.onclick = () => closeBottomSheet(addSheetOverlay, addSheet);
    addSheetOverlay.onclick = (e) => {
        if (e.target === addSheetOverlay) closeBottomSheet(addSheetOverlay, addSheet);
    };
    // Action handlers end

    addRecordForm.onsubmit = handleSaveRecord;

    // Detail Sheet Open/Close
    closeDetailSheet.onclick = () => closeBottomSheet(detailSheetOverlay, detailSheet);
    detailSheetOverlay.onclick = (e) => {
        if (e.target === detailSheetOverlay) closeBottomSheet(detailSheetOverlay, detailSheet);
    };

    if (closeCsvPreview) {
        closeCsvPreview.onclick = () => closeBottomSheet(csvPreviewOverlay, csvPreviewSheet);
    }
    if (csvPreviewOverlay) {
        csvPreviewOverlay.onclick = (e) => {
            if (e.target === csvPreviewOverlay) closeBottomSheet(csvPreviewOverlay, csvPreviewSheet);
        };
    }

    detailEditBtn.onclick = () => {
        closeBottomSheet(detailSheetOverlay, detailSheet);
        showAddSheet(currentRecordForDetail);
    };

    detailDeleteBtn.onclick = handleDeleteRecord;

    // Verification Prompts
    closeAuthPrompt.onclick = () => {
        closeBottomSheet(authPromptOverlay, authPromptSheet);
        pendingAuthCallback = null;
    };
    
    authPromptOverlay.onclick = (e) => {
        if (e.target === authPromptOverlay) closeBottomSheet(authPromptOverlay, authPromptSheet);
    };

    authPromptSubmitBtn.onclick = async () => {
        const pwd = authPromptPassword.value;
        if (pwd === masterPassword) {
            closeBottomSheet(authPromptOverlay, authPromptSheet);
            if (pendingAuthCallback) {
                const cb = pendingAuthCallback;
                pendingAuthCallback = null;
                // Wait short delay for smooth sheet transition
                setTimeout(() => cb(), 300);
            }
        } else {
            showToast("驗證失敗：密碼錯誤！");
            authPromptPassword.value = '';
        }
    };
    
    authPromptPassword.onkeypress = (e) => {
        if (e.key === 'Enter') authPromptSubmitBtn.click();
    };

    // Settings actions
    saveClientIdBtn.onclick = () => {
        const cid = settingClientId.value.trim();
        window.GoogleDriveSync.setClientId(cid);
        showToast(cid ? "已儲存 Client ID，已啟用雲端 API" : "Client ID 已清除，使用模擬沙盒測試");
        updateGoogleDriveUI();
    };

    btnCloudBackup.onclick = handleCloudBackup;
    btnCloudRestore.onclick = handleCloudRestore;
    btnLocalExport.onclick = handleLocalExport;
    localImportFile.onchange = handleLocalImport;
    csvImportFile.onchange = handleCsvImport;
    btnChangePwd.onclick = handleChangePassword;
    btnResetVault.onclick = handleWipeVault;

    // --- Load Scripts & Initialize ---

    window.GoogleDriveSync.loadScripts(() => {
        console.log("Google APIs and Identity Services loaded.");
        updateGoogleDriveUI();
    });

    initLockScreen();

    // Trigger biometric automatically if cached
    if (isVaultInitialized() && isBiometricSessionAvailable()) {
        setTimeout(triggerSimulatedFingerprint, 500);
    }
});

// --- Generic Helper Utility Functions ---

function generateId() {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function truncateString(str, num) {
    if (str.length <= num) return str;
    return str.slice(0, num) + '...';
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function copyToClipboard(text, successMsg) {
    if (!text) return;
    
    // Fallback if navigator.clipboard is blocked or not available (HTTP context)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            const toast = document.getElementById('toast-msg');
            toast.innerText = successMsg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }).catch(err => {
            fallbackCopyToClipboard(text, successMsg);
        });
    } else {
        fallbackCopyToClipboard(text, successMsg);
    }
}

function fallbackCopyToClipboard(text, successMsg) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        const toast = document.getElementById('toast-msg');
        toast.innerText = successMsg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    } catch (err) {
        console.error('複製失敗:', err);
    }
    document.body.removeChild(textArea);
}
