/**
 * 章节内容API - 带调试功能
 */

export async function onRequest(context) {
    const { request } = context;
    
    try {
        const body = await request.json();
        const { chapterUrl, debug } = body;
        
        if (!chapterUrl) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: '请提供章节URL' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const response = await fetch(chapterUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            }
        });
        
        if (!response.ok) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: `HTTP ${response.status}`,
                status: response.status
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const html = await response.text();
        
        const result = {
            success: true,
            html: html,
            baseUrl: response.url,
            contentLength: html.length
        };
        
        // 调试模式返回更多信息
        if (debug) {
            result.debug = {
                responseUrl: response.url,
                contentType: response.headers.get('content-type'),
                contentLength: html.length,
                htmlPreview: html.substring(0, 2000),
                htmlEnd: html.substring(html.length - 500)
            };
        }
        
        return new Response(JSON.stringify(result), {
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
