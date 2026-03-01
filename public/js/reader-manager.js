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
            theme: 'dark',  // dark, light, sepia
            fontFamily: 'serif',  // serif, sans-serif
            padding: 20
        };
        
        this.loadSettings();
    }
    
    /**
     * 加载设置
     */
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
    
    /**
     * 保存设置
     */
    saveSettings() {
        try {
            localStorage.setItem('readerSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('保存阅读设置失败:', e);
        }
    }
    
    /**
     * 初始化阅读器
     */
    async init(book, source, chapters, startIndex = 0) {
        this.currentBook = book;
        this.currentSource = source;
        this.chapters = chapters;
        this.currentChapterIndex = startIndex;
        
        await this.loadChapter(startIndex);
    }
    
    /**
     * 加载章节
     */
    async loadChapter(index) {
        if (index < 0 || index >= this.chapters.length) {
            return false;
        }
        
        this.currentChapterIndex = index;
        const chapter = this.chapters[index];
        
        // 检查缓存
        const cacheKey = `content_${chapter.url}`;
        let content = app.cacheManager?.get(cacheKey);
        
        if (!content) {
            // 从服务器获取
            try {
                const response = await fetch('/api/content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chapterUrl: chapter.url })
                });
                
                const data = await response.json();
                
                if (data.success && data.html) {
                    content = HtmlParser.parseContent(
                        data.html,
                        this.currentSource.ruleContent,
                        data.baseUrl
                    );
                    
                    // 缓存内容
                    app.cacheManager?.set(cacheKey, content);
                }
            } catch (e) {
                console.error('加载章节失败:', e);
                content = '加载失败，请重试';
            }
        }
        
        this.content = content || '内容为空';
        
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
    
    /**
     * 上一章
     */
    async prevChapter() {
        if (this.currentChapterIndex > 0) {
            return await this.loadChapter(this.currentChapterIndex - 1);
        }
        return false;
    }
    
    /**
     * 下一章
     */
    async nextChapter() {
        if (this.currentChapterIndex < this.chapters.length - 1) {
            return await this.loadChapter(this.currentChapterIndex + 1);
        }
        return false;
    }
    
    /**
     * 跳转到指定章节
     */
    async goToChapter(index) {
        return await this.loadChapter(index);
    }
    
    /**
     * 获取当前章节信息
     */
    getCurrentChapter() {
        return this.chapters[this.currentChapterIndex];
    }
    
    /**
     * 获取阅读进度
     */
    getProgress() {
        return {
            current: this.currentChapterIndex + 1,
            total: this.chapters.length,
            percent: ((this.currentChapterIndex + 1) / this.chapters.length * 100).toFixed(1)
        };
    }
    
    /**
     * 更新设置
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }
    
    /**
     * 获取主题样式
     */
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
    
    /**
     * 获取字体样式
     */
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
