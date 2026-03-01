/**
 * CacheManager模块 - 缓存管理
 */

class CacheManagerNew {
    constructor() {
        this.cache = new Map();
        this.maxSize = 100; // 最大缓存数量
        this.maxAge = 3600000; // 默认缓存时间1小时
    }

    /**
     * 获取缓存
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        // 检查是否过期
        if (Date.now() > item.expireTime) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    /**
     * 设置缓存
     */
    set(key, value, maxAge = this.maxAge) {
        // 检查缓存大小
        if (this.cache.size >= this.maxSize) {
            this.clearExpired();
            if (this.cache.size >= this.maxSize) {
                // 删除最早的缓存
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
        }
        
        this.cache.set(key, {
            value: value,
            expireTime: Date.now() + maxAge
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
     * 清理过期缓存
     */
    clearExpired() {
        const now = Date.now();
        for (const [key, item] of this.cache) {
            if (now > item.expireTime) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * 获取缓存大小
     */
    size() {
        return this.cache.size;
    }

    /**
     * 持久化缓存到localStorage
     */
    persist() {
        try {
            const data = {};
            for (const [key, item] of this.cache) {
                data[key] = item;
            }
            localStorage.setItem('cache', JSON.stringify(data));
        } catch (e) {
            console.error('持久化缓存失败:', e);
        }
    }

    /**
     * 从localStorage恢复缓存
     */
    restore() {
        try {
            const data = localStorage.getItem('cache');
            if (data) {
                const parsed = JSON.parse(data);
                for (const [key, item] of Object.entries(parsed)) {
                    this.cache.set(key, item);
                }
            }
            this.clearExpired();
        } catch (e) {
            console.error('恢复缓存失败:', e);
        }
    }
}

// 创建全局实例
window.CacheManagerNew = new CacheManagerNew();
