/**
 * HTML解析模块 - 改进版
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
     * 解析章节内容 - 改进版，返回详细结果
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
        
        if (!rule) {
            result.error = '没有内容规则';
            return result;
        }
        
        if (!rule.content) {
            result.error = '规则中没有content选择器';
            return result;
        }
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            result.debug.htmlLength = html.length;
            result.debug.rule = rule.content;
            
            // 处理多个选择器（用||分隔）
            const selectors = rule.content.split('||');
            result.debug.selectors = selectors;
            
            for (const selector of selectors) {
                const trimmed = selector.trim();
                if (!trimmed) continue;
                
                // 处理属性选择器
                if (trimmed.includes('@')) {
                    const parts = trimmed.split('@');
                    const el = doc.querySelector(parts[0]);
                    
                    result.debug.selector = trimmed;
                    result.debug.found = !!el;
                    
                    if (el) {
                        const attr = parts[1];
                        if (attr === 'html' || attr === 'innerHTML') {
                            const raw = el.innerHTML;
                            result.content = this.cleanContent(raw);
                            result.debug.rawLength = raw.length;
                            result.success = true;
                            return result;
                        } else if (attr === 'text' || attr === 'textContent') {
                            const raw = el.textContent;
                            result.content = this.cleanContent(raw);
                            result.debug.rawLength = raw.length;
                            result.success = true;
                            return result;
                        }
                        const attrValue = el.getAttribute(attr);
                        if (attrValue) {
                            result.content = this.cleanContent(attrValue);
                            result.success = true;
                            return result;
                        }
                    }
                } else {
                    const el = doc.querySelector(trimmed);
                    
                    result.debug.selector = trimmed;
                    result.debug.found = !!el;
                    
                    if (el) {
                        // 优先使用innerHTML，保留格式
                        let raw = el.innerHTML || el.textContent;
                        result.debug.rawLength = raw.length;
                        result.content = this.cleanContent(raw);
                        result.success = true;
                        return result;
                    }
                }
            }
            
            // 所有选择器都没找到
            result.error = '选择器未匹配到内容';
            result.debug.matchedSelectors = 0;
            
        } catch (e) {
            result.error = '解析错误: ' + e.message;
            console.error('解析内容错误:', e);
        }
        
        return result;
    }
    
    /**
     * 获取元素文本
     */
    static getElementText(parent, selector) {
        if (!selector) return '';
        try {
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
            
            if (selector.includes('@')) {
                const parts = selector.split('@');
                el = parent.querySelector(parts[0]);
                attr = parts[1] || 'href';
            } else {
                el = parent.querySelector(selector);
            }
            
            if (!el) return '';
            
            let value = el.getAttribute(attr) || el.getAttribute('data-' + attr) || '';
            
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
     * 清理内容 - 改进版
     */
    static cleanContent(content) {
        if (!content) return '';
        
        // 移除script和style标签及其内容
        content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        
        // 移除注释
        content = content.replace(/<!--[\s\S]*?-->/g, '');
        
        // 将br和p标签转换为换行
        content = content.replace(/<br\s*\/?>/gi, '\n');
        content = content.replace(/<\/p>/gi, '\n');
        content = content.replace(/<p[^>]*>/gi, '');
        
        // 移除其他HTML标签，但保留内容
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
            '&#160;': ' ',
            '&ldquo;': '"',
            '&rdquo;': '"',
            '&mdash;': '——',
            '&ndash;': '-',
            '&hellip;': '……'
        };
        
        for (const [entity, char] of Object.entries(entities)) {
            content = content.split(entity).join(char);
        }
        
        // 处理数字实体
        content = content.replace(/&#(\d+);/g, (match, num) => {
            return String.fromCharCode(parseInt(num));
        });
        
        // 处理十六进制实体
        content = content.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
        });
        
        // 清理多余空白，但保留段落格式
        content = content.replace(/[ \t]+/g, ' ');
        content = content.replace(/\n[ \t]+/g, '\n');
        content = content.replace(/[ \t]+\n/g, '\n');
        content = content.replace(/\n{3,}/g, '\n\n');
        content = content.trim();
        
        return content;
    }
}

window.HtmlParser = HtmlParser;
