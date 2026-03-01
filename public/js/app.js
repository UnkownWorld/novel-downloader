/**
 * 主应用模块 - 完整版
 * 包含发现页面和书架功能
 */

class App {
    constructor() {
        this.sourceManager = new BookSourceManager();
        this.subscribeManager = new SubscribeManager();
        this.cacheManager = new CacheManager();
        this.invalidSourceManager = new InvalidSourceManager();
        this.bookshelfManager = new BookshelfManager();
        
        this.currentTab = 'search';
        this.searchResults = [];
        this.currentBook = null;
        this.currentSource = null;
        this.currentChapters = [];
        this.downloadContent = '';
        this.isDownloading = false;
        this.downloadAborted = false;
        
        // 发现页面状态
        this.currentExploreSource = null;
        this.exploreResults = [];
        this.explorePage = 1;
        
        this.config = {
            searchConcurrent: 10,
            downloadConcurrent: 10,
            searchTimeout: 30000,
            retryCount: 2,
            retryDelay: 1000,
            cacheExpire: 3600000,
            skipInvalidSource: true
        };
    }
    
    async init() {
        await this.sourceManager.init();
        await this.subscribeManager.init();
        await this.bookshelfManager.init();
        
        this.bindEvents();
        this.render();
        this.updateStats();
        this.renderInvalidSources();
        this.renderBookshelf();
        this.renderExploreSources();
    }
    
    bindEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.search();
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.search());
        }
        
        const importInput = document.getElementById('importInput');
        if (importInput) {
            importInput.addEventListener('change', (e) => this.handleImportFile(e));
        }
    }
    
    switchTab(tab) {
        this.currentTab = tab;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tab}Tab`);
        });
    }
    
    // ==================== 搜索功能 ====================
    
    async search() {
        const keyword = document.getElementById('searchInput')?.value?.trim();
        
        if (!keyword) {
            this.showToast('请输入搜索关键词', true);
            return;
        }
        
        let sources = this.sourceManager.getEnabledSources();
        
        if (sources.length === 0) {
            this.showToast('没有可用的书源，请先导入书源', true);
            this.switchTab('sources');
            return;
        }
        
        if (this.config.skipInvalidSource) {
            const beforeCount = sources.length;
            sources = sources.filter(s => !this.invalidSourceManager.isInvalid(s.bookSourceUrl));
            const skipped = beforeCount - sources.length;
            if (skipped > 0) {
                console.log(`跳过 ${skipped} 个失效书源`);
            }
        }
        
        if (sources.length === 0) {
            this.showToast('所有书源都已失效，请清除失效标记或导入新书源', true);
            return;
        }
        
        const searchBtn = document.getElementById('searchBtn');
        const originalText = searchBtn.textContent;
        searchBtn.textContent = '搜索中...';
        searchBtn.disabled = true;
        
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = `<div class="loading">正在搜索... (使用 ${sources.length} 个书源)</div>`;
        
        try {
            const response = await this.fetchWithRetry('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: keyword,
                    sources: sources.slice(0, this.config.searchConcurrent),
                    page: 1
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '搜索失败');
            }
            
            const allBooks = [];
            
            for (const result of data.results) {
                if (result.success && result.html) {
                    const books = HtmlParser.parseSearchResult(
                        result.html, 
                        result.ruleSearch, 
                        result.baseUrl,
                        { bookSourceUrl: result.source, bookSourceName: result.sourceName }
                    );
                    
                    if (books.length > 0) {
                        allBooks.push(...books);
                        this.invalidSourceManager.remove(result.source);
                    }
                } else {
                    this.invalidSourceManager.add(result.source, result.error);
                }
            }
            
            this.searchResults = this.mergeResults(allBooks, keyword);
            this.renderSearchResults(this.searchResults);
            this.showToast(`找到 ${this.searchResults.length} 个结果`);
            this.renderInvalidSources();
            
        } catch (e) {
            console.error('搜索失败:', e);
            resultsDiv.innerHTML = `<div class="error">搜索失败: ${e.message}</div>`;
            this.showToast('搜索失败: ' + e.message, true);
        } finally {
            searchBtn.textContent = originalText;
            searchBtn.disabled = false;
        }
    }
    
    async fetchWithRetry(url, options, retries = this.config.retryCount) {
        let lastError;
        
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                return response;
            } catch (e) {
                lastError = e;
                if (i < retries - 1) {
                    await this.sleep(this.config.retryDelay * (i + 1));
                }
            }
        }
        
        throw lastError;
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    mergeResults(results, keyword) {
        const merged = new Map();
        
        for (const book of results) {
            const key = `${book.name}_${book.author}`;
            
            if (merged.has(key)) {
                const existing = merged.get(key);
                if (!existing.origins) {
                    existing.origins = [existing.origin];
                    existing.originNames = [existing.originName];
                }
                if (!existing.origins.includes(book.origin)) {
                    existing.origins.push(book.origin);
                    existing.originNames.push(book.originName);
                }
            } else {
                merged.set(key, book);
            }
        }
        
        return Array.from(merged.values()).sort((a, b) => {
            const aExact = a.name === keyword || a.author === keyword;
            const bExact = b.name === keyword || b.author === keyword;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            const aContains = a.name.includes(keyword);
            const bContains = b.name.includes(keyword);
            if (aContains && !bContains) return -1;
            if (!aContains && bContains) return 1;
            
            return (b.origins?.length || 1) - (a.origins?.length || 1);
        });
    }
    
    renderSearchResults(results) {
        const resultsDiv = document.getElementById('searchResults');
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="empty">没有找到结果</div>';
            return;
        }
        
        let html = '';
        
        for (const book of results) {
            const sources = book.originNames || [book.originName];
            const inShelf = this.bookshelfManager.hasBook(book.bookUrl);
            
            html += `
                <div class="book-item" onclick="app.showBookDetail('${this.escapeAttr(book.bookUrl)}', '${this.escapeAttr(book.origin)}')">
                    <div class="book-cover">
                        ${book.coverUrl ? `<img src="${book.coverUrl}" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="book-info">
                        <h3>${this.escapeHtml(book.name)} ${inShelf ? '<span class="in-shelf">📚</span>' : ''}</h3>
                        <div class="meta">
                            <span class="author">${this.escapeHtml(book.author || '未知作者')}</span>
                            <span class="source-count">${sources.length}个来源</span>
                        </div>
                        ${book.lastChapter ? `<div class="latest">最新: ${this.escapeHtml(book.lastChapter)}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        resultsDiv.innerHTML = html;
    }
    
    // ==================== 书籍详情 ====================
    
    async showBookDetail(bookUrl, origin) {
        this.currentSource = this.sourceManager.getSource(origin);
        if (!this.currentSource) {
            this.showToast('书源不存在', true);
            return;
        }
        
        const modal = document.getElementById('bookModal');
        const modalContent = document.getElementById('bookModalContent');
        modal.classList.add('active');
        modalContent.innerHTML = '<div class="loading">加载中...</div>';
        
        try {
            const cacheKey = `book_${bookUrl}`;
            let data = this.cacheManager.get(cacheKey);
            
            if (!data) {
                const response = await this.fetchWithRetry('/api/book-info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookUrl: bookUrl })
                });
                
                data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || '获取失败');
                }
                
                this.cacheManager.set(cacheKey, data);
            }
            
            const bookInfo = HtmlParser.parseBookInfo(
                data.html, 
                this.currentSource.ruleBookInfo, 
                data.baseUrl
            );
            
            this.currentBook = {
                ...this.searchResults.find(b => b.bookUrl === bookUrl) || {},
                ...bookInfo,
                bookUrl: bookUrl,
                origin: origin
            };
            
            this.renderBookDetail(this.currentBook);
            
        } catch (e) {
            console.error('获取书籍信息失败:', e);
            modalContent.innerHTML = `<div class="error">获取失败: ${e.message}</div>`;
        }
    }
    
    renderBookDetail(book) {
        const modalContent = document.getElementById('bookModalContent');
        const inShelf = this.bookshelfManager.hasBook(book.bookUrl);
        const shelfBook = this.bookshelfManager.getBook(book.bookUrl);
        
        modalContent.innerHTML = `
            <div class="book-detail">
                <div class="book-header">
                    ${book.coverUrl ? `<img class="book-cover" src="${book.coverUrl}" onerror="this.style.display='none'">` : ''}
                    <div class="book-title">
                        <h2>${this.escapeHtml(book.name)}</h2>
                        <div class="meta">
                            <span>${this.escapeHtml(book.author || '未知作者')}</span>
                            ${book.kind ? `<span>${this.escapeHtml(book.kind)}</span>` : ''}
                        </div>
                        <div class="source">来源: ${this.escapeHtml(this.currentSource.bookSourceName)}</div>
                        ${shelfBook ? `<div class="progress">已读: 第${shelfBook.readChapter + 1}章</div>` : ''}
                    </div>
                </div>
                
                <div class="book-intro">
                    <h3>简介</h3>
                    <p>${this.escapeHtml(book.intro || '暂无简介')}</p>
                </div>
                
                <div class="book-actions">
                    <button class="btn btn-primary" onclick="app.getChaptersAndDownload()">
                        ${inShelf ? '更新下载' : '开始下载'}
                    </button>
                    ${inShelf ? 
                        `<button class="btn btn-secondary" onclick="app.removeFromShelf()">移出书架</button>` :
                        `<button class="btn btn-secondary" onclick="app.addToShelf()">加入书架</button>`
                    }
                    <button class="btn btn-secondary" onclick="app.showChangeSource()">
                        换源
                    </button>
                    <button class="btn btn-secondary" onclick="app.closeModal()">
                        关闭
                    </button>
                </div>
            </div>
        `;
    }
    
    // ==================== 书架功能 ====================
    
    addToShelf() {
        if (!this.currentBook || !this.currentSource) return;
        
        this.bookshelfManager.addBook(this.currentBook, this.currentSource);
        this.showToast('已加入书架');
        this.renderBookDetail(this.currentBook);
        this.renderBookshelf();
    }
    
    removeFromShelf() {
        if (!this.currentBook) return;
        
        if (confirm('确定从书架移除？')) {
            this.bookshelfManager.removeBook(this.currentBook.bookUrl);
            this.showToast('已移出书架');
            this.renderBookDetail(this.currentBook);
            this.renderBookshelf();
        }
    }
    
    renderBookshelf() {
        const books = this.bookshelfManager.getAllBooks();
        const listDiv = document.getElementById('bookshelfList');
        
        if (!listDiv) return;
        
        if (books.length === 0) {
            listDiv.innerHTML = '<div class="empty">书架空空如也</div>';
            return;
        }
        
        // 按更新时间排序
        books.sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));
        
        let html = '';
        
        for (const book of books) {
            html += `
                <div class="book-item" onclick="app.openFromShelf('${this.escapeAttr(book.bookUrl)}', '${this.escapeAttr(book.origin)}')">
                    <div class="book-cover">
                        ${book.coverUrl ? `<img src="${book.coverUrl}" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="book-info">
                        <h3>${this.escapeHtml(book.name)}</h3>
                        <div class="meta">
                            <span class="author">${this.escapeHtml(book.author || '未知作者')}</span>
                        </div>
                        ${book.readChapterTitle ? `<div class="progress">已读: ${this.escapeHtml(book.readChapterTitle)}</div>` : ''}
                        ${book.lastChapter ? `<div class="latest">最新: ${this.escapeHtml(book.lastChapter)}</div>` : ''}
                    </div>
                    <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); app.removeBookFromShelf('${this.escapeAttr(book.bookUrl)}')">删除</button>
                </div>
            `;
        }
        
        listDiv.innerHTML = html;
    }
    
    openFromShelf(bookUrl, origin) {
        this.currentSource = this.sourceManager.getSource(origin);
        this.currentBook = this.bookshelfManager.getBook(bookUrl);
        
        if (!this.currentSource) {
            this.showToast('书源不存在', true);
            return;
        }
        
        const modal = document.getElementById('bookModal');
        const modalContent = document.getElementById('bookModalContent');
        modal.classList.add('active');
        
        this.renderBookDetail(this.currentBook);
    }
    
    removeBookFromShelf(bookUrl) {
        if (confirm('确定从书架移除？')) {
            this.bookshelfManager.removeBook(bookUrl);
            this.renderBookshelf();
            this.showToast('已移出书架');
        }
    }
    
    // ==================== 发现页面 ====================
    
    renderExploreSources() {
        const sources = this.sourceManager.getEnabledSources().filter(s => s.exploreUrl);
        const selectDiv = document.getElementById('exploreSourceSelect');
        
        if (!selectDiv) return;
        
        if (sources.length === 0) {
            selectDiv.innerHTML = '<div class="empty">没有支持发现的书源</div>';
            return;
        }
        
        let html = '<select id="exploreSource" onchange="app.loadExplore()"><option value="">选择书源</option>';
        
        for (const source of sources) {
            html += `<option value="${this.escapeAttr(source.bookSourceUrl)}">${this.escapeHtml(source.bookSourceName)}</option>`;
        }
        
        html += '</select>';
        selectDiv.innerHTML = html;
    }
    
    async loadExplore() {
        const sourceUrl = document.getElementById('exploreSource')?.value;
        if (!sourceUrl) return;
        
        this.currentExploreSource = this.sourceManager.getSource(sourceUrl);
        if (!this.currentExploreSource || !this.currentExploreSource.exploreUrl) {
            this.showToast('书源不支持发现', true);
            return;
        }
        
        this.explorePage = 1;
        await this.fetchExplore();
    }
    
    async fetchExplore() {
        if (!this.currentExploreSource) return;
        
        const resultsDiv = document.getElementById('exploreResults');
        resultsDiv.innerHTML = '<div class="loading">加载中...</div>';
        
        try {
            const response = await fetch('/api/explore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exploreUrl: this.currentExploreSource.exploreUrl,
                    page: this.explorePage
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '加载失败');
            }
            
            const books = HtmlParser.parseSearchResult(
                data.html,
                this.currentExploreSource.ruleExplore || this.currentExploreSource.ruleSearch,
                data.baseUrl,
                this.currentExploreSource
            );
            
            this.exploreResults = books;
            this.renderExploreResults(books);
            
        } catch (e) {
            console.error('发现加载失败:', e);
            resultsDiv.innerHTML = `<div class="error">加载失败: ${e.message}</div>`;
        }
    }
    
    renderExploreResults(books) {
        const resultsDiv = document.getElementById('exploreResults');
        
        if (books.length === 0) {
            resultsDiv.innerHTML = '<div class="empty">没有内容</div>';
            return;
        }
        
        let html = '<div class="explore-nav">';
        html += `<button class="btn btn-small btn-secondary" onclick="app.prevExplorePage()">上一页</button>`;
        html += `<span>第 ${this.explorePage} 页</span>`;
        html += `<button class="btn btn-small btn-secondary" onclick="app.nextExplorePage()">下一页</button>`;
        html += '</div>';
        
        for (const book of books) {
            html += `
                <div class="book-item" onclick="app.showBookDetail('${this.escapeAttr(book.bookUrl)}', '${this.escapeAttr(book.origin)}')">
                    <div class="book-cover">
                        ${book.coverUrl ? `<img src="${book.coverUrl}" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="book-info">
                        <h3>${this.escapeHtml(book.name)}</h3>
                        <div class="meta">
                            <span class="author">${this.escapeHtml(book.author || '未知作者')}</span>
                        </div>
                        ${book.lastChapter ? `<div class="latest">最新: ${this.escapeHtml(book.lastChapter)}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        resultsDiv.innerHTML = html;
    }
    
    async prevExplorePage() {
        if (this.explorePage <= 1) return;
        this.explorePage--;
        await this.fetchExplore();
    }
    
    async nextExplorePage() {
        this.explorePage++;
        await this.fetchExplore();
    }
    
    // ==================== 换源功能 ====================
    
    async showChangeSource() {
        if (!this.currentBook) return;
        
        const modalContent = document.getElementById('bookModalContent');
        modalContent.innerHTML = '<div class="loading">搜索其他书源...</div>';
        
        try {
            const sources = this.sourceManager.getEnabledSources().filter(
                s => s.bookSourceUrl !== this.currentSource.bookSourceUrl
            );
            
            if (sources.length === 0) {
                modalContent.innerHTML = '<div class="error">没有其他可用书源</div>';
                return;
            }
            
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: this.currentBook.name,
                    sources: sources.slice(0, 10),
                    page: 1
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '搜索失败');
            }
            
            const allBooks = [];
            for (const result of data.results) {
                if (result.success && result.html) {
                    const books = HtmlParser.parseSearchResult(
                        result.html, 
                        result.ruleSearch, 
                        result.baseUrl,
                        { bookSourceUrl: result.source, bookSourceName: result.sourceName }
                    );
                    allBooks.push(...books);
                }
            }
            
            const sameBooks = allBooks.filter(b => 
                b.name === this.currentBook.name && 
                (!this.currentBook.author || b.author === this.currentBook.author)
            );
            
            if (sameBooks.length === 0) {
                modalContent.innerHTML = '<div class="empty">没有找到其他来源</div>';
                return;
            }
            
            this.renderChangeSourceList(sameBooks);
            
        } catch (e) {
            console.error('换源失败:', e);
            modalContent.innerHTML = `<div class="error">换源失败: ${e.message}</div>`;
        }
    }
    
    renderChangeSourceList(books) {
        const modalContent = document.getElementById('bookModalContent');
        
        let html = `<div class="change-source"><h3>选择其他来源 (${books.length})</h3><div class="source-list">`;
        
        for (const book of books) {
            html += `
                <div class="source-item" onclick="app.changeSource('${this.escapeAttr(book.bookUrl)}', '${this.escapeAttr(book.origin)}')">
                    <span class="source-name">${this.escapeHtml(book.originName)}</span>
                    <span class="source-latest">${this.escapeHtml(book.lastChapter || '')}</span>
                </div>
            `;
        }
        
        html += '</div></div>';
        modalContent.innerHTML = html;
    }
    
    async changeSource(bookUrl, origin) {
        this.currentSource = this.sourceManager.getSource(origin);
        this.currentBook = { ...this.currentBook, bookUrl: bookUrl, origin: origin };
        
        // 更新书架
        if (this.bookshelfManager.hasBook(this.currentBook.bookUrl)) {
            this.bookshelfManager.updateBook(this.currentBook.bookUrl, {
                bookUrl: bookUrl,
                origin: origin,
                originName: this.currentSource.bookSourceName
            });
            this.renderBookshelf();
        }
        
        this.showToast('已切换书源');
        this.renderBookDetail(this.currentBook);
    }
    
    // ==================== 下载功能 ====================
    
    async getChaptersAndDownload() {
        if (!this.currentBook || !this.currentSource) return;
        
        const modalContent = document.getElementById('bookModalContent');
        modalContent.innerHTML = '<div class="loading">获取目录中...</div>';
        
        try {
            const cacheKey = `toc_${this.currentBook.tocUrl || this.currentBook.bookUrl}`;
            let data = this.cacheManager.get(cacheKey);
            
            if (!data) {
                const response = await this.fetchWithRetry('/api/chapters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        tocUrl: this.currentBook.tocUrl || this.currentBook.bookUrl 
                    })
                });
                
                data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || '获取目录失败');
                }
                
                this.cacheManager.set(cacheKey, data);
            }
            
            this.currentChapters = HtmlParser.parseChapterList(
                data.html, 
                this.currentSource.ruleToc, 
                data.baseUrl
            );
            
            if (this.currentChapters.length === 0) {
                throw new Error('解析目录失败，没有找到章节');
            }
            
            // 更新书架信息
            if (this.bookshelfManager.hasBook(this.currentBook.bookUrl)) {
                this.bookshelfManager.updateBook(this.currentBook.bookUrl, {
                    lastChapter: this.currentChapters[this.currentChapters.length - 1]?.title,
                    chapterCount: this.currentChapters.length
                });
                this.renderBookshelf();
            }
            
            this.startDownload();
            
        } catch (e) {
            console.error('获取目录失败:', e);
            modalContent.innerHTML = `<div class="error">获取目录失败: ${e.message}</div>`;
        }
    }
    
    async startDownload() {
        if (this.isDownloading) return;
        
        this.isDownloading = true;
        this.downloadAborted = false;
        
        const modalContent = document.getElementById('bookModalContent');
        const total = this.currentChapters.length;
        const concurrent = this.config.downloadConcurrent;
        
        const chapters = new Array(total);
        let completed = 0;
        
        modalContent.innerHTML = `
            <div class="download-progress">
                <h3>下载中... (并发: ${concurrent})</h3>
                <div class="progress-bar">
                    <div class="progress-fill" id="downloadProgressFill" style="width: 0%"></div>
                </div>
                <div class="progress-text" id="downloadProgressText">0 / ${total}</div>
                <button class="btn btn-danger btn-small" onclick="app.abortDownload()" style="margin-top:10px">停止下载</button>
            </div>
        `;
        
        const updateProgress = () => {
            const percent = (completed / total * 100).toFixed(1);
            const fill = document.getElementById('downloadProgressFill');
            const text = document.getElementById('downloadProgressText');
            if (fill) fill.style.width = percent + '%';
            if (text) text.textContent = `${completed} / ${total}`;
        };
        
        const downloadChapter = async (index) => {
            if (this.downloadAborted) return;
            
            const chapter = this.currentChapters[index];
            
            const cacheKey = `content_${chapter.url}`;
            let content = this.cacheManager.get(cacheKey);
            
            if (!content) {
                try {
                    const response = await this.fetchWithRetry('/api/content', {
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
                        
                        this.cacheManager.set(cacheKey, content);
                    }
                } catch (e) {
                    content = '[下载失败]';
                }
            }
            
            chapters[index] = {
                title: chapter.title,
                content: content || '[内容为空]'
            };
            
            completed++;
            updateProgress();
        };
        
        for (let i = 0; i < total; i += concurrent) {
            if (this.downloadAborted) break;
            
            const batch = [];
            for (let j = i; j < Math.min(i + concurrent, total); j++) {
                batch.push(downloadChapter(j));
            }
            
            await Promise.all(batch);
        }
        
        if (!this.downloadAborted) {
            this.assembleContent(chapters);
        } else {
            modalContent.innerHTML = '<div class="error">下载已停止</div>';
        }
        
        this.isDownloading = false;
    }
    
    abortDownload() {
        this.downloadAborted = true;
    }
    
    assembleContent(chapters) {
        const content = [];
        
        content.push(this.currentBook.name);
        content.push(`作者: ${this.currentBook.author || '未知'}`);
        content.push(`来源: ${this.currentSource.bookSourceName}`);
        content.push('');
        content.push('='.repeat(50));
        content.push('');
        
        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            if (chapter) {
                content.push(`\n\n第${i + 1}章 ${chapter.title}\n\n${chapter.content}`);
            }
        }
        
        this.downloadContent = content.join('');
        this.downloadComplete();
    }
    
    downloadComplete() {
        const modalContent = document.getElementById('bookModalContent');
        
        modalContent.innerHTML = `
            <div class="download-complete">
                <h3>✓ 下载完成</h3>
                <p>共 ${this.downloadContent.length} 字</p>
                <div class="actions">
                    <button class="btn btn-primary" onclick="app.saveToFile()">保存文件</button>
                    <button class="btn btn-secondary" onclick="app.copyToClipboard()">复制内容</button>
                </div>
            </div>
        `;
    }
    
    saveToFile() {
        if (!this.downloadContent) return;
        
        const filename = `${this.currentBook.name}.txt`;
        const blob = new Blob([this.downloadContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('文件已保存');
    }
    
    async copyToClipboard() {
        if (!this.downloadContent) return;
        
        try {
            await navigator.clipboard.writeText(this.downloadContent);
            this.showToast('已复制到剪贴板');
        } catch (e) {
            this.showToast('复制失败', true);
        }
    }
    
    closeModal() {
        document.getElementById('bookModal')?.classList.remove('active');
    }
    
    // ==================== 书源管理 ====================
    
    async handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const result = await this.sourceManager.importSources(text);
            
            this.showToast(`导入成功: 新增 ${result.added} 个，更新 ${result.updated} 个`);
            this.updateStats();
            this.renderSourceList();
            this.renderExploreSources();
            
        } catch (e) {
            this.showToast('导入失败: ' + e.message, true);
        }
        
        event.target.value = '';
    }
    
    async importFromUrl() {
        const url = prompt('请输入书源URL:');
        if (!url) return;
        
        try {
            const result = await this.sourceManager.importFromUrl(url);
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            this.showToast(`导入成功: 新增 ${result.added} 个，更新 ${result.updated} 个`);
            this.updateStats();
            this.renderSourceList();
            this.renderExploreSources();
            
        } catch (e) {
            this.showToast('导入失败: ' + e.message, true);
        }
    }
    
    exportSources() {
        const json = this.sourceManager.exportSources();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bookSources.json';
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('导出成功');
    }
    
    async testSources() {
        const sources = this.sourceManager.getEnabledSources();
        
        if (sources.length === 0) {
            this.showToast('没有可测试的书源', true);
            return;
        }
        
        const statusDiv = document.getElementById('testStatus');
        statusDiv.classList.remove('hidden');
        statusDiv.innerHTML = '<div class="loading">测试中...</div>';
        
        const results = [];
        const keyword = '我的';
        
        for (const source of sources.slice(0, 20)) {
            const startTime = Date.now();
            
            try {
                if (!source.searchUrl) {
                    results.push({
                        bookSourceName: source.bookSourceName,
                        success: false,
                        error: '未配置搜索URL',
                        responseTime: 0
                    });
                    continue;
                }
                
                const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        keyword: keyword,
                        sources: [source],
                        page: 1
                    })
                });
                
                const data = await response.json();
                
                if (data.success && data.results[0]?.html) {
                    const books = HtmlParser.parseSearchResult(
                        data.results[0].html,
                        source.ruleSearch,
                        data.results[0].baseUrl,
                        source
                    );
                    
                    results.push({
                        bookSourceName: source.bookSourceName,
                        success: books.length > 0,
                        error: books.length > 0 ? '' : '无搜索结果',
                        responseTime: Date.now() - startTime
                    });
                } else {
                    results.push({
                        bookSourceName: source.bookSourceName,
                        success: false,
                        error: data.results[0]?.error || '请求失败',
                        responseTime: Date.now() - startTime
                    });
                }
                
            } catch (e) {
                results.push({
                    bookSourceName: source.bookSourceName,
                    success: false,
                    error: e.message,
                    responseTime: Date.now() - startTime
                });
            }
        }
        
        this.renderTestResults(results);
    }
    
    renderTestResults(results) {
        const statusDiv = document.getElementById('testStatus');
        
        const valid = results.filter(r => r.success).length;
        const invalid = results.filter(r => !r.success).length;
        
        let html = `
            <div class="test-results">
                <div class="test-summary">
                    <span class="valid">✓ 有效: ${valid}</span>
                    <span class="invalid">✗ 失效: ${invalid}</span>
                </div>
                <div class="test-list">
        `;
        
        for (const result of results) {
            const statusClass = result.success ? 'valid' : 'invalid';
            const statusIcon = result.success ? '✓' : '✗';
            
            html += `
                <div class="test-item ${statusClass}">
                    <span class="status">${statusIcon}</span>
                    <span class="name">${this.escapeHtml(result.bookSourceName)}</span>
                    <span class="time">${result.responseTime}ms</span>
                </div>
            `;
        }
        
        html += '</div></div>';
        statusDiv.innerHTML = html;
    }
    
    renderSourceList() {
        const sources = this.sourceManager.getAllSources();
        const listDiv = document.getElementById('sourceList');
        
        if (!listDiv) return;
        
        if (sources.length === 0) {
            listDiv.innerHTML = '<div class="empty">暂无书源，请导入书源</div>';
            return;
        }
        
        let html = '';
        
        for (const source of sources) {
            const isInvalid = this.invalidSourceManager.isInvalid(source.bookSourceUrl);
            html += `
                <div class="source-item ${source.enabled ? '' : 'disabled'} ${isInvalid ? 'invalid' : ''}">
                    <div class="source-info">
                        <span class="source-name">${this.escapeHtml(source.bookSourceName)}${isInvalid ? ' (失效)' : ''}${source.exploreUrl ? ' 🌐' : ''}</span>
                        <span class="source-url">${this.escapeHtml(source.bookSourceUrl)}</span>
                    </div>
                    <div class="source-actions">
                        <button class="btn btn-small ${source.enabled ? 'btn-secondary' : 'btn-success'}" 
                                onclick="app.toggleSource('${this.escapeAttr(source.bookSourceUrl)}')">
                            ${source.enabled ? '禁用' : '启用'}
                        </button>
                        <button class="btn btn-small btn-danger" 
                                onclick="app.removeSource('${this.escapeAttr(source.bookSourceUrl)}')">
                            删除
                        </button>
                    </div>
                </div>
            `;
        }
        
        listDiv.innerHTML = html;
    }
    
    toggleSource(url) {
        const source = this.sourceManager.getSource(url);
        if (source) {
            this.sourceManager.setSourceEnabled(url, !source.enabled);
            this.renderSourceList();
            this.renderExploreSources();
            this.updateStats();
        }
    }
    
    removeSource(url) {
        if (confirm('确定删除此书源？')) {
            this.sourceManager.removeSource(url);
            this.invalidSourceManager.remove(url);
            this.renderSourceList();
            this.renderExploreSources();
            this.updateStats();
            this.showToast('已删除书源');
        }
    }
    
    updateStats() {
        const stats = this.sourceManager.getStats();
        
        const countEl = document.getElementById('sourceCount');
        if (countEl) {
            countEl.textContent = `${stats.enabled} / ${stats.total}`;
        }
        
        const shelfStats = this.bookshelfManager.getStats();
        const shelfCountEl = document.getElementById('bookshelfCount');
        if (shelfCountEl) {
            shelfCountEl.textContent = shelfStats.total;
        }
    }
    
    renderInvalidSources() {
        const invalidSources = this.invalidSourceManager.getAll();
        const listDiv = document.getElementById('invalidSourceList');
        
        if (!listDiv) return;
        
        if (invalidSources.length === 0) {
            listDiv.innerHTML = '<div class="empty">暂无失效书源</div>';
            return;
        }
        
        let html = `<div class="invalid-header">失效书源 (${invalidSources.length}) <button class="btn btn-small btn-secondary" onclick="app.clearInvalidSources()">清除全部</button></div>`;
        
        for (const item of invalidSources) {
            html += `
                <div class="invalid-item">
                    <span>${this.escapeHtml(item.url)}</span>
                    <span class="error">${this.escapeHtml(item.error)}</span>
                </div>
            `;
        }
        
        listDiv.innerHTML = html;
    }
    
    clearInvalidSources() {
        this.invalidSourceManager.clear();
        this.renderInvalidSources();
        this.renderSourceList();
        this.showToast('已清除失效标记');
    }
    
    render() {
        this.renderSourceList();
        this.renderInvalidSources();
        this.renderBookshelf();
        this.renderExploreSources();
        
        const subscriptions = this.subscribeManager.getAllSubscriptions();
        const subListDiv = document.getElementById('subscribeList');
        
        if (subListDiv) {
            if (subscriptions.length === 0) {
                subListDiv.innerHTML = '<div class="empty">暂无订阅</div>';
            } else {
                let html = '';
                for (const sub of subscriptions) {
                    html += `
                        <div class="subscribe-item">
                            <div class="subscribe-info">
                                <span class="subscribe-name">${this.escapeHtml(sub.name)}</span>
                                <span class="subscribe-count">${sub.sourceCount} 个书源</span>
                            </div>
                            <div class="subscribe-actions">
                                <button class="btn btn-small btn-secondary" onclick="app.refreshSubscription('${sub.id}')">刷新</button>
                                <button class="btn btn-small btn-danger" onclick="app.removeSubscription('${sub.id}')">删除</button>
                            </div>
                        </div>
                    `;
                }
                subListDiv.innerHTML = html;
            }
        }
    }
    
    async addSubscription() {
        const url = prompt('请输入订阅URL:');
        if (!url) return;
        
        try {
            const result = await this.subscribeManager.addSubscription(url);
            
            if (result.success) {
                await this.sourceManager.addSources(result.sources);
                this.showToast(`订阅成功，导入 ${result.sources.length} 个书源`);
                this.render();
                this.updateStats();
            } else {
                throw new Error(result.error || '订阅失败');
            }
        } catch (e) {
            this.showToast('订阅失败: ' + e.message, true);
        }
    }
    
    async refreshSubscription(id) {
        try {
            const result = await this.subscribeManager.updateSubscription(id);
            
            if (result.success) {
                await this.sourceManager.addSources(result.sources);
                this.showToast(`刷新成功，更新 ${result.sources.length} 个书源`);
                this.render();
                this.updateStats();
            } else {
                throw new Error(result.error || '刷新失败');
            }
        } catch (e) {
            this.showToast('刷新失败: ' + e.message, true);
        }
    }
    
    removeSubscription(id) {
        if (confirm('确定删除此订阅？')) {
            this.subscribeManager.removeSubscription(id);
            this.render();
            this.showToast('已删除订阅');
        }
    }
    
    clearAllData() {
        if (confirm('确定清除所有数据？此操作不可恢复！')) {
            localStorage.clear();
            location.reload();
        }
    }
    
    showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    escapeAttr(str) {
        if (!str) return '';
        return str.toString()
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }
}

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    app.init();
});
