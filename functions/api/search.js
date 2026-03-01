/**
 * 搜索API - 带调试功能
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { sources, keyword, page, debug } = body;
        
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
        
        const fetchPromises = sources.slice(0, concurrentCount).map(source => 
            fetchSearchHtml(source, keyword, page || 1, timeout, debug)
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
            encodedKeyword: encodeURIComponent(keyword),
            results: results,
            debug: debug || false
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
async function fetchSearchHtml(source, keyword, page, timeout, debug) {
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
        const baseUrl = source.bookSourceUrl;
        
        // 多种编码方式尝试
        const encodedKeyword = encodeURIComponent(keyword);
        
        // 替换关键词（支持多种占位符）
        searchUrl = searchUrl.replace(/\{\{key\}\}/g, encodedKeyword);
        searchUrl = searchUrl.replace(/\{\{keyword\}\}/g, encodedKeyword);
        searchUrl = searchUrl.replace(/searchKey=([^&]*)/g, `searchKey=${encodedKeyword}`);
        searchUrl = searchUrl.replace(/searchkey=([^&]*)/g, `searchkey=${encodedKeyword}`);
        searchUrl = searchUrl.replace(/q=([^&]*)/g, `q=${encodedKeyword}`);
        searchUrl = searchUrl.replace(/wd=([^&]*)/g, `wd=${encodedKeyword}`);
        searchUrl = searchUrl.replace(/\{\{page\}\}/g, page);
        
        // 解析URL选项（格式: "url,{options}"）
        let method = 'GET';
        let headers = {};
        let body = null;
        let actualUrl = searchUrl;
        
        // 先分离 URL 和选项
        const optionMatch = searchUrl.match(/,\s*(\{[\s\S]*\})$/);
        if (optionMatch) {
            actualUrl = searchUrl.substring(0, optionMatch.index).trim();
            try {
                const options = JSON.parse(optionMatch[1]);
                method = options.method || 'GET';
                headers = options.headers || {};
                body = options.body;
                if (typeof body === 'string') {
                    body = body.replace(/\{\{key\}\}/g, encodedKeyword);
                    body = body.replace(/\{\{keyword\}\}/g, encodedKeyword);
                }
            } catch (e) {
                console.error('解析搜索URL选项失败:', e);
            }
        }
        
        // 判断是否为相对路径，需要拼接 baseUrl
        if (actualUrl && !actualUrl.startsWith('http://') && !actualUrl.startsWith('https://')) {
            // 相对路径，拼接 baseUrl
            actualUrl = baseUrl.replace(/\/$/, '') + (actualUrl.startsWith('/') ? actualUrl : '/' + actualUrl);
        }
        
        // 发起请求 - 不自动跟随重定向，以便检测搜索成功跳转
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        let response = await fetch(actualUrl, {
            method: method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                ...headers
            },
            body: method === 'POST' ? body : undefined,
            signal: controller.signal,
            redirect: 'manual'  // 不自动跟随重定向
        });
        
        clearTimeout(timeoutId);
        
        // 检查是否是重定向（搜索成功跳转到书籍页面）
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            const redirectUrl = response.headers.get('location');
            const fullRedirectUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, actualUrl).href;
            
            console.log('搜索重定向到:', fullRedirectUrl);
            
            // 检查是否重定向到书籍页面（通常是 /books/数字/ 格式）
            if (fullRedirectUrl.match(/\/books\/\d+\/?$/)) {
                // 搜索成功，直接跳转到唯一匹配的书籍
                // 获取书籍页面内容
                const bookResponse = await fetch(fullRedirectUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                
                const bookHtml = await bookResponse.text();
                
                // 返回特殊结果，表示直接跳转到书籍页面
                return {
                    success: true,
                    source: source.bookSourceUrl,
                    sourceName: source.bookSourceName,
                    ruleSearch: source.ruleSearch,
                    html: bookHtml,
                    baseUrl: fullRedirectUrl,
                    requestUrl: actualUrl,
                    responseTime: Date.now() - startTime,
                    htmlLength: bookHtml.length,
                    isRedirect: true,  // 标记这是重定向结果
                    redirectBookUrl: fullRedirectUrl
                };
            }
            
            // 其他重定向，手动跟随
            response = await fetch(fullRedirectUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
        }
        
        if (!response.ok && response.status !== 0) {
            return { 
                success: false, 
                source: source.bookSourceUrl,
                sourceName: source.bookSourceName,
                error: `HTTP ${response.status}`,
                html: '',
                requestUrl: actualUrl,
                responseTime: Date.now() - startTime
            };
        }
        
        const html = await response.text();
        
        // 检查是否被过滤
        const filteredIndicators = [
            '没有找到',
            '暂无结果',
            '无搜索结果',
            '没有相关',
            '未找到',
            '敏感词',
            '违规',
            '禁止搜索'
        ];
        
        let isFiltered = false;
        let filterReason = '';
        
        for (const indicator of filteredIndicators) {
            if (html.includes(indicator)) {
                isFiltered = true;
                filterReason = indicator;
                break;
            }
        }
        
        const result = {
            success: true,
            source: source.bookSourceUrl,
            sourceName: source.bookSourceName,
            ruleSearch: source.ruleSearch,
            html: html,
            baseUrl: response.url,
            requestUrl: actualUrl,
            responseTime: Date.now() - startTime,
            htmlLength: html.length,
            isFiltered: isFiltered,
            filterReason: filterReason
        };
        
        // 调试模式下返回更多信息
        if (debug) {
            result.debug = {
                originalSearchUrl: source.searchUrl,
                finalUrl: actualUrl,
                method: method,
                headers: headers,
                body: body,
                responseStatus: response.status,
                responseHeaders: Object.fromEntries(response.headers)
            };
        }
        
        return result;
        
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
