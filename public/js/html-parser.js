/**
 * HTML解析模块 - 在浏览器端解析
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
            
            const elements = doc.querySelectorAll(rule.bookList);
            
            elements.forEach(el => {
                const book = {
                    name: this.getElementText(el, rule.name),
                    author: this.getElementText(el, rule.author),
                    bookUrl: this.getElementUrl(el, rule.bookUrl, baseUrl),
                    coverUrl: this.getElementUrl(el, rule.coverUrl, baseUrl),
                    intro: this.getElementText(el, rule.intro),
                    kind: this.getElementText(el, rule.kind),
                    lastChapter: this.getElementText(el, rule.lastChapter),
                    wordCount: this.getElementText(el, rule.wordCount),
                    origin: source.bookSourceUrl,
                    originName: source.bookSourceName,
                    type: source.bookSourceType || 0,
                    time: Date.now()
                };
                
                if (book.name && book.bookUrl) {
                    books.push(book);
                }
            });
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
        
        return {
            name: this.getElementText(doc, rule?.name),
            author: this.getElementText(doc, rule?.author),
            intro: this.getElementText(doc, rule?.intro),
            coverUrl: this.getElementUrl(doc, rule?.coverUrl, baseUrl),
            tocUrl: this.getElementUrl(doc, rule?.tocUrl, baseUrl) || baseUrl,
            kind: this.getElementText(doc, rule?.kind),
            lastChapter: this.getElementText(doc, rule?.lastChapter),
            wordCount: this.getElementText(doc, rule?.wordCount)
        };
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
            
            const elements = doc.querySelectorAll(rule.chapterList);
            
            elements.forEach((el, index) => {
                const chapter = {
                    index: index,
                    title: this.getElementText(el, rule.chapterName),
                    url: this.getElementUrl(el, rule.chapterUrl, baseUrl),
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
        if (!rule || !rule.content || !html) return '';
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 处理多个选择器（用||分隔）
            const selectors = rule.content.split('||');
            
            for (const selector of selectors) {
                const trimmed = selector.trim();
                if (!trimmed) continue;
                
                // 处理属性选择器
                if (trimmed.includes('@')) {
                    const parts = trimmed.split('@');
                    const el = doc.querySelector(parts[0]);
                    if (el) {
                        const attr = parts[1];
                        if (attr === 'html' || attr === 'innerHTML') {
                            return this.cleanContent(el.innerHTML);
                        } else if (attr === 'text' || attr === 'textContent') {
                            return this.cleanContent(el.textContent);
                        }
                        return el.getAttribute(attr) || '';
                    }
                } else {
                    const el = doc.querySelector(trimmed);
                    if (el) {
                        return this.cleanContent(el.textContent || el.innerHTML);
                    }
                }
            }
            
            return '';
        } catch (e) {
            console.error('解析内容错误:', e);
            return '';
        }
    }
    
    /**
     * 获取元素文本
     */
    static getElementText(parent, selector) {
        if (!selector) return '';
        try {
            // 处理属性选择器
            if (selector.includes('@')) {
                const parts = selector.split('@');
                const el = parent.querySelector(parts[0]);
                if (!el) return '';
                const attr = parts[1];
                if (attr === 'text' || attr === 'textContent') {
                    return el.textContent.trim();
                } else if (attr === 'html' || attr === 'innerHTML') {
                    return el.innerHTML;
                }
                return el.getAttribute(attr) || '';
            }
            
            const el = parent.querySelector ? parent.querySelector(selector) : null;
            return el ? el.textContent.trim() : '';
        } catch (e) {
            return '';
        }
    }
    
    /**
     * 获取元素URL
     */
    static getElementUrl(parent, selector, baseUrl) {
        if (!selector) return '';
        try {
            let el, attr = 'href';
            
            // 处理属性选择器
            if (selector.includes('@')) {
                const parts = selector.split('@');
                el = parent.querySelector(parts[0]);
                attr = parts[1] || 'href';
            } else {
                el = parent.querySelector(selector);
            }
            
            if (!el) return '';
            
            let value = el.getAttribute(attr) || el.getAttribute('data-' + attr) || '';
            
            // 转换为绝对URL
            if (value && !value.startsWith('http')) {
                try {
                    value = new URL(value, baseUrl).href;
                } catch (e) {
                    // 忽略
                }
            }
            
            return value;
        } catch (e) {
            return '';
        }
    }
    
    /**
     * 清理内容
     */
    static cleanContent(content) {
        if (!content) return '';
        
        // 移除HTML标签
        content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        content = content.replace(/<[^>]+>/g, '');
        
        // 解码HTML实体
        const entities = {
            '&nbsp;': ' ',
            '&lt;': '<',
            '&gt;': '>',
            '&amp;': '&',
            '&quot;': '"',
            '&#39;': "'",
            '&#34;': '"',
            '&#60;': '<',
            '&#62;': '>',
            '&#38;': '&',
            '&#160;': ' '
        };
        
        for (const [entity, char] of Object.entries(entities)) {
            content = content.split(entity).join(char);
        }
        
        // 处理数字实体
        content = content.replace(/&#(\d+);/g, (match, num) => {
            return String.fromCharCode(parseInt(num));
        });
        
        // 清理多余空白
        content = content.replace(/[ \t]+/g, ' ');
        content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
        content = content.trim();
        
        return content;
    }
}

// 导出
window.HtmlParser = HtmlParser;
