/**
 * 小说搜索API - Cloudflare Worker
 * 基于Legado书源格式
 */

export interface Env {
  BOOK_SOURCES: KVNamespace;
}

interface BookSource {
  bookSourceName: string;
  bookSourceUrl: string;
  bookSourceType: number;
  searchUrl: string;
  enabled?: boolean;
  ruleSearch?: {
    bookList?: string;
    name?: string;
    author?: string;
    bookUrl?: string;
    coverUrl?: string;
    intro?: string;
  };
  header?: string;
}

interface SearchResult {
  name: string;
  author: string;
  bookUrl: string;
  coverUrl?: string;
  intro?: string;
  sourceName: string;
  sourceUrl: string;
  chapterCount?: number;
}

// 默认书源列表
const DEFAULT_SOURCES: BookSource[] = [
  {
    bookSourceName: "笔趣阁",
    bookSourceUrl: "https://www.biquge.com",
    bookSourceType: 0,
    enabled: true,
    searchUrl: "https://www.biquge.com/search.php?keyword={{key}}",
    ruleSearch: {
      bookList: ".result-list .result-item",
      name: ".result-game-item-title a",
      author: ".result-game-item-info-tag:eq(0) span:eq(1)",
      bookUrl: ".result-game-item-title a@href",
      coverUrl: ".result-game-item-pic img@src",
      intro: ".result-game-item-desc"
    }
  },
  {
    bookSourceName: "起点中文网",
    bookSourceUrl: "https://www.qidian.com",
    bookSourceType: 0,
    enabled: true,
    searchUrl: "https://www.qidian.com/search?kw={{key}}",
    ruleSearch: {
      bookList: ".book-img-text ul li",
      name: ".book-mid-info h4 a",
      author: ".author a.name",
      bookUrl: ".book-mid-info h4 a@href",
      coverUrl: ".book-img-box a img@src",
      intro: ".intro"
    }
  }
];

// HTTP请求
async function fetchPage(url: string, headers?: Record<string, string>): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers
      },
      signal: AbortSignal.timeout(15000) // 15秒超时
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.text();
  } catch (error) {
    throw error;
  }
}

// 解析搜索结果
async function searchSource(source: BookSource, keyword: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    const searchUrl = source.searchUrl.replace('{{key}}', encodeURIComponent(keyword));
    const html = await fetchPage(searchUrl);
    
    // 通用解析 - 提取书籍链接和信息
    // 匹配模式1: 标准搜索结果列表
    const itemPatterns = [
      // 笔趣阁类
      /<div[^>]*class="[^"]*result-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*result-item|<\/div>\s*<\/\w+>)/gi,
      // 列表项
      /<li[^>]*class="[^"]*(?:book|item|result)[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
      // 通用链接
      /<a[^>]*href="([^"]*(?:book|novel|chapter)[^"]*)"[^>]*>([^<]+)<\/a>/gi
    ];
    
    // 提取书籍信息
    const bookPattern = /<a[^>]*href="([^"]+)"[^>]*>([^<]{2,50})<\/a>/g;
    let match;
    
    // 尝试提取搜索结果
    while ((match = bookPattern.exec(html)) !== null) {
      const url = match[1];
      const name = match[2].trim();
      
      // 过滤非书籍链接
      if (!url || !name) continue;
      if (url.includes('javascript:') || url.includes('#')) continue;
      if (name.length < 2 || name.length > 50) continue;
      if (/^(登录|注册|首页|上一页|下一页|末页|更多|搜索|返回)/.test(name)) continue;
      
      // 构建完整URL
      let bookUrl = url;
      if (!url.startsWith('http')) {
        try {
          bookUrl = new URL(url, source.bookSourceUrl).href;
        } catch (e) {
          continue;
        }
      }
      
      // 尝试提取作者（从周围文本）
      const contextStart = Math.max(0, match.index - 200);
      const contextEnd = Math.min(html.length, match.index + match[0].length + 200);
      const context = html.substring(contextStart, contextEnd);
      
      const authorMatch = context.match(/作者[：:]\s*([^<\s\n]{2,20})/i) ||
                          context.match(/<[^>]*class="[^"]*author[^"]*"[^>]*>([^<]{2,20})</i);
      const author = authorMatch ? authorMatch[1].trim() : '';
      
      // 尝试提取封面
      const coverMatch = context.match(/<img[^>]*src="([^"]+\.(?:jpg|jpeg|png|gif|webp)[^"]*)"[^>]*>/i);
      const coverUrl = coverMatch ? coverMatch[1] : '';
      
      // 尝试提取简介
      const introMatch = context.match(/<[^>]*class="[^"]*(?:intro|desc|summary)[^"]*"[^>]*>([^<]{10,200})</i);
      const intro = introMatch ? introMatch[1].trim() : '';
      
      // 检查是否已存在
      const exists = results.some(r => r.bookUrl === bookUrl || r.name === name);
      if (!exists) {
        results.push({
          name,
          author,
          bookUrl,
          coverUrl: coverUrl && !coverUrl.startsWith('http') ? 
                    new URL(coverUrl, source.bookSourceUrl).href : coverUrl,
          intro,
          sourceName: source.bookSourceName,
          sourceUrl: source.bookSourceUrl
        });
      }
      
      // 限制每个源最多返回20个结果
      if (results.length >= 20) break;
    }
    
  } catch (error) {
    console.error(`搜索源 ${source.bookSourceName} 失败:`, error);
  }
  
  return results;
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
    const body = await request.json() as { keyword: string; limit?: number };
    const { keyword, limit = 10 } = body;
    
    if (!keyword || keyword.trim().length === 0) {
      return new Response(JSON.stringify({ error: '关键词不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // 获取书源
    let sources: BookSource[] = DEFAULT_SOURCES;
    try {
      const storedSources = await env.BOOK_SOURCES.get('sources', 'json');
      if (storedSources && Array.isArray(storedSources) && storedSources.length > 0) {
        sources = storedSources.filter((s: BookSource) => s.enabled !== false);
      }
    } catch (e) {
      // 使用默认书源
    }
    
    // 并发搜索（限制并发数）
    const searchLimit = Math.min(limit, sources.length);
    const searchPromises = sources.slice(0, searchLimit).map(s => searchSource(s, keyword));
    const searchResults = await Promise.allSettled(searchPromises);
    
    // 合并结果
    const allResults: SearchResult[] = [];
    searchResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        allResults.push(...result.value);
      }
    });
    
    // 按相关度排序（完全匹配优先）
    const keywordLower = keyword.toLowerCase();
    allResults.sort((a, b) => {
      const aMatch = a.name.toLowerCase().includes(keywordLower) ? 0 : 1;
      const bMatch = b.name.toLowerCase().includes(keywordLower) ? 0 : 1;
      return aMatch - bMatch;
    });
    
    // 去重（按书名+作者）
    const uniqueResults = Array.from(
      new Map(allResults.map(r => [`${r.name}-${r.author}`, r])).values()
    );
    
    return new Response(JSON.stringify({
      success: true,
      results: uniqueResults.slice(0, 100), // 最多返回100个结果
      total: uniqueResults.length,
      searchedSources: searchLimit
    }), {
      headers: {
        'Content-Type': 'application/json',
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
