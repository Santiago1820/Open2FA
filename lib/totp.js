// lib/totp.js

/**
 * Decodes a Base32 string into an ArrayBuffer.
 * @param {string} base32 
 * @returns {ArrayBuffer}
 */
function base32Decode(base32) {
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let index = 0;
    const output = new Uint8Array(Math.ceil((base32.length * 5) / 8));

    for (let i = 0; i < base32.length; i++) {
        const char = base32[i];
        if (char === '=') break; // Ignore padding
        
        const val = base32chars.indexOf(char);
        if (val === -1) {
            console.warn("Invalid Base32 character:", char);
            continue; // Skip invalid characters (like spaces)
        }
        
        value = (value << 5) | val;
        bits += 5;

        if (bits >= 8) {
            output[index++] = (value >>> (bits - 8)) & 255;
            bits -= 8;
        }
    }
    
    // The decoded array might have empty trailing bytes due to rounding, 
    // we return only the bytes that were actually written.
    return output.slice(0, index).buffer;
}

/**
 * Generates a TOTP code given a base32 encoded secret.
 * @param {string} secretBase32 
 * @param {number} period 
 * @param {number} digits 
 * @returns {Promise<string>}
 */
async function generateTOTP(secretBase32, period = 30, digits = 6) {
    // 1. Prepare the secret key
    const cleanSecret = secretBase32.replace(/\s+/g, '').toUpperCase();
    const secretBuffer = base32Decode(cleanSecret);

    if (secretBuffer.byteLength === 0) {
        return "".padStart(digits, 'X');
    }

    const key = await crypto.subtle.importKey(
        'raw', 
        secretBuffer, 
        { name: 'HMAC', hash: 'SHA-1' }, 
        false, 
        ['sign']
    );

    // 2. Prepare the time parameter as 8-byte buffer
    const time = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(time / period);
    
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, timeStep, false); // Big endian, fitting in the last 4 bytes for <= year 2038
    // Note: To be fully Y2038 compliant, the upper 4 bytes would need Math.floor(timeStep / 2^32)
    timeView.setUint32(0, Math.floor(timeStep / 4294967296), false);

    // 3. Compute HMAC-SHA1
    const signature = await crypto.subtle.sign('HMAC', key, timeBuffer);
    const signatureView = new DataView(signature);
    
    // 4. Transform into code
    const offset = signatureView.getUint8(19) & 0xf;
    const pcode = (signatureView.getUint32(offset, false) & 0x7fffffff) % Math.pow(10, digits);

    return pcode.toString().padStart(digits, '0');
}
