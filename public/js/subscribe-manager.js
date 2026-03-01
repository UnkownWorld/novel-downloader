/**
 * 书源订阅管理模块
 */

class SubscribeManager {
    constructor() {
        this.subscriptions = [];
        this.storageKey = 'bookSourceSubscriptions';
    }
    
    /**
     * 初始化
     */
    async init() {
        this.subscriptions = this.loadSubscriptions();
        return this;
    }
    
    /**
     * 加载订阅
     */
    loadSubscriptions() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('加载订阅失败:', e);
        }
        return [];
    }
    
    /**
     * 保存订阅
     */
    saveSubscriptions() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.subscriptions));
            return true;
        } catch (e) {
            console.error('保存订阅失败:', e);
            return false;
        }
    }
    
    /**
     * 添加订阅
     */
    async addSubscription(url, name = '') {
        if (!url) return { success: false, error: 'URL不能为空' };
        
        // 检查是否已存在
        if (this.subscriptions.some(s => s.url === url)) {
            return { success: false, error: '订阅已存在' };
        }
        
        const subscription = {
            id: Date.now().toString(),
            url: url,
            name: name || this.extractNameFromUrl(url),
            createTime: Date.now(),
            lastUpdateTime: 0,
            sourceCount: 0,
            autoUpdate: true
        };
        
        // 立即获取一次
        const result = await this.fetchSubscription(url);
        if (result.success) {
            subscription.sourceCount = result.sources.length;
            subscription.lastUpdateTime = Date.now();
            subscription.name = result.name || subscription.name;
        }
        
        this.subscriptions.push(subscription);
        this.saveSubscriptions();
        
        return {
            success: true,
            subscription: subscription,
            sources: result.success ? result.sources : []
        };
    }
    
    /**
     * 删除订阅
     */
    removeSubscription(id) {
        const index = this.subscriptions.findIndex(s => s.id === id);
        if (index >= 0) {
            this.subscriptions.splice(index, 1);
            this.saveSubscriptions();
            return true;
        }
        return false;
    }
    
    /**
     * 更新订阅
     */
    async updateSubscription(id) {
        const subscription = this.subscriptions.find(s => s.id === id);
        if (!subscription) {
            return { success: false, error: '订阅不存在' };
        }
        
        const result = await this.fetchSubscription(subscription.url);
        
        if (result.success) {
            subscription.sourceCount = result.sources.length;
            subscription.lastUpdateTime = Date.now();
            subscription.name = result.name || subscription.name;
            this.saveSubscriptions();
        }
        
        return result;
    }
    
    /**
     * 更新所有订阅
     */
    async updateAllSubscriptions() {
        const results = [];
        
        for (const subscription of this.subscriptions) {
            if (!subscription.autoUpdate) continue;
            
            const result = await this.updateSubscription(subscription.id);
            results.push({
                subscription: subscription,
                result: result
            });
        }
        
        return results;
    }
    
    /**
     * 获取订阅内容
     */
    async fetchSubscription(url) {
        try {
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
            const data = await response.json();
            
            if (!data.success) {
                return { success: false, error: data.error || '请求失败' };
            }
            
            // 解析书源
            let sources;
            try {
                let content = data.body;
                
                // 处理可能的JSONP
                if (content.startsWith('(')) {
                    content = content.replace(/^\(|\)$/g, '');
                }
                
                sources = JSON.parse(content);
            } catch (e) {
                return { success: false, error: '解析书源失败' };
            }
            
            if (!Array.isArray(sources)) {
                sources = [sources];
            }
            
            // 提取名称
            let name = '';
            if (sources.length > 0 && sources[0].bookSourceGroup) {
                name = sources[0].bookSourceGroup;
            }
            
            return {
                success: true,
                sources: sources,
                name: name,
                url: data.url
            };
            
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    
    /**
     * 从URL提取名称
     */
    extractNameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const match = pathname.match(/\/([^\/]+)\.json$/);
            if (match) {
                return decodeURIComponent(match[1]);
            }
            return urlObj.hostname;
        } catch (e) {
            return '未命名订阅';
        }
    }
    
    /**
     * 获取所有订阅
     */
    getAllSubscriptions() {
        return [...this.subscriptions];
    }
    
    /**
     * 获取订阅
     */
    getSubscription(id) {
        return this.subscriptions.find(s => s.id === id);
    }
    
    /**
     * 设置订阅自动更新
     */
    setAutoUpdate(id, autoUpdate) {
        const subscription = this.subscriptions.find(s => s.id === id);
        if (subscription) {
            subscription.autoUpdate = autoUpdate;
            this.saveSubscriptions();
            return true;
        }
        return false;
    }
}

// 导出
window.SubscribeManager = SubscribeManager;
