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

const base64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Helper: Convert ArrayBuffer to Base64 (Manual robust implementation)
function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let base64 = "";
    let i;
    for (i = 0; i < bytes.byteLength - 2; i += 3) {
        base64 += base64chars[bytes[i] >> 2];
        base64 += base64chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64 += base64chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        base64 += base64chars[bytes[i + 2] & 63];
    }
    if (i === bytes.byteLength - 2) {
        base64 += base64chars[bytes[i] >> 2];
        base64 += base64chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64 += base64chars[(bytes[i + 1] & 15) << 2];
        base64 += "=";
    } else if (i === bytes.byteLength - 1) {
        base64 += base64chars[bytes[i] >> 2];
        base64 += base64chars[(bytes[i] & 3) << 4];
        base64 += "==";
    }
    return base64;
}

// Helper: Convert Base64 to ArrayBuffer (Manual robust implementation)
function base64ToBuffer(b64) {
    let bufferLength = b64.length * 0.75;
    if (b64[b64.length - 1] === "=") bufferLength--;
    if (b64[b64.length - 2] === "=") bufferLength--;
    
    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    
    // Create reverse lookup table
    const lookup = new Uint8Array(256);
    for (let i = 0; i < base64chars.length; i++) {
        lookup[base64chars.charCodeAt(i)] = i;
    }
    
    for (let i = 0; i < b64.length; i += 4) {
        let encoded1 = lookup[b64.charCodeAt(i)];
        let encoded2 = lookup[b64.charCodeAt(i + 1)];
        let encoded3 = lookup[b64.charCodeAt(i + 2)];
        let encoded4 = lookup[b64.charCodeAt(i + 3)];
        
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        if (b64[i + 2] !== "=") bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        if (b64[i + 3] !== "=") bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
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
