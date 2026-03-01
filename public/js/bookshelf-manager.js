/**
 * 书架管理模块
 */

class BookshelfManager {
    constructor() {
        this.storageKey = 'bookshelf';
        this.books = [];
    }
    
    /**
     * 初始化
     */
    async init() {
        this.books = this.load();
        return this;
    }
    
    /**
     * 加载书架
     */
    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('加载书架失败:', e);
        }
        return [];
    }
    
    /**
     * 保存书架
     */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.books));
            return true;
        } catch (e) {
            console.error('保存书架失败:', e);
            return false;
        }
    }
    
    /**
     * 添加书籍到书架
     */
    addBook(book, source) {
        // 检查是否已存在
        const index = this.books.findIndex(b => b.bookUrl === book.bookUrl);
        
        const bookData = {
            ...book,
            origin: source.bookSourceUrl,
            originName: source.bookSourceName,
            addTime: Date.now(),
            updateTime: Date.now(),
            readChapter: 0,
            readProgress: 0
        };
        
        if (index >= 0) {
            // 更新
            this.books[index] = { ...this.books[index], ...bookData };
        } else {
            // 添加
            this.books.push(bookData);
        }
        
        return this.save();
    }
    
    /**
     * 从书架移除
     */
    removeBook(bookUrl) {
        const index = this.books.findIndex(b => b.bookUrl === bookUrl);
        if (index >= 0) {
            this.books.splice(index, 1);
            return this.save();
        }
        return false;
    }
    
    /**
     * 获取书籍
     */
    getBook(bookUrl) {
        return this.books.find(b => b.bookUrl === bookUrl);
    }
    
    /**
     * 获取所有书籍
     */
    getAllBooks() {
        return [...this.books];
    }
    
    /**
     * 更新阅读进度
     */
    updateProgress(bookUrl, chapterIndex, chapterTitle) {
        const book = this.getBook(bookUrl);
        if (book) {
            book.readChapter = chapterIndex;
            book.readChapterTitle = chapterTitle;
            book.updateTime = Date.now();
            return this.save();
        }
        return false;
    }
    
    /**
     * 更新书籍信息
     */
    updateBook(bookUrl, data) {
        const index = this.books.findIndex(b => b.bookUrl === bookUrl);
        if (index >= 0) {
            this.books[index] = { ...this.books[index], ...data, updateTime: Date.now() };
            return this.save();
        }
        return false;
    }
    
    /**
     * 检查书籍是否在书架
     */
    hasBook(bookUrl) {
        return this.books.some(b => b.bookUrl === bookUrl);
    }
    
    /**
     * 获取统计
     */
    getStats() {
        return {
            total: this.books.length,
            updated: this.books.filter(b => b.hasUpdate).length
        };
    }
    
    /**
     * 排序
     */
    sortBy(field, desc = true) {
        this.books.sort((a, b) => {
            const aVal = a[field] || 0;
            const bVal = b[field] || 0;
            return desc ? bVal - aVal : aVal - bVal;
        });
        return this.books;
    }
}

// 导出
window.BookshelfManager = BookshelfManager;
