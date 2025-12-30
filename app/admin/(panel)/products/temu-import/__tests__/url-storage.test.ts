/**
 * Manual test file for URL storage functionality
 * 
 * To test manually:
 * 1. Open browser console
 * 2. Run the test functions below
 * 3. Verify localStorage keys and values
 */

// Test helper functions
function getStorageKey(provider: 'temu' | 'alibaba'): string {
  return `bulk-import-urls-${provider}`;
}

function loadUrlsFromStorage(provider: 'temu' | 'alibaba'): string {
  if (typeof window === 'undefined') return '';
  
  try {
    const stored = localStorage.getItem(getStorageKey(provider));
    return stored || '';
  } catch (error) {
    console.warn('[Bulk Import] Failed to load URLs from storage:', error);
    return '';
  }
}

function saveUrlsToStorage(provider: 'temu' | 'alibaba', urls: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(getStorageKey(provider), urls);
    console.log(`✅ Saved ${urls.split('\n').filter(u => u.trim()).length} URLs for ${provider}`);
  } catch (error) {
    console.warn('[Bulk Import] Failed to save URLs to storage:', error);
  }
}

// Test functions (run in browser console)
export const testUrlStorage = {
  /**
   * Test 1: Save Temu URLs
   */
  testSaveTemuUrls: () => {
    const temuUrls = `https://www.temu.com/goods.html?goods_id=123
https://www.temu.com/goods.html?goods_id=456
https://www.temu.com/goods.html?goods_id=789`;
    
    saveUrlsToStorage('temu', temuUrls);
    console.log('✅ Test 1: Saved Temu URLs');
    console.log('Check localStorage:', localStorage.getItem(getStorageKey('temu')));
  },

  /**
   * Test 2: Save Alibaba URLs
   */
  testSaveAlibabaUrls: () => {
    const alibabaUrls = `https://www.alibaba.com/product-detail/111.html
https://www.alibaba.com/product-detail/222.html
https://www.alibaba.com/product-detail/333.html`;
    
    saveUrlsToStorage('alibaba', alibabaUrls);
    console.log('✅ Test 2: Saved Alibaba URLs');
    console.log('Check localStorage:', localStorage.getItem(getStorageKey('alibaba')));
  },

  /**
   * Test 3: Load Temu URLs
   */
  testLoadTemuUrls: () => {
    const loaded = loadUrlsFromStorage('temu');
    console.log('✅ Test 3: Loaded Temu URLs');
    console.log('URLs:', loaded);
    console.log('Count:', loaded.split('\n').filter(u => u.trim()).length);
  },

  /**
   * Test 4: Load Alibaba URLs
   */
  testLoadAlibabaUrls: () => {
    const loaded = loadUrlsFromStorage('alibaba');
    console.log('✅ Test 4: Loaded Alibaba URLs');
    console.log('URLs:', loaded);
    console.log('Count:', loaded.split('\n').filter(u => u.trim()).length);
  },

  /**
   * Test 5: Verify separate storage
   */
  testSeparateStorage: () => {
    const temuUrls = loadUrlsFromStorage('temu');
    const alibabaUrls = loadUrlsFromStorage('alibaba');
    
    console.log('✅ Test 5: Verify separate storage');
    console.log('Temu URLs:', temuUrls);
    console.log('Alibaba URLs:', alibabaUrls);
    console.log('Are they different?', temuUrls !== alibabaUrls);
    
    // Verify storage keys exist
    const temuKey = getStorageKey('temu');
    const alibabaKey = getStorageKey('alibaba');
    console.log(`Temu key exists: ${localStorage.getItem(temuKey) !== null}`);
    console.log(`Alibaba key exists: ${localStorage.getItem(alibabaKey) !== null}`);
  },

  /**
   * Test 6: Clear all storage
   */
  testClearStorage: () => {
    localStorage.removeItem(getStorageKey('temu'));
    localStorage.removeItem(getStorageKey('alibaba'));
    console.log('✅ Test 6: Cleared all URL storage');
  },

  /**
   * Test 7: List all storage keys
   */
  testListStorage: () => {
    console.log('✅ Test 7: All localStorage keys:');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('bulk-import-urls-')) {
        console.log(`  ${key}: ${localStorage.getItem(key)?.substring(0, 50)}...`);
      }
    }
  },
};

// Make functions available globally for manual testing
if (typeof window !== 'undefined') {
  (window as any).testUrlStorage = testUrlStorage;
  console.log('🧪 URL Storage test functions available. Use testUrlStorage.* in console.');
}

