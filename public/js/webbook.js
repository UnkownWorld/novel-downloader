/**
 * WebBook模块 - 参考Legado实现
 * 提供完整的书源操作功能
 */

class WebBook {
    constructor(source) {
        this.source = source;
        this.ruleParser = new RuleParser();
    }

    /**
     * 搜索书籍
     */
    async searchBook(keyword, page = 1) {
        const searchUrl = this.source.searchUrl;
        if (!searchUrl) {
            throw new Error('搜索URL不能为空');
        }

        // 解析搜索URL
        const urlInfo = this.parseUrl(searchUrl, { key: keyword, page: page });
        
        // 发起请求
        const response = await this.fetchUrl(urlInfo);
        
        // 解析结果
        return this.parseSearchResult(response);
    }

    /**
     * 获取书籍信息
     */
    async getBookInfo(bookUrl) {
        const response = await this.fetchUrl({
            url: bookUrl,
            method: 'GET'
        });
        
        return HtmlParser.parseBookInfo(
            response.body,
            this.source.ruleBookInfo,
            response.url
        );
    }

    /**
     * 获取章节列表
     */
    async getChapterList(tocUrl) {
        const response = await this.fetchUrl({
            url: tocUrl,
            method: 'GET'
        });
        
        return HtmlParser.parseChapterList(
            response.body,
            this.source.ruleToc,
            response.url
        );
    }

    /**
     * 获取章节内容
     */
    async getContent(chapterUrl, nextChapterUrl = null) {
        const response = await this.fetchUrl({
            url: chapterUrl,
            method: 'GET'
        });
        
        return HtmlParser.parseContent(
            response.body,
            this.source.ruleContent,
            response.url
        );
    }

    /**
     * 解析URL规则
     */
    parseUrl(urlRule, params = {}) {
        let url = urlRule;
        let method = 'GET';
        let body = null;
        let headers = {};
        let charset = 'UTF-8';

        // 替换参数
        url = url.replace(/\{\{key\}\}/g, encodeURIComponent(params.key || ''));
        url = url.replace(/\{\{page\}\}/g, params.page || 1);

        // 解析URL选项 (格式: url,{options})
        const commaIndex = url.indexOf(',{');
        if (commaIndex > 0) {
            try {
                const optionsStr = url.substring(commaIndex + 1);
                const options = JSON.parse(optionsStr);
                url = url.substring(0, commaIndex);
                
                method = options.method || 'GET';
                body = options.body;
                headers = options.headers || {};
                charset = options.charset || 'UTF-8';

                // 替换body中的参数
                if (body) {
                    body = body.replace(/\{\{key\}\}/g, encodeURIComponent(params.key || ''));
                    body = body.replace(/\{\{page\}\}/g, params.page || 1);
                }
            } catch (e) {
                console.warn('解析URL选项失败:', e);
            }
        }

        // 处理相对URL
        if (!url.startsWith('http')) {
            url = this.source.bookSourceUrl.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
        }

        return { url, method, body, headers, charset };
    }

    /**
     * 发起请求
     */
    async fetchUrl(urlInfo) {
        const options = {
            method: urlInfo.method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                ...urlInfo.headers
            }
        };

        if (urlInfo.body && urlInfo.method === 'POST') {
            options.body = urlInfo.body;
            if (!options.headers['Content-Type']) {
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        }

        // 通过代理请求
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(urlInfo.url)}&options=${encodeURIComponent(JSON.stringify(options))}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '请求失败');
        }

        return {
            url: data.url,
            body: data.body,
            status: data.status
        };
    }

    /**
     * 解析搜索结果
     */
    parseSearchResult(response) {
        return HtmlParser.parseSearchResult(
            response.body,
            this.source.ruleSearch,
            response.url,
            this.source
        );
    }
}

// 导出
window.WebBook = WebBook;
