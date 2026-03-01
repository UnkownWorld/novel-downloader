/**
 * 阅读器模块
 */

class ReaderManager {
    constructor() {
        this.currentBook = null;
        this.currentSource = null;
        this.chapters = [];
        this.currentChapterIndex = 0;
        this.content = '';
        
        // 阅读设置
        this.settings = {
            fontSize: 18,
            lineHeight: 1.8,
            theme: 'dark',
            fontFamily: 'serif',
            padding: 20
        };
        
        this.loadSettings();
    }
    
    loadSettings() {
        try {
            const saved = localStorage.getItem('readerSettings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.error('加载阅读设置失败:', e);
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('readerSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('保存阅读设置失败:', e);
        }
    }
    
    async init(book, source, chapters, startIndex = 0) {
        this.currentBook = book;
        this.currentSource = source;
        this.chapters = chapters;
        this.currentChapterIndex = startIndex;
        
        await this.loadChapter(startIndex);
    }
    
    async loadChapter(index) {
        if (index < 0 || index >= this.chapters.length) {
            return false;
        }
        
        this.currentChapterIndex = index;
        const chapter = this.chapters[index];
        
        const cacheKey = `content_${chapter.url}`;
        let cachedData = app.cacheManager?.get(cacheKey);
        let contentStr = '';
        
        // 检查缓存
        if (cachedData) {
            if (typeof cachedData === 'object' && cachedData.content) {
                contentStr = cachedData.content;
            } else if (typeof cachedData === 'string') {
                contentStr = cachedData;
            }
        }
        
        // 没有缓存则请求
        if (!contentStr) {
            try {
                const response = await fetch('/api/content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chapterUrl: chapter.url })
                });
                
                const data = await response.json();
                
                if (data.success && data.html) {
                    // 使用支持JS规则的解析方法
                    const parseResult = await HtmlParser.parseContentWithJs(
                        data.html,
                        this.currentSource.ruleContent,
                        data.baseUrl
                    );
                    
                    if (parseResult.success && parseResult.content) {
                        contentStr = parseResult.content;
                        // 缓存对象格式
                        app.cacheManager?.set(cacheKey, { content: contentStr, success: true });
                    } else {
                        contentStr = `[解析失败: ${parseResult.error || '未知错误'}]`;
                    }
                } else {
                    contentStr = `[获取失败: ${data.error || 'HTTP错误'}]`;
                }
            } catch (e) {
                console.error('加载章节失败:', e);
                contentStr = '加载失败，请重试';
            }
        }
        
        this.content = contentStr || '内容为空';
        
        // 更新阅读进度
        if (app.bookshelfManager && this.currentBook) {
            app.bookshelfManager.updateProgress(
                this.currentBook.bookUrl,
                index,
                chapter.title
            );
        }
        
        return true;
    }
    
    async prevChapter() {
        if (this.currentChapterIndex > 0) {
            return await this.loadChapter(this.currentChapterIndex - 1);
        }
        return false;
    }
    
    async nextChapter() {
        if (this.currentChapterIndex < this.chapters.length - 1) {
            return await this.loadChapter(this.currentChapterIndex + 1);
        }
        return false;
    }
    
    async goToChapter(index) {
        return await this.loadChapter(index);
    }
    
    getCurrentChapter() {
        return this.chapters[this.currentChapterIndex];
    }
    
    getProgress() {
        return {
            current: this.currentChapterIndex + 1,
            total: this.chapters.length,
            percent: ((this.currentChapterIndex + 1) / this.chapters.length * 100).toFixed(1)
        };
    }
    
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }
    
    getThemeStyle() {
        const themes = {
            dark: {
                background: '#1a1a2e',
                color: '#e0e0e0',
                border: 'rgba(255,255,255,0.1)'
            },
            light: {
                background: '#ffffff',
                color: '#333333',
                border: 'rgba(0,0,0,0.1)'
            },
            sepia: {
                background: '#f4ecd8',
                color: '#5c4b37',
                border: 'rgba(92,75,55,0.2)'
            },
            green: {
                background: '#cce8cf',
                color: '#2d4a2e',
                border: 'rgba(45,74,46,0.2)'
            }
        };
        
        return themes[this.settings.theme] || themes.dark;
    }
    
    getFontStyle() {
        const fonts = {
            serif: 'Georgia, "Times New Roman", serif',
            'sans-serif': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            mono: 'Consolas, Monaco, monospace'
        };
        
        return fonts[this.settings.fontFamily] || fonts.serif;
    }
}

window.ReaderManager = ReaderManager;
