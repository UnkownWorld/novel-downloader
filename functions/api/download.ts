/**
 * 小说下载API - Cloudflare Worker
 * 支持流式响应，前端可保存到本地
 */

export interface Env {
  BOOK_SOURCES: KVNamespace;
  DOWNLOADS: KVNamespace;
}

interface Chapter {
  name: string;
  url: string;
}

interface Book {
  name: string;
  author: string;
  bookUrl: string;
  coverUrl?: string;
  intro?: string;
  sourceName: string;
  sourceUrl: string;
}

// HTTP请求
async function fetchHTML(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  return response.text();
}

// 解析章节列表
async function getChapterList(bookUrl: string): Promise<Chapter[]> {
  const chapters: Chapter[] = [];
  
  try {
    const html = await fetchHTML(bookUrl);
    
    // 提取章节链接 - 通用匹配
    const chapterPattern = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    
    while ((match = chapterPattern.exec(html)) !== null) {
      const url = match[1];
      const name = match[2].trim();
      
      // 过滤非章节链接
      if (name && name.length > 2 && name.length < 50) {
        const hasChapterKeyword = /第[零一二三四五六七八九十百千万\d]+[章节回集卷部篇]/.test(name) ||
                                   /\d+/.test(name) && (name.includes('章') || name.includes('节'));
        
        if (hasChapterKeyword) {
          chapters.push({
            name,
            url: url.startsWith('http') ? url : new URL(url, bookUrl).href
          });
        }
      }
    }
  } catch (error) {
    console.error('获取章节列表失败:', error);
  }
  
  // 去重
  const seen = new Set();
  return chapters.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

// 获取章节内容
async function getChapterContent(chapterUrl: string): Promise<string> {
  try {
    const html = await fetchHTML(chapterUrl);
    
    // 尝试多种内容选择器
    const contentPatterns = [
      /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*chapter-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i
    ];
    
    for (const pattern of contentPatterns) {
      const match = html.match(pattern);
      if (match) {
        let content = match[1];
        // 清理HTML标签
        content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        content = content.replace(/<[^>]+>/g, '');
        // 清理特殊字符
        content = content.replace(/&nbsp;/g, ' ');
        content = content.replace(/&lt;/g, '<');
        content = content.replace(/&gt;/g, '>');
        content = content.replace(/&amp;/g, '&');
        content = content.replace(/&quot;/g, '"');
        content = content.replace(/&#39;/g, "'");
        // 清理多余空白
        content = content.replace(/\s+/g, '\n').trim();
        
        if (content.length > 100) {
          return content;
        }
      }
    }
  } catch (error) {
    console.error('获取章节内容失败:', error);
  }
  
  return '';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  
  try {
    const body = await request.json() as { book: Book; chapterLimit?: number };
    const { book, chapterLimit = 100 } = body;
    
    if (!book || !book.bookUrl) {
      return new Response(JSON.stringify({ error: '书籍信息不完整' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 创建流式响应
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    
    // 发送SSE消息
    const sendMessage = async (data: object) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };
    
    // 后台处理
    (async () => {
      try {
        await sendMessage({ progress: 0, text: '正在获取章节列表...' });
        
        // 获取章节列表
        const chapters = await getChapterList(book.bookUrl);
        const totalChapters = chapterLimit > 0 ? Math.min(chapterLimit, chapters.length) : chapters.length;
        
        if (chapters.length === 0) {
          await sendMessage({ error: '未找到章节，请检查书源是否可用' });
          await writer.close();
          return;
        }
        
        await sendMessage({ 
          progress: 5, 
          text: `找到 ${chapters.length} 章，将下载前 ${totalChapters} 章` 
        });
        
        // 构建小说内容
        let content = `书名: ${book.name}\n`;
        content += `作者: ${book.author || '未知'}\n`;
        content += `来源: ${book.sourceName}\n`;
        content += `下载时间: ${new Date().toLocaleString()}\n`;
        content += `总章数: ${chapters.length}\n`;
        content += `下载章数: ${totalChapters}\n\n`;
        content += `${'='.repeat(50)}\n\n`;
        
        // 发送初始内容
        await sendMessage({ content: content });
        
        // 下载章节
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < totalChapters; i++) {
          const chapter = chapters[i];
          
          try {
            const chapterContent = await getChapterContent(chapter.url);
            
            if (chapterContent && chapterContent.length > 50) {
              const chapterText = `\n第${i + 1}章 ${chapter.name}\n\n${chapterContent}\n\n`;
              content += chapterText;
              
              // 发送章节内容
              await sendMessage({ content: chapterText });
              
              successCount++;
            } else {
              const failText = `\n第${i + 1}章 ${chapter.name}\n\n[内容获取失败]\n\n`;
              content += failText;
              await sendMessage({ content: failText });
              failCount++;
            }
          } catch (e) {
            const failText = `\n第${i + 1}章 ${chapter.name}\n\n[下载出错: ${e.message}]\n\n`;
            content += failText;
            await sendMessage({ content: failText });
            failCount++;
          }
          
          const progress = Math.round((i + 1) / totalChapters * 90) + 5;
          await sendMessage({ 
            progress, 
            text: `下载中: ${chapter.name} (${i + 1}/${totalChapters}) 成功:${successCount} 失败:${failCount}` 
          });
          
          // 延迟避免请求过快
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // 存储到KV（可选，用于后续下载）
        const downloadId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        try {
          await env.DOWNLOADS.put(downloadId, content, { expirationTtl: 86400 }); // 24小时过期
        } catch (e) {
          // KV存储失败不影响下载
        }
        
        // 发送完成消息
        await sendMessage({
          done: true,
          progress: 100,
          text: `下载完成！成功:${successCount} 失败:${failCount}`,
          downloadUrl: `/api/file/${downloadId}`,
          filename: `${book.name}_${book.author || '未知'}.txt`,
          stats: { total: totalChapters, success: successCount, fail: failCount }
        });
        
      } catch (error) {
        await sendMessage({ error: error.message });
      } finally {
        await writer.close();
      }
    })();
    
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
};
