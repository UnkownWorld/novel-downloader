/**
 * HTML解析模块 - 参考Legado实现
 * 支持完整的书源规则语法
 */

class HtmlParser {
    constructor() {
        this.ruleParser = new RuleParser();
    }

    /**
     * 解析搜索结果
     */
    static parseSearchResult(html, rule, baseUrl, source) {
        const books = [];
        
        if (!rule || !rule.bookList || !html) return books;
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // 获取书籍列表
            const listRule = rule.bookList;
            const elements = this.getElements(doc, listRule, baseUrl);
            
            console.log(`parseSearchResult: 找到 ${elements.length} 个元素`);
            
            for (const el of elements) {
                const book = {
                    name: this.getString(el, rule.name, baseUrl),
                    author: this.getString(el, rule.author, baseUrl),
                    bookUrl: this.getString(el, rule.bookUrl, baseUrl),
                    coverUrl: this.getString(el, rule.coverUrl, baseUrl),
                    intro: this.getString(el, rule.intro, baseUrl),
                    kind: this.getString(el, rule.kind, baseUrl),
                    lastChapter: this.getString(el, rule.lastChapter, baseUrl),
                    wordCount: this.getString(el, rule.wordCount, baseUrl),
                    origin: source?.bookSourceUrl || '',
                    originName: source?.bookSourceName || '',
                    type: source?.bookSourceType || 0,
                    time: Date.now()
                };
                
                // 清理作者名
                if (book.author) {
                    book.author = book.author.replace(/作者[：:]/g, '').trim();
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
        
        const info = {
            name: this.getString(doc, rule?.name, baseUrl),
            author: this.getString(doc, rule?.author, baseUrl),
            intro: this.getString(doc, rule?.intro, baseUrl),
            coverUrl: this.getString(doc, rule?.coverUrl, baseUrl),
            tocUrl: this.getString(doc, rule?.tocUrl, baseUrl) || baseUrl,
            kind: this.getString(doc, rule?.kind, baseUrl),
            lastChapter: this.getString(doc, rule?.lastChapter, baseUrl),
            wordCount: this.getString(doc, rule?.wordCount, baseUrl)
        };
        
        // 清理作者名
        if (info.author) {
            info.author = info.author.replace(/作者[：:]/g, '').trim();
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
            
            const elements = this.getElements(doc, rule.chapterList, baseUrl);
            
            console.log(`parseChapterList: 找到 ${elements.length} 个章节`);
            
            elements.forEach((el, index) => {
                const chapter = {
                    index: index,
                    title: this.getString(el, rule.chapterName, baseUrl),
                    url: this.getString(el, rule.chapterUrl, baseUrl),
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
            
            result.debug.htmlLength = html.length;
            result.debug.rule = rule.content;
            
            // 获取内容
            let content = this.getString(doc, rule.content, baseUrl);
            
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
     * 获取字符串结果
     */
    static getString(context, ruleStr, baseUrl = '') {
        if (!ruleStr || !context) return '';
        
        try {
            // 处理JS规则
            if (ruleStr.includes('<js>') || ruleStr.includes('@js:')) {
                return this.executeJsRule(ruleStr, context, baseUrl);
            }
            
            // 处理||分隔符（多个规则，任一成功即可）
            if (ruleStr.includes('||')) {
                const rules = ruleStr.split('||');
                for (const r of rules) {
                    const result = this.getString(context, r.trim(), baseUrl);
                    if (result) return result;
                }
                return '';
            }
            
            // 处理&&分隔符（多个规则，都要执行）
            if (ruleStr.includes('&&')) {
                const rules = ruleStr.split('&&');
                const results = [];
                for (const r of rules) {
                    const result = this.getString(context, r.trim(), baseUrl);
                    if (result) results.push(result);
                }
                return results.join('\n');
            }
            
            // 处理##替换规则
            let replaceRegex = '';
            let replacement = '';
            const replaceMatch = ruleStr.match(/^(.+?)##(.+?)(?:##(.+?))?$/);
            if (replaceMatch) {
                ruleStr = replaceMatch[1];
                replaceRegex = replaceMatch[2];
                replacement = replaceMatch[3] || '';
            }
            
            // 解析选择器和属性
            let selector = ruleStr;
            let attr = 'text';
            let index = -1;
            
            // 处理@属性
            if (selector.includes('@')) {
                const parts = selector.split('@');
                selector = parts[0];
                attr = parts[1] || 'text';
            }
            
            // 处理.索引 (如: .author.0@text)
            const indexMatch = selector.match(/\.(\d+)$/);
            if (indexMatch) {
                index = parseInt(indexMatch[1]);
                selector = selector.substring(0, selector.length - indexMatch[0].length);
            }
            
            // 处理class选择器 (如: .bookname a -> .bookname a)
            // Legado格式: class.tag 或 class.0.tag
            selector = selector
                .replace(/^class\./, '.')
                .replace(/\.([a-zA-Z])/g, '.$1');
            
            // 执行选择器
            let elements;
            if (typeof selector === 'string' && selector.startsWith('//')) {
                // XPath - 浏览器不支持，跳过
                console.warn('XPath不支持:', selector);
                return '';
            } else if (selector.startsWith('$.') || selector.startsWith('$[')) {
                // JSONPath
                return this.executeJsonPath(context, selector);
            } else {
                // CSS选择器
                elements = context.querySelectorAll ? 
                    context.querySelectorAll(selector) : 
                    (context.querySelector ? [context.querySelector(selector)].filter(Boolean) : []);
            }
            
            if (elements.length === 0) return '';
            
            // 应用索引
            if (index >= 0) {
                elements = index < elements.length ? [elements[index]] : [];
            }
            
            // 获取属性值
            let result = '';
            const el = elements[0];
            
            if (attr === 'text' || attr === 'textContent') {
                result = el.textContent || '';
            } else if (attr === 'html' || attr === 'innerHTML') {
                result = el.innerHTML || '';
            } else if (attr === 'href' || attr === 'src') {
                result = el.getAttribute(attr) || '';
                // 转换为绝对URL
                if (result && !result.startsWith('http') && baseUrl) {
                    try {
                        result = new URL(result, baseUrl).href;
                    } catch (e) {}
                }
            } else if (attr === 'content') {
                // meta标签的content属性
                result = el.getAttribute('content') || el.getAttribute('value') || '';
            } else {
                result = el.getAttribute(attr) || el.textContent || '';
            }
            
            // 应用正则替换
            if (replaceRegex && result) {
                result = result.replace(new RegExp(replaceRegex, 'g'), replacement);
            }
            
            return result.trim();
            
        } catch (e) {
            console.error('getString错误:', e, ruleStr);
            return '';
        }
    }

    /**
     * 获取元素列表
     */
    static getElements(context, ruleStr, baseUrl = '') {
        if (!ruleStr || !context) return [];
        
        try {
            // 处理负号（反向）
            let reverse = false;
            if (ruleStr.startsWith('-')) {
                reverse = true;
                ruleStr = ruleStr.substring(1);
            }
            
            // 处理正号
            if (ruleStr.startsWith('+')) {
                ruleStr = ruleStr.substring(1);
            }
            
            // 处理JS规则
            if (ruleStr.includes('<js>') || ruleStr.includes('@js:')) {
                const result = this.executeJsRule(ruleStr, context, baseUrl);
                return Array.isArray(result) ? result : [result];
            }
            
            // CSS选择器
            let elements = context.querySelectorAll ? 
                Array.from(context.querySelectorAll(ruleStr)) : 
                [];
            
            if (reverse) {
                elements = elements.reverse();
            }
            
            return elements;
            
        } catch (e) {
            console.error('getElements错误:', e, ruleStr);
            return [];
        }
    }

    /**
     * 执行JS规则
     */
    static executeJsRule(ruleStr, context, baseUrl) {
        try {
            // 提取JS代码
            let jsCode = ruleStr;
            if (jsCode.startsWith('<js>')) {
                jsCode = jsCode.replace(/^<js>|<\/js>$/g, '');
            } else if (jsCode.startsWith('@js:')) {
                jsCode = jsCode.substring(4);
            }
            
            // 获取上下文内容
            const result = typeof context === 'string' ? context : 
                (context.textContent || context.innerHTML || '');
            
            // 创建执行器并执行
            const executor = new JsRuleExecutor();
            
            // 同步执行（简化版）
            const wrappedCode = `
                (function(java, result, baseUrl, src) {
                    ${jsCode}
                })
            `;
            
            const fn = eval(wrappedCode);
            const javaMock = {
                ajax: (url) => {
                    console.warn('java.ajax需要在服务端执行:', url);
                    return '';
                }
            };
            
            return fn(javaMock, result, baseUrl, context) || '';
            
        } catch (e) {
            console.error('JS规则执行错误:', e);
            return '';
        }
    }

    /**
     * 执行JSONPath
     */
    static executeJsonPath(context, path) {
        try {
            let json = context;
            if (typeof context === 'string') {
                try {
                    json = JSON.parse(context);
                } catch (e) {
                    return '';
                }
            }
            
            const parts = path.replace(/^\$\.?/, '').split(/\.|\[|\]/).filter(p => p);
            let result = json;
            
            for (const part of parts) {
                if (result === null || result === undefined) return '';
                result = result[part];
            }
            
            return result || '';
        } catch (e) {
            return '';
        }
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
