/**
 * 代理API
 * 用于处理跨域请求
 */

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    try {
        const targetUrl = url.searchParams.get('url');
        const optionsStr = url.searchParams.get('options');
        
        if (!targetUrl) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '缺少目标URL' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        let options = { method: 'GET', headers: {} };
        if (optionsStr) {
            try {
                options = JSON.parse(optionsStr);
            } catch (e) {
                // 使用默认选项
            }
        }
        
        // 构建请求
        const fetchOptions = {
            method: options.method || 'GET',
            headers: {
                'User-Agent': options.headers?.['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': options.headers?.['Accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': options.headers?.['Accept-Language'] || 'zh-CN,zh;q=0.9',
                ...options.headers
            },
            redirect: 'follow'
        };
        
        if (options.body && options.method === 'POST') {
            fetchOptions.body = options.body;
        }
        
        // 发起请求
        const response = await fetch(targetUrl, fetchOptions);
        const contentType = response.headers.get('content-type') || '';
        
        let body;
        if (contentType.includes('application/json')) {
            body = await response.text();
        } else if (contentType.includes('image/')) {
            // 图片返回base64
            const buffer = await response.arrayBuffer();
            body = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            return new Response(JSON.stringify({
                success: true,
                url: response.url,
                contentType: contentType,
                body: body,
                isBase64: true
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            body = await response.text();
        }
        
        return new Response(JSON.stringify({
            success: response.ok,
            url: response.url,
            status: response.status,
            contentType: contentType,
            body: body
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
