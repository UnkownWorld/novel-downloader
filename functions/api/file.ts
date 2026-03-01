/**
 * 文件下载API
 */

export interface Env {
  DOWNLOADS: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // 从URL中提取下载ID
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const downloadId = pathParts[pathParts.length - 1];
  
  if (!downloadId || downloadId === 'file') {
    return new Response(JSON.stringify({ error: '缺少下载ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  
  const content = await env.DOWNLOADS.get(downloadId);
  
  if (!content) {
    return new Response(JSON.stringify({ error: '文件不存在或已过期（24小时后自动删除）' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  
  // 从内容中提取书名
  const nameMatch = content.match(/书名: (.+)/);
  const authorMatch = content.match(/作者: (.+)/);
  const filename = nameMatch 
    ? `${nameMatch[1]}_${authorMatch ? authorMatch[1] : '未知'}.txt`
    : 'novel.txt';
  
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': content.length.toString(),
      ...corsHeaders
    }
  });
};
