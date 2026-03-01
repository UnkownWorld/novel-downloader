/**
 * 搜索API - 仅负责获取HTML，解析在前端进行
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { sources, keyword, page } = body;
        
        if (!keyword) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请输入搜索关键词' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        if (!sources || sources.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '没有可用的书源' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const results = [];
        const concurrentCount = Math.min(sources.length, 10);
        const timeout = 30000;
        
        // 并发请求
        const fetchPromises = sources.slice(0, concurrentCount).map(source => 
            fetchSearchHtml(source, keyword, page || 1, timeout)
        );
        
        const fetchResults = await Promise.allSettled(fetchPromises);
        
        for (const result of fetchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
        }
        
        return new Response(JSON.stringify({
            success: true,
            keyword: keyword,
            results: results
        }), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
        
    } catch (e) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: e.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * 获取搜索页面HTML
 */
async function fetchSearchHtml(source, keyword, page, timeout) {
    const startTime = Date.now();
    
    try {
        if (!source.searchUrl) {
            return { 
                success: false, 
                source: source.bookSourceUrl,
                sourceName: source.bookSourceName,
                error: '书源未配置搜索URL',
                html: ''
            };
        }
        
        // 构建搜索URL
        let searchUrl = source.searchUrl;
        searchUrl = searchUrl.replace(/\{\{key\}\}/g, encodeURIComponent(keyword));
        searchUrl = searchUrl.replace(/\{\{page\}\}/g, page);
        
        // 解析URL选项
        let method = 'GET';
        let headers = {};
        let body = null;
        
        const optionMatch = searchUrl.match(/,\s*(\{[\s\S]*\})$/);
        if (optionMatch) {
            searchUrl = searchUrl.substring(0, optionMatch.index);
            try {
                const options = JSON.parse(optionMatch[1]);
                method = options.method || 'GET';
                headers = options.headers || {};
                body = options.body;
                if (typeof body === 'string') {
                    body = body.replace(/\{\{key\}\}/g, keyword);
                }
            } catch (e) {
                // 忽略
            }
        }
        
        // 发起请求
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(searchUrl, {
            method: method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                ...headers
            },
            body: method === 'POST' ? body : undefined,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return { 
                success: false, 
                source: source.bookSourceUrl,
                sourceName: source.bookSourceName,
                error: `HTTP ${response.status}`,
                html: '',
                responseTime: Date.now() - startTime
            };
        }
        
        const html = await response.text();
        
        return {
            success: true,
            source: source.bookSourceUrl,
            sourceName: source.bookSourceName,
            ruleSearch: source.ruleSearch,
            html: html,
            baseUrl: response.url,
            responseTime: Date.now() - startTime
        };
        
    } catch (e) {
        return {
            success: false,
            source: source.bookSourceUrl,
            sourceName: source.bookSourceName,
            error: e.message,
            html: '',
            responseTime: Date.now() - startTime
        };
    }
}
