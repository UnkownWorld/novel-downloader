/**
 * 书源测试API
 * 使用Cloudflare Workers后端直接测试书源可访问性
 */

export async function onRequestPost(context) {
  const { request } = context;
  
  try {
    const body = await request.json();
    const { urls } = body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '请提供书源URL列表' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 限制每次最多测试20个
    const testUrls = urls.slice(0, 20);
    
    // 并发测试
    const results = await Promise.all(
      testUrls.map(async (item) => {
        const { url, name } = item;
        const result = {
          url,
          name,
          success: false,
          error: '',
          responseTime: 0
        };
        
        if (!url) {
          result.error = 'URL为空';
          return result;
        }
        
        // 自动将HTTP转换为HTTPS
        let testUrl = url;
        if (testUrl.startsWith('http://')) {
          testUrl = testUrl.replace('http://', 'https://');
        }
        
        const startTime = Date.now();
        
        try {
          const response = await fetch(testUrl, {
            method: 'HEAD',  // 只请求头部，更快
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirect: 'follow'  // 自动跟随重定向
          });
          
          result.responseTime = Date.now() - startTime;
          
          if (response.ok || response.status === 304) {
            result.success = true;
          } else if (response.status >= 300 && response.status < 400) {
            // 重定向也算成功
            result.success = true;
          } else {
            result.error = `HTTP ${response.status}`;
          }
        } catch (e) {
          result.responseTime = Date.now() - startTime;
          result.error = e.message || '请求失败';
          
          // 如果HTTPS失败，尝试HTTP
          if (testUrl.startsWith('https://') && url.startsWith('http://')) {
            try {
              const httpResult = await fetch(url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(10000),
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                redirect: 'follow'
              });
              
              if (httpResult.ok || httpResult.status === 304 || 
                  (httpResult.status >= 300 && httpResult.status < 400)) {
                result.success = true;
                result.error = '';
              }
            } catch (e2) {
              // HTTP也失败
            }
          }
        }
        
        return result;
      })
    );
    
    // 统计结果
    const valid = results.filter(r => r.success).length;
    const invalid = results.filter(r => !r.success).length;
    
    return new Response(JSON.stringify({
      success: true,
      total: results.length,
      valid,
      invalid,
      results
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: e.message || '服务器错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 处理OPTIONS请求（CORS预检）
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
