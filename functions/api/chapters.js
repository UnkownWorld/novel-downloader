/**
 * 目录API - 支持分页
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { tocUrl, page } = body;
        
        if (!tocUrl) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供目录URL' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 处理分页URL
        let targetUrl = tocUrl;
        if (page && page > 1) {
            // 常见分页格式
            targetUrl = tocUrl.replace(/\.html$/, `_${page}.html`);
            if (targetUrl === tocUrl) {
                targetUrl = tocUrl.replace(/\/$/, `/${page}/`);
            }
            if (targetUrl === tocUrl) {
                targetUrl = tocUrl + '?page=' + page;
            }
        }
        
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
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
        
        return new Response(JSON.stringify({
            success: true,
            html: html,
            baseUrl: response.url,
            requestedUrl: targetUrl
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
