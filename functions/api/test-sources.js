/**
 * 书源测试API
 * 参考 Legado CheckSourceService.kt
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { sources, keyword, checkSearch, checkInfo, checkToc, checkContent } = body;
        
        if (!sources || !Array.isArray(sources) || sources.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供书源列表' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const results = [];
        const testKeyword = keyword || '我的';
        const timeout = 30000; // 30秒超时
        
        for (const source of sources.slice(0, 20)) { // 每次最多测试20个
            const result = {
                bookSourceUrl: source.bookSourceUrl,
                bookSourceName: source.bookSourceName,
                success: false,
                searchOk: false,
                infoOk: false,
                tocOk: false,
                contentOk: false,
                error: '',
                responseTime: 0
            };
            
            const startTime = Date.now();
            
            try {
                // 测试搜索
                if (checkSearch !== false && source.searchUrl) {
                    const searchResult = await testSearch(source, testKeyword, timeout);
                    result.searchOk = searchResult.success;
                    
                    if (searchResult.success && searchResult.books && searchResult.books.length > 0) {
                        // 测试详情
                        if (checkInfo !== false) {
                            const book = searchResult.books[0];
                            const infoResult = await testBookInfo(source, book, timeout);
                            result.infoOk = infoResult.success;
                            
                            if (infoResult.success) {
                                // 测试目录
                                if (checkToc !== false) {
                                    const tocResult = await testChapterList(source, infoResult.book || book, timeout);
                                    result.tocOk = tocResult.success;
                                    
                                    if (tocResult.success && tocResult.chapters && tocResult.chapters.length > 0) {
                                        // 测试内容
                                        if (checkContent !== false) {
                                            const contentResult = await testContent(source, infoResult.book || book, tocResult.chapters[0], timeout);
                                            result.contentOk = contentResult.success;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                result.success = result.searchOk;
                result.responseTime = Date.now() - startTime;
                
            } catch (e) {
                result.error = e.message;
                result.responseTime = Date.now() - startTime;
            }
            
            results.push(result);
        }
        
        const valid = results.filter(r => r.success).length;
        const invalid = results.filter(r => !r.success).length;
        
        return new Response(JSON.stringify({
            success: true,
            total: results.length,
            valid: valid,
            invalid: invalid,
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
 * 测试搜索
 */
async function testSearch(source, keyword, timeout) {
    try {
        const searchUrl = buildSearchUrl(source, keyword);
        const response = await fetchWithTimeout(searchUrl.url, {
            method: searchUrl.method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...(searchUrl.headers || {})
            },
            body: searchUrl.body
        }, timeout);
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }
        
        const html = await response.text();
        const books = parseSearchResult(html, source);
        
        return { success: books.length > 0, books: books };
        
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * 测试书籍信息
 */
async function testBookInfo(source, book, timeout) {
    try {
        const response = await fetchWithTimeout(book.bookUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, timeout);
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }
        
        const html = await response.text();
        const info = parseBookInfo(html, source);
        
        return { success: !!info.name, book: { ...book, ...info } };
        
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * 测试目录
 */
async function testChapterList(source, book, timeout) {
    try {
        const tocUrl = book.tocUrl || book.bookUrl;
        const response = await fetchWithTimeout(tocUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, timeout);
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }
        
        const html = await response.text();
        const chapters = parseChapterList(html, source);
        
        return { success: chapters.length > 0, chapters: chapters };
        
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * 测试内容
 */
async function testContent(source, book, chapter, timeout) {
    try {
        const response = await fetchWithTimeout(chapter.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, timeout);
        
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }
        
        const html = await response.text();
        const content = parseContent(html, source);
        
        return { success: content.length > 100 };
        
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * 构建搜索URL
 */
function buildSearchUrl(source, keyword) {
    let searchUrl = source.searchUrl;
    const baseUrl = source.bookSourceUrl;
    const method = source.searchUrl.includes('POST') ? 'POST' : 'GET';
    
    // 替换关键词
    searchUrl = searchUrl.replace(/\{\{key\}\}/g, encodeURIComponent(keyword));
    searchUrl = searchUrl.replace(/\{\{keyword\}\}/g, encodeURIComponent(keyword));
    searchUrl = searchUrl.replace(/searchKey=([^&]*)/g, `searchKey=${encodeURIComponent(keyword)}`);
    searchUrl = searchUrl.replace(/searchkey=([^&]*)/g, `searchkey=${encodeURIComponent(keyword)}`);
    
    // 解析URL选项
    const optionMatch = searchUrl.match(/,\s*(\{[\s\S]*\})$/);
    let headers = {};
    let body = null;
    let actualUrl = searchUrl;
    
    if (optionMatch) {
        actualUrl = searchUrl.substring(0, optionMatch.index).trim();
        try {
            const options = JSON.parse(optionMatch[1]);
            headers = options.headers || {};
            body = options.body;
            if (typeof body === 'string') {
                body = body.replace(/\{\{key\}\}/g, encodeURIComponent(keyword));
                body = body.replace(/\{\{keyword\}\}/g, encodeURIComponent(keyword));
            }
        } catch (e) {
            // 忽略
        }
    }
    
    // 判断是否为相对路径，需要拼接 baseUrl
    if (actualUrl && !actualUrl.startsWith('http://') && !actualUrl.startsWith('https://')) {
        actualUrl = baseUrl.replace(/\/$/, '') + (actualUrl.startsWith('/') ? actualUrl : '/' + actualUrl);
    }
    
    return { url: actualUrl, method, headers, body };
}

/**
 * 解析搜索结果
 */
function parseSearchResult(html, source) {
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
                bookUrl: getElementAttr(el, rule.bookUrl, 'href', html),
                coverUrl: getElementAttr(el, rule.coverUrl, 'src', html),
                intro: getElementText(el, rule.intro),
                lastChapter: getElementText(el, rule.lastChapter)
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
 * 解析书籍信息
 */
function parseBookInfo(html, source) {
    const rule = source.ruleBookInfo;
    if (!rule) return {};
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    return {
        name: getElementText(doc, rule.name),
        author: getElementText(doc, rule.author),
        intro: getElementText(doc, rule.intro),
        coverUrl: getElementAttr(doc, rule.coverUrl, 'src', html),
        tocUrl: getElementAttr(doc, rule.tocUrl, 'href', html),
        lastChapter: getElementText(doc, rule.lastChapter)
    };
}

/**
 * 解析目录
 */
function parseChapterList(html, source) {
    const chapters = [];
    const rule = source.ruleToc;
    
    if (!rule || !rule.chapterList) return chapters;
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const elements = doc.querySelectorAll(rule.chapterList);
        
        elements.forEach((el, index) => {
            const chapter = {
                index: index,
                title: getElementText(el, rule.chapterName),
                url: getElementAttr(el, rule.chapterUrl, 'href', html)
            };
            
            if (chapter.title && chapter.url) {
                chapters.push(chapter);
            }
        });
    } catch (e) {
        console.error('解析目录错误:', e);
    }
    
    return chapters;
}

/**
 * 解析内容
 */
function parseContent(html, source) {
    const rule = source.ruleContent;
    if (!rule || !rule.content) return '';
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const element = doc.querySelector(rule.content);
        return element ? element.textContent : '';
    } catch (e) {
        return '';
    }
}

/**
 * 获取元素文本
 */
function getElementText(parent, selector) {
    if (!selector) return '';
    try {
        const el = parent.querySelector ? parent.querySelector(selector) : null;
        return el ? el.textContent.trim() : '';
    } catch (e) {
        return '';
    }
}

/**
 * 获取元素属性
 */
function getElementAttr(parent, selector, attr, baseUrl) {
    if (!selector) return '';
    try {
        const el = parent.querySelector ? parent.querySelector(selector) : null;
        if (!el) return '';
        
        let value = el.getAttribute(attr) || el.getAttribute('data-' + attr) || '';
        
        // 转换为绝对URL
        if (value && (attr === 'href' || attr === 'src') && !value.startsWith('http')) {
            const base = new URL(baseUrl);
            value = new URL(value, base).href;
        }
        
        return value;
    } catch (e) {
        return '';
    }
}

/**
 * 带超时的fetch
 */
async function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}
