/**
 * 章节内容API
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { book, chapter, source } = body;
        
        if (!chapter || !chapter.url) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供章节信息' 
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
        
        // 获取章节页面
        const response = await fetch(chapter.url, {
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
        const rule = source.ruleContent;
        
        // 解析内容
        let content = parseContent(html, rule, response.url);
        
        // 处理下一页
        if (rule && rule.nextContentUrl) {
            let nextUrl = parseUrl(html, rule.nextContentUrl, response.url);
            let pageCount = 0;
            const maxPages = 10;
            
            while (nextUrl && nextUrl !== chapter.url && pageCount < maxPages) {
                try {
                    const nextResponse = await fetch(nextUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        }
                    });
                    
                    if (!nextResponse.ok) break;
                    
                    const nextHtml = await nextResponse.text();
                    content += '\n' + parseContent(nextHtml, rule, nextResponse.url);
                    nextUrl = parseUrl(nextHtml, rule.nextContentUrl, nextResponse.url);
                    pageCount++;
                } catch (e) {
                    break;
                }
            }
        }
        
        // 处理替换规则
        if (rule && rule.replaceRegex) {
            try {
                content = content.replace(new RegExp(rule.replaceRegex, 'g'), rule.replacement || '');
            } catch (e) {
                // 忽略
            }
        }
        
        // 清理内容
        content = cleanContent(content);
        
        return new Response(JSON.stringify({
            success: true,
            content: content,
            length: content.length
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
 * 解析内容
 */
function parseContent(html, rule, baseUrl) {
    if (!rule || !rule.content) return '';
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 处理多个选择器（用||分隔）
        const selectors = rule.content.split('||');
        
        for (const selector of selectors) {
            const trimmed = selector.trim();
            if (!trimmed) continue;
            
            // 处理属性选择器
            if (trimmed.includes('@')) {
                const parts = trimmed.split('@');
                const el = doc.querySelector(parts[0]);
                if (el) {
                    const attr = parts[1];
                    if (attr === 'html' || attr === 'innerHTML') {
                        return el.innerHTML;
                    } else if (attr === 'text' || attr === 'textContent') {
                        return el.textContent;
                    }
                    return el.getAttribute(attr) || '';
                }
            } else {
                const el = doc.querySelector(trimmed);
                if (el) {
                    // 获取纯文本内容
                    return el.textContent || el.innerHTML;
                }
            }
        }
        
        return '';
    } catch (e) {
        console.error('解析内容错误:', e);
        return '';
    }
}

/**
 * 解析URL
 */
function parseUrl(html, selector, baseUrl) {
    if (!selector) return '';
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        let el, attr = 'href';
        
        if (selector.includes('@')) {
            const parts = selector.split('@');
            el = doc.querySelector(parts[0]);
            attr = parts[1] || 'href';
        } else {
            el = doc.querySelector(selector);
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

/**
 * 清理内容
 */
function cleanContent(content) {
    if (!content) return '';
    
    // 移除HTML标签
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<[^>]+>/g, '');
    
    // 解码HTML实体
    content = content.replace(/&nbsp;/g, ' ');
    content = content.replace(/&lt;/g, '<');
    content = content.replace(/&gt;/g, '>');
    content = content.replace(/&amp;/g, '&');
    content = content.replace(/&quot;/g, '"');
    content = content.replace(/&#39;/g, "'");
    
    // 清理多余空白
    content = content.replace(/[ \t]+/g, ' ');
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    content = content.trim();
    
    return content;
}
