/**
 * 书源管理API
 */

export interface Env {
  BOOK_SOURCES: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    if (request.method === 'GET') {
      // 获取所有书源
      let sources = [];
      try {
        const stored = await env.BOOK_SOURCES.get('sources', 'json');
        if (stored && Array.isArray(stored)) {
          sources = stored;
        }
      } catch (e) {}
      
      return new Response(JSON.stringify({
        success: true,
        sources,
        total: sources.length
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    if (request.method === 'POST') {
      const body = await request.json();
      let sources = [];
      
      try {
        const stored = await env.BOOK_SOURCES.get('sources', 'json');
        if (stored && Array.isArray(stored)) {
          sources = stored;
        }
      } catch (e) {}
      
      // 添加书源
      const toAdd = Array.isArray(body) ? body : [body];
      let addedCount = 0;
      
      for (const source of toAdd) {
        // 验证必要字段
        if (!source.bookSourceName || !source.bookSourceUrl) {
          continue;
        }
        
        // 检查是否已存在
        const exists = sources.some((s: any) => 
          s.bookSourceUrl === source.bookSourceUrl ||
          s.bookSourceName === source.bookSourceName
        );
        
        if (!exists) {
          sources.push({
            ...source,
            enabled: source.enabled !== false,
            addedAt: Date.now()
          });
          addedCount++;
        }
      }
      
      // 保存
      await env.BOOK_SOURCES.put('sources', JSON.stringify(sources));
      
      return new Response(JSON.stringify({
        success: true,
        message: `成功添加 ${addedCount} 个书源`,
        total: sources.length,
        added: addedCount
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    if (request.method === 'DELETE') {
      await env.BOOK_SOURCES.put('sources', '[]');
      return new Response(JSON.stringify({
        success: true,
        message: '书源已清空'
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};
