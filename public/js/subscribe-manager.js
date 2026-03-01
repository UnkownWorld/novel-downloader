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
     * 支持三种格式：
     * 1. 单个书源对象: {bookSourceName: "xxx", ...}
     * 2. 书源数组: [{书源1}, {书源2}, ...]
     * 3. 订阅配置: {"sources": ["url1", "url2"], ...}
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
                
                const parsed = JSON.parse(content);
                console.log('parsed type:', Array.isArray(parsed) ? 'array' : typeof parsed);
                
                // 判断返回内容的类型
                if (this.isSubscriptionConfig(parsed)) {
                    // 订阅配置格式 - 需要遍历URL获取书源
                    console.log('检测到订阅配置格式，开始遍历URL获取书源...');
                    const result = await this.fetchSourcesFromConfig(parsed);
                    return result;
                } else if (Array.isArray(parsed)) {
                    // 书源数组
                    sources = parsed;
                    console.log('检测到书源数组，数量:', sources.length);
                } else if (this.isValidBookSource(parsed)) {
                    // 单个书源对象
                    sources = [parsed];
                    console.log('检测到单个书源对象');
                } else {
                    console.error('无法识别的内容格式:', parsed);
                    return { success: false, error: '无法识别的内容格式' };
                }
                
            } catch (e) {
                console.error('解析书源失败:', e);
                console.error('content that failed to parse:', data.body ? data.body.substring(0, 500) : '(empty)');
                return { success: false, error: '解析书源失败: ' + e.message };
            }
            
            // 过滤有效的书源
            sources = sources.filter(s => this.isValidBookSource(s));
            console.log('有效书源数量:', sources.length);
            
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
     * 判断是否为订阅配置格式
     * 订阅配置格式: {"sources": ["url1", "url2"], ...}
     */
    isSubscriptionConfig(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return false;
        }
        
        // 检查是否有 sources 字段且为数组
        if (data.sources && Array.isArray(data.sources)) {
            // 进一步检查 sources 数组元素是否为 URL 字符串
            if (data.sources.length > 0 && typeof data.sources[0] === 'string') {
                // 检查是否看起来像 URL
                const firstItem = data.sources[0];
                if (firstItem.startsWith('http://') || firstItem.startsWith('https://')) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * 判断是否为有效的书源对象
     */
    isValidBookSource(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return false;
        }
        // 必须有书源名称和URL
        return !!(data.bookSourceName && data.bookSourceUrl);
    }
    
    /**
     * 从订阅配置中获取书源
     */
    async fetchSourcesFromConfig(config) {
        const urls = config.sources || [];
        const allSources = [];
        const errors = [];
        
        console.log(`订阅配置包含 ${urls.length} 个URL`);
        
        for (let i = 0; i < urls.length; i++) {
            const sourceUrl = urls[i];
            console.log(`正在获取第 ${i + 1}/${urls.length} 个URL: ${sourceUrl}`);
            
            try {
                const proxyUrl = `/api/proxy?url=${encodeURIComponent(sourceUrl)}`;
                const response = await fetch(proxyUrl);
                const data = await response.json();
                
                if (!data.success) {
                    errors.push(`${sourceUrl}: ${data.error}`);
                    console.error(`获取 ${sourceUrl} 失败:`, data.error);
                    continue;
                }
                
                let content = data.body;
                if (content && content.startsWith('(')) {
                    content = content.replace(/^\(|\)$/g, '');
                }
                
                const parsed = JSON.parse(content);
                let sources = [];
                
                if (Array.isArray(parsed)) {
                    sources = parsed;
                } else if (this.isValidBookSource(parsed)) {
                    sources = [parsed];
                }
                
                // 过滤有效书源
                sources = sources.filter(s => this.isValidBookSource(s));
                console.log(`从 ${sourceUrl} 获取到 ${sources.length} 个书源`);
                
                allSources.push(...sources);
                
            } catch (e) {
                errors.push(`${sourceUrl}: ${e.message}`);
                console.error(`获取 ${sourceUrl} 异常:`, e);
            }
        }
        
        // 提取名称
        let name = config.name || '';
        if (!name && allSources.length > 0 && allSources[0].bookSourceGroup) {
            name = allSources[0].bookSourceGroup;
        }
        
        if (allSources.length === 0) {
            return {
                success: false,
                error: errors.length > 0 ? errors.join('; ') : '没有获取到任何书源'
            };
        }
        
        return {
            success: true,
            sources: allSources,
            name: name,
            warnings: errors.length > 0 ? errors : null
        };
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
