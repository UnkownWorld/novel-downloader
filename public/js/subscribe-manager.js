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
        
        console.log('fetchSubscription result:', result);
        
        if (result.success) {
            subscription.sourceCount = result.sources.length;
            subscription.lastUpdateTime = Date.now();
            subscription.name = result.name || subscription.name;
        } else {
            console.error('fetchSubscription failed:', result.error);
        }
        
        this.subscriptions.push(subscription);
        this.saveSubscriptions();
        
        return {
            success: true,
            subscription: subscription,
            sources: result.success ? result.sources : [],
            error: result.success ? null : result.error
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
        
        console.log('updateSubscription fetchSubscription result:', result);
        
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
            console.log('fetchSubscription url:', url);
            
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            console.log('proxy url:', proxyUrl);
            
            const response = await fetch(proxyUrl);
            console.log('response status:', response.status);
            
            const data = await response.json();
            console.log('proxy response data:', data);
            
            if (!data.success) {
                return { success: false, error: data.error || '请求失败' };
            }
            
            // 解析书源
            let sources;
            try {
                let content = data.body;
                
                console.log('content type:', typeof content);
                console.log('content length:', content ? content.length : 0);
                console.log('content preview:', content ? content.substring(0, 200) : '(empty)');
                
                // 处理可能的JSONP
                if (content && content.startsWith('(')) {
                    content = content.replace(/^\(|\)$/g, '');
                }
                
                sources = JSON.parse(content);
                console.log('parsed sources count:', Array.isArray(sources) ? sources.length : 1);
                
            } catch (e) {
                console.error('解析书源失败:', e);
                console.error('content that failed to parse:', data.body ? data.body.substring(0, 500) : '(empty)');
                return { success: false, error: '解析书源失败: ' + e.message };
            }
            
            if (!Array.isArray(sources)) {
                sources = [sources];
            }
            
            // 提取名称
            let name = '';
            if (sources.length > 0 && sources[0].bookSourceGroup) {
                name = sources[0].bookSourceGroup;
            }
            
            console.log('fetchSubscription success, sources:', sources.length);
            
            return {
                success: true,
                sources: sources,
                name: name,
                url: data.url
            };
            
        } catch (e) {
            console.error('fetchSubscription error:', e);
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
