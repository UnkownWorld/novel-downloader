/**
 * 搜索API
 * 支持SSE实时搜索
 */

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    // 检查是否SSE请求
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('text/event-stream') || url.searchParams.get('sse') === 'true') {
        return handleSSESearch(context);
    }
    
    return handleNormalSearch(context);
}

/**
 * 普通搜索
 */
async function handleNormalSearch(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { keyword, sources, page, concurrent } = body;
        
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
        const concurrentCount = Math.min(concurrent || 10, 20);
        const timeout = 30000;
        
        // 并发搜索
        const searchPromises = sources.slice(0, concurrentCount).map(source => 
            searchBookFromSource(source, keyword, page || 1, timeout)
        );
        
        const searchResults = await Promise.allSettled(searchPromises);
        
        for (const result of searchResults) {
            if (result.status === 'fulfilled' && result.value.books) {
                results.push(...result.value.books);
            }
        }
        
        // 去重合并
        const mergedResults = mergeSearchResults(results, keyword);
        
        return new Response(JSON.stringify({
            success: true,
            keyword: keyword,
            total: mergedResults.length,
            results: mergedResults
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
 * SSE实时搜索
 */
async function handleSSESearch(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    const keyword = url.searchParams.get('keyword') || url.searchParams.get('key');
    const sourcesStr = url.searchParams.get('sources');
    const concurrent = parseInt(url.searchParams.get('concurrent') || '10');
    
    if (!keyword || !sourcesStr) {
        return new Response('event: error\ndata: {"error":"参数错误"}\n\n', {
            headers: { 'Content-Type': 'text/event-stream' }
        });
    }
    
    let sources;
    try {
        sources = JSON.parse(decodeURIComponent(sourcesStr));
    } catch (e) {
        return new Response('event: error\ndata: {"error":"书源解析错误"}\n\n', {
            headers: { 'Content-Type': 'text/event-stream' }
        });
    }
    
    // 创建可读流
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    
    // 后台执行搜索
    (async () => {
        const allResults = [];
        const batchSize = Math.min(concurrent, 10);
        
        for (let i = 0; i < sources.length; i += batchSize) {
            const batch = sources.slice(i, i + batchSize);
            
            const searchPromises = batch.map(source => 
                searchBookFromSource(source, keyword, 1, 30000)
            );
            
            const results = await Promise.allSettled(searchPromises);
            
            const batchResults = [];
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.books) {
                    batchResults.push(...result.value.books);
                    allResults.push(...result.value.books);
                }
            }
            
            // 发送本批结果
            if (batchResults.length > 0) {
                await writer.write(encoder.encode(
                    `data: ${JSON.stringify({
                        lastIndex: i + batch.length - 1,
                        data: batchResults
                    })}\n\n`
                ));
            }
        }
        
        // 发送结束事件
        await writer.write(encoder.encode(
            `event: end\ndata: ${JSON.stringify({
                total: allResults.length
            })}\n\n`
        ));
        
        await writer.close();
    })();
    
    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

/**
 * 从单个书源搜索
 */
async function searchBookFromSource(source, keyword, page, timeout) {
    const startTime = Date.now();
    
    try {
        if (!source.searchUrl) {
            return { success: false, error: '书源未配置搜索URL', books: [] };
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...headers
            },
            body: body,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return { 
                success: false, 
                error: `HTTP ${response.status}`,
                books: [],
                responseTime: Date.now() - startTime
            };
        }
        
        const html = await response.text();
        const books = parseSearchResult(html, source, response.url);
        
        return {
            success: true,
            books: books,
            responseTime: Date.now() - startTime
        };
        
    } catch (e) {
        return {
            success: false,
            error: e.message,
            books: [],
            responseTime: Date.now() - startTime
        };
    }
}

/**
 * 解析搜索结果
 */
function parseSearchResult(html, source, baseUrl) {
    const books = [];
    const rule = source.ruleSearch;
    
    if (!rule || !rule.bookList) return books;
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const elements = doc.querySelectorAll(rule.bookList);
        
        elements.forEach(el => {
            const book = {
                name: getElementText(el, rule.name),
                author: getElementText(el, rule.author),
                bookUrl: getElementUrl(el, rule.bookUrl, baseUrl),
                coverUrl: getElementUrl(el, rule.coverUrl, baseUrl),
                intro: getElementText(el, rule.intro),
                kind: getElementText(el, rule.kind),
                lastChapter: getElementText(el, rule.lastChapter),
                wordCount: getElementText(el, rule.wordCount),
                origin: source.bookSourceUrl,
                originName: source.bookSourceName,
                type: source.bookSourceType || 0,
                time: Date.now()
            };
            
            if (book.name && book.bookUrl) {
                books.push(book);
            }
        });
    } catch (e) {
        console.error('解析搜索结果错误:', e);
    }
    
    return books;
}

/**
 * 合并搜索结果
 */
function mergeSearchResults(results, keyword) {
    const merged = new Map();
    
    // 按书名+作者分组
    for (const book of results) {
        const key = `${book.name}_${book.author}`;
        
        if (merged.has(key)) {
            const existing = merged.get(key);
            // 合并来源
            if (!existing.origins) {
                existing.origins = [existing.origin];
            }
            existing.origins.push(book.origin);
        } else {
            merged.set(key, book);
        }
    }
    
    // 排序：精确匹配优先
    const sorted = Array.from(merged.values()).sort((a, b) => {
        const aExact = a.name === keyword || a.author === keyword;
        const bExact = b.name === keyword || b.author === keyword;
        
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        const aContains = a.name.includes(keyword) || a.author.includes(keyword);
        const bContains = b.name.includes(keyword) || b.author.includes(keyword);
        
        if (aContains && !bContains) return -1;
        if (!aContains && bContains) return 1;
        
        // 按来源数量排序
        const aOrigins = a.origins?.length || 1;
        const bOrigins = b.origins?.length || 1;
        return bOrigins - aOrigins;
    });
    
    return sorted;
}

/**
 * 获取元素文本
 */
function getElementText(parent, selector) {
    if (!selector) return '';
    try {
        // 处理属性选择器
        if (selector.includes('@')) {
            const parts = selector.split('@');
            const el = parent.querySelector(parts[0]);
            if (!el) return '';
            const attr = parts[1];
            if (attr === 'text' || attr === 'textContent') {
                return el.textContent.trim();
            } else if (attr === 'html' || attr === 'innerHTML') {
                return el.innerHTML;
            }
            return el.getAttribute(attr) || '';
        }
        
        const el = parent.querySelector ? parent.querySelector(selector) : null;
        return el ? el.textContent.trim() : '';
    } catch (e) {
        return '';
    }
}

/**
 * 获取元素URL
 */
function getElementUrl(parent, selector, baseUrl) {
    if (!selector) return '';
    try {
        let el, attr = 'href';
        
        // 处理属性选择器
        if (selector.includes('@')) {
            const parts = selector.split('@');
            el = parent.querySelector(parts[0]);
            attr = parts[1] || 'href';
        } else {
            el = parent.querySelector(selector);
        }
        
        if (!el) return '';
        
        let value = el.getAttribute(attr) || el.getAttribute('data-' + attr) || '';
        
        // 转换为绝对URL
        if (value && !value.startsWith('http')) {
            try {
                const base = new URL(baseUrl);
                value = new URL(value, base).href;
            } catch (e) {
                // 忽略
            }
        }
        
        return value;
    } catch (e) {
        return '';
    }
}
