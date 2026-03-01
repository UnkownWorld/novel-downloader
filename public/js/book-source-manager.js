/**
 * BookSourceManager模块 - 书源管理
 */

class BookSourceManager {
    constructor() {
        this.sources = new Map();
        this.groups = new Map();
        this.storageKey = 'bookSources';
        this.groupKey = 'bookSourceGroups';
    }

    /**
     * 初始化
     */
    async init() {
        this.loadSources();
        this.loadGroups();
        return this;
    }

    /**
     * 加载书源
     */
    loadSources() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const sources = JSON.parse(data);
                for (const source of sources) {
                    this.sources.set(source.bookSourceUrl, source);
                }
            }
        } catch (e) {
            console.error('加载书源失败:', e);
        }
    }

    /**
     * 保存书源
     */
    saveSources() {
        try {
            const sources = Array.from(this.sources.values());
            localStorage.setItem(this.storageKey, JSON.stringify(sources));
        } catch (e) {
            console.error('保存书源失败:', e);
        }
    }

    /**
     * 加载分组
     */
    loadGroups() {
        try {
            const data = localStorage.getItem(this.groupKey);
            if (data) {
                const groups = JSON.parse(data);
                for (const group of groups) {
                    this.groups.set(group.name, group);
                }
            }
        } catch (e) {
            console.error('加载分组失败:', e);
        }
    }

    /**
     * 保存分组
     */
    saveGroups() {
        try {
            const groups = Array.from(this.groups.values());
            localStorage.setItem(this.groupKey, JSON.stringify(groups));
        } catch (e) {
            console.error('保存分组失败:', e);
        }
    }

    /**
     * 添加书源
     */
    addSource(source) {
        if (!source.bookSourceUrl || !source.bookSourceName) {
            return false;
        }
        
        this.sources.set(source.bookSourceUrl, {
            ...source,
            enabled: source.enabled !== false,
            exploreEnabled: source.exploreEnabled !== false,
            weight: source.weight || 0,
            lastUpdateTime: Date.now()
        });
        
        this.saveSources();
        return true;
    }

    /**
     * 批量添加书源
     */
    addSources(sources) {
        const result = { added: 0, updated: 0 };
        
        for (const source of sources) {
            if (!source.bookSourceUrl || !source.bookSourceName) {
                continue;
            }
            
            const existing = this.sources.get(source.bookSourceUrl);
            if (existing) {
                result.updated++;
            } else {
                result.added++;
            }
            
            this.addSource(source);
        }
        
        return result;
    }

    /**
     * 删除书源
     */
    removeSource(url) {
        this.sources.delete(url);
        this.saveSources();
    }

    /**
     * 获取书源
     */
    getSource(url) {
        return this.sources.get(url);
    }

    /**
     * 获取所有书源
     */
    getAllSources() {
        return Array.from(this.sources.values());
    }

    /**
     * 获取启用的书源
     */
    getEnabledSources() {
        return Array.from(this.sources.values()).filter(s => s.enabled);
    }

    /**
     * 启用/禁用书源
     */
    setEnabled(url, enabled) {
        const source = this.sources.get(url);
        if (source) {
            source.enabled = enabled;
            this.saveSources();
        }
    }

    /**
     * 按分组获取书源
     */
    getSourcesByGroup(groupName) {
        return Array.from(this.sources.values())
            .filter(s => s.bookSourceGroup === groupName);
    }

    /**
     * 搜索书源
     */
    searchSources(keyword) {
        keyword = keyword.toLowerCase();
        return Array.from(this.sources.values())
            .filter(s => 
                s.bookSourceName.toLowerCase().includes(keyword) ||
                s.bookSourceUrl.toLowerCase().includes(keyword) ||
                (s.bookSourceGroup && s.bookSourceGroup.toLowerCase().includes(keyword))
            );
    }

    /**
     * 导出书源
     */
    exportSources(urls = null) {
        if (urls) {
            return urls.map(url => this.sources.get(url)).filter(Boolean);
        }
        return this.getAllSources();
    }

    /**
     * 导入书源
     */
    async importFromUrl(url) {
        try {
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '请求失败');
            }
            
            let sources;
            try {
                sources = JSON.parse(data.body);
            } catch (e) {
                throw new Error('解析书源失败');
            }
            
            if (!Array.isArray(sources)) {
                sources = [sources];
            }
            
            return this.addSources(sources);
        } catch (e) {
            throw e;
        }
    }

    /**
     * 获取书源统计
     */
    getStats() {
        const all = this.sources.size;
        const enabled = this.getEnabledSources().length;
        const groups = new Set();
        
        for (const source of this.sources.values()) {
            if (source.bookSourceGroup) {
                groups.add(source.bookSourceGroup);
            }
        }
        
        return {
            total: all,
            enabled: enabled,
            disabled: all - enabled,
            groups: groups.size
        };
    }
}

// 导出
window.BookSourceManager = BookSourceManager;
