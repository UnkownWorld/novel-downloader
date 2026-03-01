/**
 * 发现页面API
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { exploreUrl, page } = body;
        
        if (!exploreUrl) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供发现URL' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 构建URL
        let url = exploreUrl;
        url = url.replace(/\{\{page\}\}/g, page || 1);
        
        // 解析URL选项
        let method = 'GET';
        let headers = {};
        let requestBody = null;
        
        const optionMatch = url.match(/,\s*(\{[\s\S]*\})$/);
        if (optionMatch) {
            url = url.substring(0, optionMatch.index);
            try {
                const options = JSON.parse(optionMatch[1]);
                method = options.method || 'GET';
                headers = options.headers || {};
                requestBody = options.body;
            } catch (e) {
                // 忽略
            }
        }
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...headers
            },
            body: method === 'POST' ? requestBody : undefined
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
            baseUrl: response.url
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
