/**
 * HTML解析模块 - 使用RuleParser
 */

class HtmlParser {
    /**
     * 解析搜索结果
     */
    static parseSearchResult(html, rule, baseUrl, source) {
        const books = [];
        
        if (!rule || !rule.bookList || !html) return books;
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const ruleParser = new RuleParser();
            
            // 获取书籍列表元素
            const elements = ruleParser.getElements(doc, rule.bookList, baseUrl);
            
            console.log(`parseSearchResult: 找到 ${elements.length} 个元素`);
            
            for (const el of elements) {
                const book = {
                    name: ruleParser.getString(el, rule.name, baseUrl),
                    author: ruleParser.getString(el, rule.author, baseUrl),
                    bookUrl: ruleParser.getString(el, rule.bookUrl, baseUrl),
                    coverUrl: ruleParser.getString(el, rule.coverUrl, baseUrl),
                    intro: ruleParser.getString(el, rule.intro, baseUrl),
                    kind: ruleParser.getString(el, rule.kind, baseUrl),
                    lastChapter: ruleParser.getString(el, rule.lastChapter, baseUrl),
                    wordCount: ruleParser.getString(el, rule.wordCount, baseUrl),
                    origin: source?.bookSourceUrl || '',
                    originName: source?.bookSourceName || '',
                    type: source?.bookSourceType || 0,
                    time: Date.now()
                };
                
                // 清理作者名
                if (book.author) {
                    book.author = book.author.replace(/作者[：:]\s*/g, '').trim();
                }
                
                if (book.name && book.bookUrl) {
                    books.push(book);
                }
            }
        } catch (e) {
            console.error('解析搜索结果错误:', e);
        }
        
        return books;
    }

    /**
     * 解析书籍信息
     */
    static parseBookInfo(html, rule, baseUrl) {
        if (!html) return {};
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const ruleParser = new RuleParser();
        
        const info = {
            name: ruleParser.getString(doc, rule?.name, baseUrl),
            author: ruleParser.getString(doc, rule?.author, baseUrl),
            intro: ruleParser.getString(doc, rule?.intro, baseUrl),
            coverUrl: ruleParser.getString(doc, rule?.coverUrl, baseUrl),
            tocUrl: ruleParser.getString(doc, rule?.tocUrl, baseUrl) || baseUrl,
            kind: ruleParser.getString(doc, rule?.kind, baseUrl),
            lastChapter: ruleParser.getString(doc, rule?.lastChapter, baseUrl),
            wordCount: ruleParser.getString(doc, rule?.wordCount, baseUrl)
        };
        
        // 清理作者名
        if (info.author) {
            info.author = info.author.replace(/作者[：:]\s*/g, '').trim();
        }
        
        return info;
    }

    /**
     * 解析目录列表
     */
    static parseChapterList(html, rule, baseUrl) {
        const chapters = [];
        
        if (!rule || !rule.chapterList || !html) return chapters;
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const ruleParser = new RuleParser();
            
            const elements = ruleParser.getElements(doc, rule.chapterList, baseUrl);
            
            console.log(`parseChapterList: 找到 ${elements.length} 个章节`);
            
            elements.forEach((el, index) => {
                const chapter = {
                    index: index,
                    title: ruleParser.getString(el, rule.chapterName, baseUrl),
                    url: ruleParser.getString(el, rule.chapterUrl, baseUrl),
                    isVip: false,
                    isPay: false
                };
                
                if (chapter.title && chapter.url) {
                    chapters.push(chapter);
                }
            });
        } catch (e) {
            console.error('解析目录错误:', e);
        }
        
        return chapters;
    }

    /**
     * 解析章节内容
     */
    static parseContent(html, rule, baseUrl) {
        const result = {
            success: false,
            content: '',
            error: '',
            debug: {}
        };
        
        if (!html) {
            result.error = 'HTML为空';
            return result;
        }
        
        if (!rule || !rule.content) {
            result.error = '没有内容规则';
            return result;
        }
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const ruleParser = new RuleParser();
            
            result.debug.htmlLength = html.length;
            result.debug.rule = rule.content;
            
            // 获取内容
            let content = ruleParser.getString(doc, rule.content, baseUrl);
            
            if (content) {
                result.content = this.cleanContent(content);
                result.success = true;
                result.debug.contentLength = result.content.length;
            } else {
                result.error = '未获取到内容';
            }
            
        } catch (e) {
            result.error = '解析错误: ' + e.message;
            console.error('解析内容错误:', e);
        }
        
        return result;
    }

    /**
     * 清理内容
     */
    static cleanContent(content) {
        if (!content) return '';
        
        // 移除script和style
        content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        
        // 移除注释
        content = content.replace(/<!--[\s\S]*?-->/g, '');
        
        // 将br和p转换为换行
        content = content.replace(/<br\s*\/?>/gi, '\n');
        content = content.replace(/<\/p>/gi, '\n');
        content = content.replace(/<p[^>]*>/gi, '');
        
        // 移除其他HTML标签
        content = content.replace(/<[^>]+>/g, '');
        
        // 解码HTML实体
        const entities = {
            '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&amp;': '&',
            '&quot;': '"', '&#39;': "'", '&ldquo;': '"', '&rdquo;': '"',
            '&mdash;': '——', '&ndash;': '-', '&hellip;': '……'
        };
        
        for (const [entity, char] of Object.entries(entities)) {
            content = content.split(entity).join(char);
        }
        
        // 处理数字实体
        content = content.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n)));
        content = content.replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
        
        // 清理多余空白
        content = content.replace(/[ \t]+/g, ' ');
        content = content.replace(/\n[ \t]+/g, '\n');
        content = content.replace(/[ \t]+\n/g, '\n');
        content = content.replace(/\n{3,}/g, '\n\n');
        
        return content.trim();
    }
}

window.HtmlParser = HtmlParser;
