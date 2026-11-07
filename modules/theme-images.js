(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ avatar: 512 * 1024, background: 2 * 1024 * 1024, total: 4 * 1024 * 1024, maxSide: 4096, maxPixels: 16000000 });
  const MAX_THEME_BYTES = LIMITS.total;
  const CACHE_ENTRIES = 8, CACHE_TEXT = 12 * 1024 * 1024;
  const cache = new Map();
  let cacheSize = 0;
  function cached(kind, input) {
    const key = kind + ':' + input, entry = cache.get(key);
    if (!entry) return null;
    cache.delete(key); cache.set(key, entry);
    return entry.value;
  }
  function remember(kind, input, value) {
    const key = kind + ':' + input, size = key.length + value.length;
    if (size > CACHE_TEXT) return;
    const previous = cache.get(key);
    if (previous) { cacheSize -= previous.size; cache.delete(key); }
    cache.set(key, { value, size }); cacheSize += size;
    while (cache.size > CACHE_ENTRIES || cacheSize > CACHE_TEXT) {
      const oldest = cache.keys().next().value;
      cacheSize -= cache.get(oldest).size; cache.delete(oldest);
    }
  }
  function limit(kind) {
    if (kind !== 'avatar' && kind !== 'background') throw new Error('Choose an avatar or background image.');
    return LIMITS[kind];
  }
  function imageInfo(b) {
    const u16 = i => (b[i] << 8) | b[i + 1];
    const u24le = i => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
    const u32 = i => ((b[i] * 0x1000000) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]) >>> 0;
    const str = (i, n) => String.fromCharCode(...b.slice(i, i + n));
    if (b.length >= 24 && str(0, 8) === '\x89PNG\r\n\x1a\n' && str(12, 4) === 'IHDR') return { type: 'image/png', width: u32(16), height: u32(20) };
    if (b.length >= 30 && str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
      const chunk = str(12, 4);
      if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + u24le(24), height: 1 + u24le(27) };
      if (chunk === 'VP8L' && b[20] === 0x2f) return { type: 'image/webp', width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 15) << 10)) };
      if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a) return { type: 'image/webp', width: (b[26] | b[27] << 8) & 0x3fff, height: (b[28] | b[29] << 8) & 0x3fff };
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 3 < b.length) {
        if (b[i++] !== 0xff) break;
        while (b[i] === 0xff) i++;
        const marker = b[i++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (i + 1 >= b.length) break;
        const size = u16(i);
        if (size < 2 || i + size > b.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) return { type: 'image/jpeg', height: u16(i + 3), width: u16(i + 5) };
        i += size;
      }
    }
    throw new Error('Choose a PNG, JPEG or WebP image.');
  }
  function checkDimensions(info) {
    if (!info.width || !info.height || info.width > LIMITS.maxSide || info.height > LIMITS.maxSide || info.width * info.height > LIMITS.maxPixels) throw new Error('Image dimensions must be at most 4096 pixels per side and 16 megapixels.');
  }
  async function sanitize(blob, kind) {
    const cap = limit(kind);
    if (!(blob instanceof Blob) || !blob.size || blob.size > cap) throw new Error(kind === 'avatar' ? 'Avatar images must be 512 KB or smaller.' : 'Background images must be 2 MB or smaller.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = imageInfo(bytes); checkDimensions(info);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: info.type }));
    try {
      if (bitmap.width !== info.width || bitmap.height !== info.height) throw new Error('Image dimensions could not be verified.');
      const canvas = document.createElement('canvas'); canvas.width = info.width; canvas.height = info.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable.');
      context.drawImage(bitmap, 0, 0);
      const encoded = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not process the image.')), info.type, 0.9));
      if (!encoded.size || encoded.size > cap || encoded.type !== info.type) throw new Error('The processed image is too large. Choose a smaller image.');
      const result = new Uint8Array(await encoded.arrayBuffer());
      const verified = imageInfo(result); checkDimensions(verified);
      if (verified.type !== info.type || verified.width !== info.width || verified.height !== info.height) throw new Error('The processed image could not be verified.');
      let binary = ''; for (let i = 0; i < result.length; i += 8192) binary += String.fromCharCode(...result.subarray(i, i + 8192));
      return `data:${info.type};base64,${btoa(binary)}`;
    } finally { bitmap.close?.(); }
  }
  async function fromFile(file, kind) {
    const result = await sanitize(file, kind);
    remember(kind, result, result);
    return result;
  }
  async function validateDataUrl(value, kind) {
    const cap = limit(kind);
    if (typeof value !== 'string' || value.length > Math.ceil(cap / 3) * 4 + 32) throw new Error('Image data is too large.');
    const existing = cached(kind, value);
    if (existing) return existing;
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) throw new Error('Choose a PNG, JPEG or WebP image.');
    let decoded;
    try { decoded = atob(match[2]); } catch (_) { throw new Error('Image data is invalid.'); }
    if (!decoded.length || decoded.length > cap) throw new Error('Image data is too large.');
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    if (imageInfo(bytes).type !== match[1]) throw new Error('Image type does not match its content.');
    const result = await sanitize(new Blob([bytes], { type: match[1] }), kind);
    remember(kind, value, result);
    remember(kind, result, result);
    return result;
  }
  function assertThemeBudget(config) {
    const r = config?.roleplay || {}, m = config?.mainInterface || {};
    const values = [r.modelAvatarUrl || r.modelAvatar || '', r.userAvatarUrl || r.userAvatar || '', m.pageBg || ''];
    const total = values.reduce((sum, value) => sum + (typeof value === 'string' ? Math.ceil(value.length * 3 / 4) : 0), 0);
    if (total > MAX_THEME_BYTES) throw new Error('Images in one theme must total 4 MB or less.');
    return true;
  }
  root.StudioLabThemeImages = Object.freeze({ LIMITS, MAX_THEME_BYTES, fromFile, validateDataUrl, assertThemeBudget });
})(window);
