/**
 * Egyptian ID PDF417 Decoder - Enhanced Library Loader
 * ====================================================
 * 
 * ميزات:
 * - تحميل ديناميكي آمن لـ ZXing WASM
 * - Fallback متعددة CDNs
 * - BarcodeDetector API كـ fallback
 * - معالجة أخطاء شاملة
 * - Timeout محدد
 * 
 * الاستخدام:
 * const decoder = new EgyptianIDDecoder({
 *   wasmUrl: 'custom-path-to-wasm',
 *   timeout: 5000
 * });
 * 
 * const result = await decoder.scanImage(imageData);
 */

class EgyptianIDDecoder {
  constructor(options = {}) {
    this.config = {
      wasmVersion: 'latest', // أو رقم نسخة محدد مثل '1.3.4'
      timeout: options.timeout || 5000,
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      formats: ['PDF417', 'QRCode'], // البيانات الأساسية
      ...options
    };

    this.ready = false;
    this.zxingLoaded = false;
    this.barcodeDetectorAvailable = 'BarcodeDetector' in window;
    this.initPromise = this.initialize();
  }

  /**
   * تهيئة المكتبة - تحميل ZXing WASM بشكل آمن
   */
  async initialize() {
    try {
      // 1. تحقق من وجود ZXing محلياً أولاً
      if (typeof window.ZXingWASM !== 'undefined') {
        console.log('✅ ZXing WASM already loaded');
        this.zxingLoaded = true;
        this.ready = true;
        return true;
      }

      // 2. حاول تحميل ZXing من قائمة CDNs
      const success = await this.loadZXingWASM();
      if (success) {
        this.zxingLoaded = true;
        console.log('✅ ZXing WASM loaded successfully');
      } else {
        console.warn('⚠️ ZXing WASM failed - will use BarcodeDetector as fallback');
      }

      this.ready = true;
      return success || this.barcodeDetectorAvailable;

    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.ready = true;
      return false;
    }
  }

  /**
   * تحميل ZXing WASM من CDNs متعددة
   */
  async loadZXingWASM() {
    const cdnUrls = this.generateCDNUrls();

    for (const url of cdnUrls) {
      try {
        const success = await this.loadScript(url, this.config.timeout);
        if (success && window.ZXingWASM) {
          return true;
        }
      } catch (error) {
        console.debug(`⚠️ Failed to load from ${url}:`, error.message);
        continue;
      }
    }

    return false;
  }

  /**
   * توليد قائمة CDNs للمحاولة
   */
  generateCDNUrls() {
    const version = this.config.wasmVersion;
    return [
      // jsDelivr - السريع والموثوق
      `https://cdn.jsdelivr.net/npm/zxing-wasm@${version}/dist/iife/full/index.js`,
      
      // unpkg - بديل جيد
      `https://unpkg.com/zxing-wasm@${version}/dist/iife/full/index.js`,
      
      // esm.sh - يدعم tree-shaking
      `https://esm.sh/zxing-wasm@${version}`,
      
      // fastly jsDelivr
      `https://fastly.jsdelivr.net/npm/zxing-wasm@${version}/dist/iife/full/index.js`,
      
      // Custom WASM path (إذا وُفر)
      ...(this.config.wasmUrl ? [this.config.wasmUrl] : [])
    ];
  }

  /**
   * تحميل سكريبت مع timeout
   */
  loadScript(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout loading ${url}`));
      }, timeout);

      script.onload = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to load ${url}`));
      };

      script.src = url;
      document.head.appendChild(script);
    });
  }

  /**
   * مسح الباركود من ImageData
   */
  async scanImageData(imageData) {
    // انتظر حتى تنتهي التهيئة
    await this.initPromise;

    if (!imageData) {
      throw new Error('ImageData is required');
    }

    // المحاولة 1: ZXing WASM (الأفضل)
    if (this.zxingLoaded && window.ZXingWASM) {
      try {
        const result = await this.scanWithZXing(imageData);
        if (result) return result;
      } catch (error) {
        console.warn('ZXing scan failed:', error);
      }
    }

    // المحاولة 2: BarcodeDetector API
    if (this.barcodeDetectorAvailable) {
      try {
        const result = await this.scanWithBarcodeDetector(imageData);
        if (result) return result;
      } catch (error) {
        console.warn('BarcodeDetector scan failed:', error);
      }
    }

    throw new Error('No barcode scanning method available');
  }

  /**
   * مسح باستخدام ZXing WASM
   */
  async scanWithZXing(imageData) {
    try {
      const { readBarcodes } = window.ZXingWASM;
      
      const results = await Promise.race([
        readBarcodes(imageData, {
          formats: this.config.formats,
          tryHarder: this.config.tryHarder,
          tryRotate: this.config.tryRotate,
          tryInvert: this.config.tryInvert
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej('Scan timeout'), this.config.timeout)
        )
      ]);

      if (results && results.length > 0) {
        return {
          text: results[0].text,
          format: results[0].format,
          method: 'ZXing WASM',
          confidence: 'high'
        };
      }

      return null;

    } catch (error) {
      console.warn('ZXing error:', error);
      throw error;
    }
  }

  /**
   * مسح باستخدام BarcodeDetector API
   */
  async scanWithBarcodeDetector(imageData) {
    try {
      // تحويل ImageData إلى Canvas
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(imageData, 0, 0);

      const detector = new BarcodeDetector({
        formats: ['pdf417', 'qr_code']
      });

      const results = await Promise.race([
        detector.detect(canvas),
        new Promise((_, rej) =>
          setTimeout(() => rej('Scan timeout'), this.config.timeout)
        )
      ]);

      if (results && results.length > 0) {
        return {
          text: results[0].rawValue,
          format: results[0].format,
          method: 'BarcodeDetector',
          confidence: 'medium'
        };
      }

      return null;

    } catch (error) {
      console.warn('BarcodeDetector error:', error);
      throw error;
    }
  }

  /**
   * مسح من HTML Image Element
   */
  async scanImage(imageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imageElement, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return this.scanImageData(imageData);
  }

  /**
   * مسح من Canvas
   */
  async scanCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return this.scanImageData(imageData);
  }

  /**
   * مسح من File/Blob
   */
  async scanFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const img = new Image();

      reader.onload = (e) => {
        img.onload = async () => {
          try {
            const result = await this.scanImage(img);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * فك تشفير الرقم القومي من النص المقروء
   */
  extractNationalID(rawText) {
    if (!rawText) return null;

    // 1. ابحث عن رقم 14 بدءاً بـ 2 أو 3
    const match14 = rawText.match(/\b[23]\d{13}\b/);
    if (match14) return match14[0];

    // 2. أي تسلسل 14 رقم
    const matchAny = rawText.match(/\d{14}/);
    if (matchAny) return matchAny[0];

    // 3. نظّف وحاول
    const cleaned = rawText.replace(/[^0-9]/g, '');
    if (cleaned.length >= 14) {
      return cleaned.slice(0, 14);
    }

    return null;
  }

  /**
   * التحقق من صلاحية الرقم القومي
   */
  validateNationalID(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.length !== 14) return false;
    if (!/^[23]\d{13}$/.test(id)) return false;

    const century = id[0];
    const yy = parseInt(id.slice(1, 3));
    const mm = parseInt(id.slice(3, 5));
    const dd = parseInt(id.slice(5, 7));

    // التحقق من الصحة الأساسية
    if (mm < 1 || mm > 12) return false;
    if (dd < 1 || dd > 31) return false;

    // التحقق من التاريخ
    const year = (century === '2' ? 1900 : 2000) + yy;
    const date = new Date(year, mm - 1, dd);
    return date.getFullYear() === year &&
           date.getMonth() === mm - 1 &&
           date.getDate() === dd;
  }

  /**
   * الحصول على حالة النظام
   */
  getStatus() {
    return {
      ready: this.ready,
      zxingLoaded: this.zxingLoaded,
      barcodeDetectorAvailable: this.barcodeDetectorAvailable,
      available: this.zxingLoaded || this.barcodeDetectorAvailable,
      preferredMethod: this.zxingLoaded ? 'ZXing WASM' : 'BarcodeDetector',
      config: this.config
    };
  }
}

/**
 * تطبيق بسيط للاستخدام الفوري
 */
const EgyptianIDApp = {
  decoder: null,

  async init() {
    this.decoder = new EgyptianIDDecoder();
    const status = await this.decoder.initPromise;
    console.log('App Status:', this.decoder.getStatus());
    return status;
  },

  async decodeImage(file) {
    if (!this.decoder) await this.init();
    
    const result = await this.decoder.scanFile(file);
    const nationalID = this.decoder.extractNationalID(result.text);
    
    return {
      raw: result,
      nationalID,
      valid: this.decoder.validateNationalID(nationalID),
      fullData: result.text
    };
  },

  async decodeCanvas(canvas) {
    if (!this.decoder) await this.init();
    
    const result = await this.decoder.scanCanvas(canvas);
    const nationalID = this.decoder.extractNationalID(result.text);
    
    return {
      raw: result,
      nationalID,
      valid: this.decoder.validateNationalID(nationalID),
      fullData: result.text
    };
  }
};

// تصدير للاستخدام كـ Module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EgyptianIDDecoder, EgyptianIDApp };
}
