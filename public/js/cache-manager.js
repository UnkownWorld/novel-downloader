/**
 * 缓存管理模块 - 使用 localStorage 持久化
 */

class CacheManager {
    constructor() {
        this.storageKey = 'novelCache';
        this.cache = this.loadFromStorage();
        this.maxSize = 200; // 最大缓存条数
        this.defaultExpire = 86400000; // 默认24小时过期
    }
    
    /**
     * 从 localStorage 加载缓存
     */
    loadFromStorage() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const parsed = JSON.parse(data);
                // 清理过期缓存
                const now = Date.now();
                const validCache = {};
                for (const [key, item] of Object.entries(parsed)) {
                    if (item.expire > now) {
                        validCache[key] = item;
                    }
                }
                return new Map(Object.entries(validCache));
            }
        } catch (e) {
            console.error('加载缓存失败:', e);
        }
        return new Map();
    }
    
    /**
     * 保存缓存到 localStorage
     */
    saveToStorage() {
        try {
            const obj = Object.fromEntries(this.cache);
            localStorage.setItem(this.storageKey, JSON.stringify(obj));
        } catch (e) {
            // 如果存储满了，清理一半
            if (e.name === 'QuotaExceededError') {
                console.warn('存储空间不足，清理旧缓存');
                this.cleanOldCache();
                this.saveToStorage();
            } else {
                console.error('保存缓存失败:', e);
            }
        }
    }
    
    /**
     * 清理旧缓存
     */
    cleanOldCache() {
        const entries = Array.from(this.cache.entries());
        // 按时间排序，删除最旧的一半
        entries.sort((a, b) => a[1].time - b[1].time);
        const toDelete = Math.floor(entries.length / 2);
        for (let i = 0; i < toDelete; i++) {
            this.cache.delete(entries[i][0]);
        }
    }
    
    /**
     * 获取缓存
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        // 检查是否过期
        if (Date.now() > item.expire) {
            this.cache.delete(key);
            this.saveToStorage();
            return null;
        }
        
        return item.data;
    }
    
    /**
     * 设置缓存
     */
    set(key, data, expireMs = this.defaultExpire) {
        // 如果超过最大数量，删除最旧的
        if (this.cache.size >= this.maxSize) {
            this.cleanOldCache();
        }
        
        this.cache.set(key, {
            data: data,
            expire: Date.now() + expireMs,
            time: Date.now()
        });
        
        // 异步保存，避免阻塞
        setTimeout(() => this.saveToStorage(), 0);
    }
    
    /**
     * 删除缓存
     */
    delete(key) {
        this.cache.delete(key);
        this.saveToStorage();
    }
    
    /**
     * 清空缓存
     */
    clear() {
        this.cache.clear();
        localStorage.removeItem(this.storageKey);
    }
    
    /**
     * 获取缓存统计
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}

/**
 * 失效书源管理
 */
class InvalidSourceManager {
    constructor() {
        this.storageKey = 'invalidSources';
        this.sources = this.load();
        this.expireTime = 600000; // 10分钟过期
    }
    
    /**
     * 加载失效书源
     */
    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('加载失效书源失败:', e);
        }
        return {};
    }
    
    /**
     * 保存失效书源
     */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.sources));
        } catch (e) {
            console.error('保存失效书源失败:', e);
        }
    }
    
    /**
     * 添加失效书源
     */
    add(sourceUrl, error) {
        this.sources[sourceUrl] = {
            error: error,
            time: Date.now()
        };
        this.save();
    }
    
    /**
     * 检查书源是否失效
     */
    isInvalid(sourceUrl) {
        const item = this.sources[sourceUrl];
        if (!item) return false;
        
        // 检查是否过期
        if (Date.now() - item.time > this.expireTime) {
            delete this.sources[sourceUrl];
            this.save();
            return false;
        }
        
        return true;
    }
    
    /**
     * 移除失效标记
     */
    remove(sourceUrl) {
        delete this.sources[sourceUrl];
        this.save();
    }
    
    /**
     * 清空所有失效标记
     */
    clear() {
        this.sources = {};
        this.save();
    }
    
    /**
     * 获取所有失效书源
     */
    getAll() {
        return Object.entries(this.sources).map(([url, info]) => ({
            url: url,
            error: info.error,
            time: info.time
        }));
    }
}

// 导出
window.CacheManager = CacheManager;
window.InvalidSourceManager = InvalidSourceManager;
