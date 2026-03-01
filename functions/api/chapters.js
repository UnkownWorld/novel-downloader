/**
 * 目录API
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { book, source } = body;
        
        if (!book || !book.tocUrl) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供书籍信息' 
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
        
        const tocUrl = book.tocUrl || book.bookUrl;
        
        // 获取目录页面
        const response = await fetch(tocUrl, {
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
        const rule = source.ruleToc;
        
        // 解析目录
        const chapters = parseChapterList(html, rule, response.url);
        
        return new Response(JSON.stringify({
            success: true,
            chapters: chapters,
            total: chapters.length
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
 * 解析目录列表
 */
function parseChapterList(html, rule, baseUrl) {
    const chapters = [];
    
    if (!rule || !rule.chapterList) return chapters;
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const elements = doc.querySelectorAll(rule.chapterList);
        
        elements.forEach((el, index) => {
            const chapter = {
                index: index,
                title: getElementText(el, rule.chapterName),
                url: getElementUrl(el, rule.chapterUrl, baseUrl),
                isVip: false,
                isPay: false
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

function getElementText(parent, selector) {
    if (!selector) return '';
    try {
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
