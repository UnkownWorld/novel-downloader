/**
 * WebBook模块
 * 参考 Legado WebBook.kt
 * 处理搜索、发现、书籍信息、目录、内容
 */

class WebBook {
    constructor(source) {
        this.source = source;
    }
    
    /**
     * 搜索书籍
     */
    async searchBook(key, page = 1) {
        if (!this.source.searchUrl) {
            throw new Error('书源未配置搜索URL');
        }
        
        const analyzeUrl = new AnalyzeUrl(this.source.searchUrl, {
            key: key,
            page: page,
            baseUrl: this.source.bookSourceUrl,
            source: this.source
        });
        
        const response = await analyzeUrl.getStrResponse();
        
        if (!response.success) {
            throw new Error(response.error || '搜索请求失败');
        }
        
        // 解析搜索结果
        return this.parseBookList(response.body, this.source.ruleSearch, true);
    }
    
    /**
     * 发现书籍
     */
    async exploreBook(url, page = 1) {
        const analyzeUrl = new AnalyzeUrl(url, {
            page: page,
            baseUrl: this.source.bookSourceUrl,
            source: this.source
        });
        
        const response = await analyzeUrl.getStrResponse();
        
        if (!response.success) {
            throw new Error(response.error || '发现请求失败');
        }
        
        return this.parseBookList(response.body, this.source.ruleExplore, false);
    }
    
    /**
     * 获取书籍信息
     */
    async getBookInfo(book) {
        const analyzeUrl = new AnalyzeUrl(book.bookUrl, {
            baseUrl: this.source.bookSourceUrl,
            source: this.source
        });
        
        const response = await analyzeUrl.getStrResponse();
        
        if (!response.success) {
            throw new Error(response.error || '获取书籍信息失败');
        }
        
        const rule = this.source.ruleBookInfo;
        const analyzer = new AnalyzeRule(response.body, response.url, this.source);
        
        // 解析书籍信息
        book.name = analyzer.getString(rule.name);
        book.author = analyzer.getString(rule.author);
        book.intro = analyzer.getString(rule.intro);
        book.kind = analyzer.getString(rule.kind);
        book.coverUrl = analyzer.getString(rule.coverUrl, true);
        book.tocUrl = analyzer.getString(rule.tocUrl, true) || book.bookUrl;
        book.wordCount = analyzer.getString(rule.wordCount);
        book.lastChapter = analyzer.getString(rule.lastChapter);
        
        return book;
    }
    
    /**
     * 获取目录列表
     */
    async getChapterList(book) {
        const tocUrl = book.tocUrl || book.bookUrl;
        
        const analyzeUrl = new AnalyzeUrl(tocUrl, {
            baseUrl: this.source.bookSourceUrl,
            source: this.source
        });
        
        const response = await analyzeUrl.getStrResponse();
        
        if (!response.success) {
            throw new Error(response.error || '获取目录失败');
        }
        
        const rule = this.source.ruleToc;
        const analyzer = new AnalyzeRule(response.body, response.url, this.source);
        
        // 获取章节列表
        const chapterElements = analyzer.getElements(rule.chapterList);
        const chapters = [];
        
        for (let i = 0; i < chapterElements.length; i++) {
            const el = chapterElements[i];
            const chapterAnalyzer = new AnalyzeRule(el, response.url, this.source);
            
            const chapter = {
                index: i,
                title: chapterAnalyzer.getString(rule.chapterName),
                url: chapterAnalyzer.getString(rule.chapterUrl, true),
                isVip: false,
                isPay: false,
                time: ''
            };
            
            if (chapter.title && chapter.url) {
                chapters.push(chapter);
            }
        }
        
        return chapters;
    }
    
    /**
     * 获取章节内容
     */
    async getContent(book, chapter, nextChapterUrl = null) {
        const analyzeUrl = new AnalyzeUrl(chapter.url, {
            baseUrl: book.tocUrl || book.bookUrl,
            source: this.source
        });
        
        const response = await analyzeUrl.getStrResponse();
        
        if (!response.success) {
            throw new Error(response.error || '获取内容失败');
        }
        
        const rule = this.source.ruleContent;
        const analyzer = new AnalyzeRule(response.body, response.url, this.source);
        
        let content = analyzer.getString(rule.content);
        
        // 处理下一页
        if (rule.nextContentUrl) {
            let nextUrl = analyzer.getString(rule.nextContentUrl, true);
            let pageCount = 0;
            const maxPages = 10;
            
            while (nextUrl && nextUrl !== chapter.url && pageCount < maxPages) {
                const nextAnalyzeUrl = new AnalyzeUrl(nextUrl, {
                    baseUrl: response.url,
                    source: this.source
                });
                
                const nextResponse = await nextAnalyzeUrl.getStrResponse();
                if (!nextResponse.success) break;
                
                const nextAnalyzer = new AnalyzeRule(nextResponse.body, nextResponse.url, this.source);
                content += '\n' + nextAnalyzer.getString(rule.content);
                nextUrl = nextAnalyzer.getString(rule.nextContentUrl, true);
                pageCount++;
            }
        }
        
        // 处理替换规则
        if (rule.replaceRegex) {
            content = content.replace(new RegExp(rule.replaceRegex, 'g'), rule.replacement || '');
        }
        
        // 处理图片
        if (rule.imageStyle) {
            content = this.processImages(content, rule.imageStyle);
        }
        
        return content;
    }
    
    /**
     * 解析书籍列表
     */
    parseBookList(content, rule, isSearch) {
        if (!rule || !content) return [];
        
        const analyzer = new AnalyzeRule(content, '', this.source);
        const bookElements = analyzer.getElements(rule.bookList);
        const books = [];
        
        for (const el of bookElements) {
            const bookAnalyzer = new AnalyzeRule(el, '', this.source);
            
            const book = {
                name: bookAnalyzer.getString(rule.name),
                author: bookAnalyzer.getString(rule.author),
                bookUrl: bookAnalyzer.getString(rule.bookUrl, true),
                coverUrl: bookAnalyzer.getString(rule.coverUrl, true),
                intro: bookAnalyzer.getString(rule.intro),
                kind: bookAnalyzer.getString(rule.kind),
                lastChapter: bookAnalyzer.getString(rule.lastChapter),
                wordCount: bookAnalyzer.getString(rule.wordCount),
                origin: this.source.bookSourceUrl,
                originName: this.source.bookSourceName,
                type: this.source.bookSourceType || 0,
                time: Date.now()
            };
            
            if (book.name && book.bookUrl) {
                books.push(book);
            }
        }
        
        return books;
    }
    
    /**
     * 处理图片
     */
    processImages(content, imageStyle) {
        return content.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
            return `<img src="${src}" style="${imageStyle}">`;
        });
    }
}

// 导出
window.WebBook = WebBook;
