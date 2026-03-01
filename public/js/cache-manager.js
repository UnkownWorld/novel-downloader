/**
 * 缓存管理模块
 */

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.maxSize = 100; // 最大缓存条数
        this.defaultExpire = 3600000; // 默认1小时过期
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
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            data: data,
            expire: Date.now() + expireMs,
            time: Date.now()
        });
    }
    
    /**
     * 删除缓存
     */
    delete(key) {
        this.cache.delete(key);
    }
    
    /**
     * 清空缓存
     */
    clear() {
        this.cache.clear();
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
