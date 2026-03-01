/**
 * 书源管理模块
 */

class BookSourceManager {
    constructor() {
        this.sources = [];
        this.groups = [];
        this.storageKey = 'bookSources';
        this.groupKey = 'bookSourceGroups';
    }
    
    /**
     * 初始化
     */
    async init() {
        this.sources = this.loadSources();
        this.groups = this.loadGroups();
        return this;
    }
    
    /**
     * 加载书源
     */
    loadSources() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('加载书源失败:', e);
        }
        return [];
    }
    
    /**
     * 保存书源
     */
    saveSources() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.sources));
            return true;
        } catch (e) {
            console.error('保存书源失败:', e);
            return false;
        }
    }
    
    /**
     * 加载分组
     */
    loadGroups() {
        try {
            const data = localStorage.getItem(this.groupKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('加载分组失败:', e);
        }
        return [];
    }
    
    /**
     * 保存分组
     */
    saveGroups() {
        try {
            localStorage.setItem(this.groupKey, JSON.stringify(this.groups));
            return true;
        } catch (e) {
            console.error('保存分组失败:', e);
            return false;
        }
    }
    
    /**
     * 添加书源
     */
    addSource(source) {
        if (!source.bookSourceUrl || !source.bookSourceName) {
            return false;
        }
        
        // 检查是否已存在
        const index = this.sources.findIndex(s => s.bookSourceUrl === source.bookSourceUrl);
        if (index >= 0) {
            // 更新
            this.sources[index] = { ...this.sources[index], ...source };
        } else {
            // 添加
            this.sources.push({
                ...source,
                enabled: source.enabled !== false,
                exploreEnabled: source.exploreEnabled !== false,
                weight: source.weight || 0,
                lastUpdateTime: Date.now()
            });
        }
        
        return this.saveSources();
    }
    
    /**
     * 批量添加书源
     */
    addSources(sources) {
        if (!Array.isArray(sources)) return 0;
        
        let added = 0;
        let updated = 0;
        
        for (const source of sources) {
            if (!source.bookSourceUrl || !source.bookSourceName) continue;
            
            const index = this.sources.findIndex(s => s.bookSourceUrl === source.bookSourceUrl);
            if (index >= 0) {
                this.sources[index] = { ...this.sources[index], ...source };
                updated++;
            } else {
                this.sources.push({
                    ...source,
                    enabled: source.enabled !== false,
                    exploreEnabled: source.exploreEnabled !== false,
                    weight: source.weight || 0,
                    lastUpdateTime: Date.now()
                });
                added++;
            }
        }
        
        this.saveSources();
        return { added, updated };
    }
    
    /**
     * 删除书源
     */
    removeSource(bookSourceUrl) {
        const index = this.sources.findIndex(s => s.bookSourceUrl === bookSourceUrl);
        if (index >= 0) {
            this.sources.splice(index, 1);
            return this.saveSources();
        }
        return false;
    }
    
    /**
     * 批量删除书源
     */
    removeSources(urls) {
        if (!Array.isArray(urls)) return 0;
        
        this.sources = this.sources.filter(s => !urls.includes(s.bookSourceUrl));
        this.saveSources();
        return urls.length;
    }
    
    /**
     * 获取书源
     */
    getSource(bookSourceUrl) {
        return this.sources.find(s => s.bookSourceUrl === bookSourceUrl);
    }
    
    /**
     * 获取所有书源
     */
    getAllSources() {
        return [...this.sources];
    }
    
    /**
     * 获取启用的书源
     */
    getEnabledSources() {
        return this.sources.filter(s => s.enabled !== false);
    }
    
    /**
     * 获取分组的书源
     */
    getSourcesByGroup(group) {
        if (!group) return this.sources;
        return this.sources.filter(s => {
            const groups = (s.bookSourceGroup || '').split(',');
            return groups.includes(group);
        });
    }
    
    /**
     * 启用/禁用书源
     */
    setSourceEnabled(bookSourceUrl, enabled) {
        const source = this.getSource(bookSourceUrl);
        if (source) {
            source.enabled = enabled;
            return this.saveSources();
        }
        return false;
    }
    
    /**
     * 更新书源
     */
    updateSource(bookSourceUrl, data) {
        const index = this.sources.findIndex(s => s.bookSourceUrl === bookSourceUrl);
        if (index >= 0) {
            this.sources[index] = { ...this.sources[index], ...data };
            return this.saveSources();
        }
        return false;
    }
    
    /**
     * 搜索书源
     */
    searchSources(keyword) {
        if (!keyword) return this.sources;
        const lower = keyword.toLowerCase();
        return this.sources.filter(s => 
            s.bookSourceName.toLowerCase().includes(lower) ||
            s.bookSourceUrl.toLowerCase().includes(lower) ||
            (s.bookSourceGroup || '').toLowerCase().includes(lower)
        );
    }
    
    /**
     * 获取所有分组
     */
    getAllGroups() {
        const groupSet = new Set();
        this.sources.forEach(s => {
            if (s.bookSourceGroup) {
                s.bookSourceGroup.split(',').forEach(g => {
                    if (g.trim()) groupSet.add(g.trim());
                });
            }
        });
        return Array.from(groupSet);
    }
    
    /**
     * 导出书源
     */
    exportSources(urls = null) {
        let sources = urls ? 
            this.sources.filter(s => urls.includes(s.bookSourceUrl)) : 
            this.sources;
        return JSON.stringify(sources, null, 2);
    }
    
    /**
     * 导入书源
     */
    async importSources(data) {
        try {
            let sources;
            
            // 尝试解析JSON
            if (typeof data === 'string') {
                // 处理可能的JSONP
                if (data.startsWith('(') || data.startsWith('[')) {
                    data = data.replace(/^\(|\)$/g, '');
                }
                sources = JSON.parse(data);
            } else {
                sources = data;
            }
            
            if (!Array.isArray(sources)) {
                sources = [sources];
            }
            
            return this.addSources(sources);
        } catch (e) {
            console.error('导入书源失败:', e);
            return { added: 0, updated: 0, error: e.message };
        }
    }
    
    /**
     * 从URL导入书源
     */
    async importFromUrl(url) {
        try {
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '请求失败');
            }
            
            return await this.importSources(data.body);
        } catch (e) {
            console.error('从URL导入书源失败:', e);
            return { added: 0, updated: 0, error: e.message };
        }
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            total: this.sources.length,
            enabled: this.sources.filter(s => s.enabled !== false).length,
            disabled: this.sources.filter(s => s.enabled === false).length,
            groups: this.getAllGroups().length
        };
    }
}

// 导出
window.BookSourceManager = BookSourceManager;
