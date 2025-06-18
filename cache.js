import { CONFIG } from './constants.js';

class SummaryCache {
  constructor() {
    this.storage = chrome.storage.session;
  }

  // Generate cache key from URL and settings
  generateCacheKey(url, settings) {
    const { provider, model, summaryLength, summaryFormat } = settings;
    const settingsHash = btoa(`${provider}-${model}-${summaryLength}-${summaryFormat}`);
    
    // Create a proper hash of the full URL to avoid collisions
    const urlHash = this.hashString(url);
    return `summary_${urlHash}_${settingsHash}`;
  }

  // Simple hash function to create unique identifiers from URLs
  hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to positive string and limit length for storage
    return Math.abs(hash).toString(36).slice(0, 12);
  }

  // Get cached summary
  async get(url, settings) {
    try {
      const cacheKey = this.generateCacheKey(url, settings);
      
      return new Promise((resolve) => {
        this.storage.get([cacheKey], (result) => {
          const cached = result[cacheKey];
          
          if (!cached) {
            resolve(null);
            return;
          }

          // Check if cache entry has expired
          const now = Date.now();
          const expiresAt = cached.timestamp + (CONFIG.CACHE_TTL_HOURS * 60 * 60 * 1000);
          
          if (now > expiresAt) {
            // Cache expired, remove it
            this.storage.remove([cacheKey]);
            resolve(null);
            return;
          }

          resolve(cached.summary);
        });
      });
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Store summary in cache
  async set(url, settings, summary) {
    try {
      const cacheKey = this.generateCacheKey(url, settings);
      const cacheEntry = {
        summary: summary,
        timestamp: Date.now(),
        url: url,
        settings: settings
      };


      return new Promise((resolve) => {
        this.storage.set({ [cacheKey]: cacheEntry }, () => {
          if (chrome.runtime.lastError) {
            console.error('Cache set error:', chrome.runtime.lastError);
          } else {
          }
          resolve();
        });
      });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  // Clear expired cache entries
  async cleanup() {
    try {
      return new Promise((resolve) => {
        this.storage.get(null, (items) => {
          const now = Date.now();
          const keysToRemove = [];
          const expiredThreshold = CONFIG.CACHE_TTL_HOURS * 60 * 60 * 1000;

          for (const [key, value] of Object.entries(items)) {
            if (key.startsWith('summary_') && value.timestamp) {
              if (now - value.timestamp > expiredThreshold) {
                keysToRemove.push(key);
              }
            }
          }

          if (keysToRemove.length > 0) {
            this.storage.remove(keysToRemove, () => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  // Clear all cache entries
  async clear() {
    try {
      return new Promise((resolve) => {
        this.storage.get(null, (items) => {
          const summaryKeys = Object.keys(items).filter(key => key.startsWith('summary_'));
          
          if (summaryKeys.length > 0) {
            this.storage.remove(summaryKeys, () => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  // Get cache statistics
  async getStats() {
    try {
      return new Promise((resolve) => {
        this.storage.get(null, (items) => {
          const summaryEntries = Object.entries(items).filter(([key]) => key.startsWith('summary_'));
          const now = Date.now();
          const expiredThreshold = CONFIG.CACHE_TTL_HOURS * 60 * 60 * 1000;
          
          let totalEntries = summaryEntries.length;
          let expiredEntries = 0;
          let totalSize = 0;

          summaryEntries.forEach(([key, value]) => {
            if (value.timestamp && now - value.timestamp > expiredThreshold) {
              expiredEntries++;
            }
            totalSize += JSON.stringify(value).length;
          });

          resolve({
            totalEntries,
            activeEntries: totalEntries - expiredEntries,
            expiredEntries,
            totalSizeBytes: totalSize,
            cacheTTLHours: CONFIG.CACHE_TTL_HOURS
          });
        });
      });
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        totalEntries: 0,
        activeEntries: 0,
        expiredEntries: 0,
        totalSizeBytes: 0,
        cacheTTLHours: CONFIG.CACHE_TTL_HOURS
      };
    }
  }
}

export default SummaryCache;