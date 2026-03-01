/**
 * 书籍信息API
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { bookUrl, source } = body;
        
        if (!bookUrl) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供书籍URL' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        if (!source) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供书源信息' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 获取书籍页面
        const response = await fetch(bookUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        
        if (!response.ok) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: `HTTP ${response.status}` 
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const html = await response.text();
        const rule = source.ruleBookInfo;
        
        // 解析书籍信息
        const book = parseBookInfo(html, rule, response.url);
        
        return new Response(JSON.stringify({
            success: true,
            book: book
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
 * 解析书籍信息
 */
function parseBookInfo(html, rule, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const book = {
        bookUrl: baseUrl,
        name: getElementText(doc, rule?.name),
        author: getElementText(doc, rule?.author),
        intro: getElementText(doc, rule?.intro),
        coverUrl: getElementUrl(doc, rule?.coverUrl, baseUrl),
        tocUrl: getElementUrl(doc, rule?.tocUrl, baseUrl) || baseUrl,
        kind: getElementText(doc, rule?.kind),
        lastChapter: getElementText(doc, rule?.lastChapter),
        wordCount: getElementText(doc, rule?.wordCount)
    };
    
    return book;
}

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
            }
            return el.getAttribute(attr) || '';
        }
        
        const el = parent.querySelector ? parent.querySelector(selector) : null;
        return el ? el.textContent.trim() : '';
    } catch (e) {
        return '';
    }
}

function getElementUrl(parent, selector, baseUrl) {
    if (!selector) return '';
    try {
        let el, attr = 'href';
        
        if (selector.includes('@')) {
            const parts = selector.split('@');
            el = parent.querySelector(parts[0]);
            attr = parts[1] || 'href';
        } else {
            el = parent.querySelector(selector);
        }
        
        if (!el) return '';
        
        let value = el.getAttribute(attr) || '';
        
        if (value && !value.startsWith('http')) {
            try {
                value = new URL(value, baseUrl).href;
            } catch (e) {
                // 忽略
            }
        }
        
        return value;
    } catch (e) {
        return '';
    }
}
