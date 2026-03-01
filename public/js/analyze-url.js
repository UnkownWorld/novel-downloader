/**
 * AnalyzeUrl模块 - 参考Legado实现
 * URL解析和请求构建
 */

class AnalyzeUrl {
    constructor(urlRule, options = {}) {
        this.urlRule = urlRule;
        this.source = options.source;
        this.baseUrl = options.baseUrl || '';
        this.key = options.key || '';
        this.page = options.page || 1;
        
        this.url = '';
        this.method = 'GET';
        this.body = null;
        this.headers = {};
        this.charset = 'UTF-8';
        this.type = null;
        
        this.parse();
    }

    /**
     * 解析URL规则
     */
    parse() {
        let ruleUrl = this.urlRule;
        
        // 执行JS规则
        if (ruleUrl.includes('<js>') || ruleUrl.includes('@js:')) {
            ruleUrl = this.evalJs(ruleUrl);
        }
        
        // 替换参数
        ruleUrl = this.replaceParams(ruleUrl);
        
        // 解析URL和选项
        this.parseUrlOptions(ruleUrl);
    }

    /**
     * 替换参数
     */
    replaceParams(url) {
        let result = url;
        
        // 替换{{key}}
        if (this.key) {
            result = result.replace(/\{\{key\}\}/g, encodeURIComponent(this.key));
            result = result.replace(/searchKey/g, encodeURIComponent(this.key));
        }
        
        // 替换{{page}}
        result = result.replace(/\{\{page\}\}/g, this.page);
        
        // 替换page规则 (格式: page1,page2,page3)
        const pageMatch = result.match(/\{\{page:(.+?)\}\}/);
        if (pageMatch) {
            const pages = pageMatch[1].split(',');
            const pageIndex = Math.min(this.page - 1, pages.length - 1);
            result = result.replace(pageMatch[0], pages[pageIndex].trim());
        }
        
        return result;
    }

    /**
     * 解析URL选项
     */
    parseUrlOptions(url) {
        // 检查是否有选项 (格式: url,{options})
        const braceIndex = url.indexOf(',{');
        if (braceIndex < 0) {
            this.url = this.resolveUrl(url);
            return;
        }
        
        const urlPart = url.substring(0, braceIndex);
        const optionsStr = url.substring(braceIndex + 1);
        
        this.url = this.resolveUrl(urlPart);
        
        try {
            const options = JSON.parse(optionsStr);
            
            this.method = (options.method || 'GET').toUpperCase();
            this.body = options.body ? this.replaceParams(options.body) : null;
            this.charset = options.charset || 'UTF-8';
            this.type = options.type || null;
            
            if (options.headers) {
                this.headers = options.headers;
            }
            
        } catch (e) {
            console.warn('解析URL选项失败:', e);
        }
    }

    /**
     * 解析相对URL
     */
    resolveUrl(url) {
        if (!url) return '';
        
        // 已经是绝对URL
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        
        // 使用baseUrl
        if (this.baseUrl) {
            try {
                return new URL(url, this.baseUrl).href;
            } catch (e) {
                return this.baseUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
            }
        }
        
        // 使用书源URL
        if (this.source && this.source.bookSourceUrl) {
            return this.source.bookSourceUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
        }
        
        return url;
    }

    /**
     * 执行JS规则
     */
    evalJs(ruleUrl) {
        // 简化实现，实际需要完整的JS执行环境
        console.warn('URL中的JS规则需要服务端执行:', ruleUrl);
        return ruleUrl.replace(/<js>.*<\/js>/g, '').replace(/@js:.*/g, '');
    }

    /**
     * 获取请求选项
     */
    getOptions() {
        const options = {
            method: this.method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                ...this.headers
            }
        };
        
        if (this.body && this.method === 'POST') {
            options.body = this.body;
            if (!options.headers['Content-Type']) {
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        }
        
        return options;
    }

    /**
     * 获取完整URL
     */
    getUrl() {
        return this.url;
    }
}

// 导出
window.AnalyzeUrl = AnalyzeUrl;
