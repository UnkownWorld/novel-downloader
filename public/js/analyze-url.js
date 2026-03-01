/**
 * URL解析和请求模块
 * 参考 Legado AnalyzeUrl.kt
 */

class AnalyzeUrl {
    constructor(url, options = {}) {
        this.ruleUrl = url;
        this.url = '';
        this.method = 'GET';
        this.body = null;
        this.headers = {};
        this.charset = 'utf-8';
        this.type = null;
        this.retry = 0;
        this.useWebView = false;
        this.webJs = null;
        
        // 参数
        this.key = options.key || '';
        this.page = options.page || 1;
        this.baseUrl = options.baseUrl || '';
        this.source = options.source || null;
        
        // 初始化
        this.initUrl();
    }
    
    /**
     * 初始化URL
     */
    initUrl() {
        let url = this.ruleUrl;
        
        // 执行JS
        url = this.analyzeJs(url);
        
        // 替换参数
        url = this.replaceParams(url);
        
        // 解析URL选项
        this.parseUrlOptions(url);
    }
    
    /**
     * 执行JS代码
     */
    analyzeJs(url) {
        const jsPattern = /<js>([\s\S]*?)<\/js>|@js:([\s\S]*?)(?=<js>|$)/g;
        let result = url;
        let match;
        
        while ((match = jsPattern.exec(url)) !== null) {
            const jsCode = match[1] || match[2];
            if (jsCode) {
                try {
                    const func = new Function('key', 'page', 'baseUrl', 'source', jsCode);
                    result = func(this.key, this.page, this.baseUrl, this.source) || result;
                } catch (e) {
                    console.error('URL JS执行错误:', e);
                }
            }
        }
        
        return result;
    }
    
    /**
     * 替换参数
     */
    replaceParams(url) {
        let result = url;
        
        // 替换 {{key}}
        result = result.replace(/\{\{key\}\}/g, encodeURIComponent(this.key));
        result = result.replace(/\{\{page\}\}/g, this.page);
        
        // 替换 <page1,page2,page3>
        const pagePattern = /<([^>]+)>/g;
        result = result.replace(pagePattern, (match, pages) => {
            const pageList = pages.split(',');
            const index = Math.min(this.page - 1, pageList.length - 1);
            return pageList[index].trim();
        });
        
        return result;
    }
    
    /**
     * 解析URL选项
     */
    parseUrlOptions(url) {
        // 分离URL和选项
        const optionPattern = /,\s*(\{[\s\S]*\})$/;
        const match = url.match(optionPattern);
        
        if (match) {
            this.url = url.substring(0, match.index);
            try {
                const options = JSON.parse(match[1]);
                this.parseOptions(options);
            } catch (e) {
                // 尝试宽松解析
                try {
                    const options = this.looseJsonParse(match[1]);
                    this.parseOptions(options);
                } catch (e2) {
                    this.url = url;
                }
            }
        } else {
            this.url = url;
        }
        
        // 处理相对URL
        if (this.baseUrl && !this.url.startsWith('http')) {
            try {
                this.url = new URL(this.url, this.baseUrl).href;
            } catch (e) {
                // 忽略
            }
        }
    }
    
    /**
     * 解析选项
     */
    parseOptions(options) {
        if (options.method) {
            this.method = options.method.toUpperCase();
        }
        if (options.charset) {
            this.charset = options.charset;
        }
        if (options.headers) {
            this.headers = options.headers;
        }
        if (options.body) {
            this.body = options.body;
        }
        if (options.type) {
            this.type = options.type;
        }
        if (options.retry) {
            this.retry = parseInt(options.retry);
        }
        if (options.webView !== undefined) {
            this.useWebView = options.webView === true || options.webView === 'true';
        }
        if (options.webJs) {
            this.webJs = options.webJs;
        }
    }
    
    /**
     * 宽松JSON解析
     */
    looseJsonParse(str) {
        // 处理单引号
        str = str.replace(/'/g, '"');
        // 处理无引号的键
        str = str.replace(/(\w+):/g, '"$1":');
        return JSON.parse(str);
    }
    
    /**
     * 发起请求
     */
    async getStrResponse() {
        const startTime = Date.now();
        
        try {
            const options = {
                method: this.method,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    ...this.headers
                }
            };
            
            if (this.body && this.method === 'POST') {
                if (typeof this.body === 'object') {
                    options.body = JSON.stringify(this.body);
                    options.headers['Content-Type'] = 'application/json';
                } else {
                    options.body = this.body;
                    if (!options.headers['Content-Type']) {
                        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                    }
                }
            }
            
            // 通过代理请求
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(this.url)}&options=${encodeURIComponent(JSON.stringify(options))}`;
            
            const response = await fetch(proxyUrl);
            const data = await response.json();
            
            return {
                url: data.url || this.url,
                body: data.body || data.content || '',
                raw: data,
                success: data.success !== false,
                responseTime: Date.now() - startTime
            };
            
        } catch (e) {
            console.error('请求错误:', e);
            return {
                url: this.url,
                body: '',
                error: e.message,
                success: false,
                responseTime: Date.now() - startTime
            };
        }
    }
}

// 导出
window.AnalyzeUrl = AnalyzeUrl;
