/**
 * VaultOne Cryptography Module
 * Uses Native Web Crypto API for zero-knowledge client-side encryption.
 */

// Helper: Convert string to ArrayBuffer (UTF-8)
function stringToBuffer(str) {
    return new TextEncoder().encode(str);
}

// Helper: Convert ArrayBuffer to string (UTF-8)
function bufferToString(buf) {
    return new TextDecoder().decode(buf);
}

// Helper: Convert ArrayBuffer to Base64
function bufferToBase64(buf) {
    const binString = String.fromCharCode(...new Uint8Array(buf));
    return btoa(binString);
}

// Helper: Convert Base64 to ArrayBuffer
function base64ToBuffer(b64) {
    const binString = atob(b64);
    const len = binString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Generate a secure random salt (16 bytes)
function generateSalt() {
    const salt = new Uint8Array(16);
    window.crypto.getRandomValues(salt);
    return salt;
}

// Generate a secure random IV (12 bytes for AES-GCM)
function generateIV() {
    const iv = new Uint8Array(12);
    window.crypto.getRandomValues(iv);
    return iv;
}

/**
 * Derives an encryption key from a Master Password and a Salt using PBKDF2
 * @param {string} password - The master password
 * @param {Uint8Array} salt - The unique cryptographic salt
 * @returns {Promise<CryptoKey>} Derived AES-GCM key
 */
async function deriveKey(password, salt) {
    const passwordBuffer = stringToBuffer(password);
    
    // Import raw password as key material
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveKey']
    );
    
    // Derive AES-GCM key
    return await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 600000, // OWASP recommended iteration count
            hash: 'SHA-256'
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: 256
        },
        false, // Not extractable
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts plaintext data using AES-GCM 256-bit
 * @param {string} plaintext - The raw string data to encrypt
 * @param {string} password - The master password
 * @returns {Promise<{ ciphertext: string, iv: string, salt: string }>} Encrypted payload in Base64
 */
async function encryptVault(plaintext, password) {
    const salt = generateSalt();
    const iv = generateIV();
    const key = await deriveKey(password, salt);
    
    const plaintextBuffer = stringToBuffer(plaintext);
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        plaintextBuffer
    );
    
    return {
        ciphertext: bufferToBase64(ciphertextBuffer),
        iv: bufferToBase64(iv),
        salt: bufferToBase64(salt)
    };
}

/**
 * Decrypts AES-GCM 256-bit encrypted data
 * @param {string} ciphertextB64 - Ciphertext in Base64
 * @param {string} ivB64 - IV in Base64
 * @param {string} saltB64 - Salt in Base64
 * @param {string} password - The master password
 * @returns {Promise<string>} Decrypted plaintext string
 */
async function decryptVault(ciphertextB64, ivB64, saltB64, password) {
    const salt = new Uint8Array(base64ToBuffer(saltB64));
    const iv = new Uint8Array(base64ToBuffer(ivB64));
    const ciphertext = base64ToBuffer(ciphertextB64);
    
    const key = await deriveKey(password, salt);
    
    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            ciphertext
        );
        return bufferToString(decryptedBuffer);
    } catch (e) {
        throw new Error("解密失敗：密碼錯誤或資料損壞");
    }
}

// Export functions to window scope for SPA use
window.VaultCrypto = {
    encryptVault,
    decryptVault,
    // Exports for test/custom flows if needed
    bufferToBase64,
    base64ToBuffer,
    stringToBuffer,
    bufferToString
};
