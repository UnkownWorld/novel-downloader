/**
 * 主应用模块 - 带调试功能
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
        
        this.currentExploreSource = null;
        this.exploreResults = [];
        this.explorePage = 1;
        
        // 调试模式
        this.debugMode = false;
        this.readerManager = null;
        this.lastSearchResults = [];
        
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
        
        // 调试模式开关
        const debugCheckbox = document.getElementById('debugMode');
        if (debugCheckbox) {
            debugCheckbox.addEventListener('change', (e) => {
                this.debugMode = e.target.checked;
                this.showToast(this.debugMode ? '调试模式已开启' : '调试模式已关闭');
            });
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
        resultsDiv.innerHTML = `<div class="loading">正在搜索 "${keyword}"... (使用 ${sources.length} 个书源)</div>`;
        
        try {
            const response = await this.fetchWithRetry('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: keyword,
                    sources: sources.slice(0, this.config.searchConcurrent),
                    page: 1,
                    debug: this.debugMode
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '搜索失败');
            }
            
            // 保存原始结果用于调试
            this.lastSearchResults = data.results;
            
            const allBooks = [];
            const sourceStats = {
                total: data.results.length,
                success: 0,
                failed: 0,
                filtered: 0,
                noResults: 0
            };
            
            for (const result of data.results) {
                if (result.success && result.html) {
                    // 检查是否被过滤
                    if (result.isFiltered) {
                        sourceStats.filtered++;
                        console.log(`[${result.sourceName}] 可能被过滤: ${result.filterReason}`);
                        continue;
                    }
                    
                    const books = HtmlParser.parseSearchResult(
                        result.html, 
                        result.ruleSearch, 
                        result.baseUrl,
                        { bookSourceUrl: result.source, bookSourceName: result.sourceName }
                    );
                    
                    if (books.length > 0) {
                        allBooks.push(...books);
                        sourceStats.success++;
                        this.invalidSourceManager.remove(result.source);
                    } else {
                        sourceStats.noResults++;
                        // 调试模式下显示详细信息
                        if (this.debugMode) {
                            console.log(`[${result.sourceName}] 无结果, HTML长度: ${result.htmlLength}`);
                        }
                    }
                } else {
                    sourceStats.failed++;
                    this.invalidSourceManager.add(result.source, result.error);
                }
            }
            
            this.searchResults = this.mergeResults(allBooks, keyword);
            
            // 显示结果和统计
            this.renderSearchResults(this.searchResults, sourceStats, keyword);
            
            if (this.searchResults.length > 0) {
                this.showToast(`找到 ${this.searchResults.length} 个结果`);
            } else {
                this.showToast(`没有找到结果，尝试其他关键词或书源`, true);
            }
            
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
    
    renderSearchResults(results, stats = null, keyword = '') {
        const resultsDiv = document.getElementById('searchResults');
        
        let html = '';
        
        // 显示统计信息
        if (stats) {
            html += `
                <div class="search-stats">
                    <span>📚 找到 <strong>${results.length}</strong> 个结果</span>
                    <span class="stats-detail">
                        成功: ${stats.success} | 
                        无结果: ${stats.noResults} | 
                        被过滤: ${stats.filtered} | 
                        失败: ${stats.failed}
                    </span>
                    ${this.debugMode ? `<button class="btn btn-small btn-secondary" onclick="app.showDebugInfo()">查看调试信息</button>` : ''}
                </div>
            `;
        }
        
        if (results.length === 0) {
            html += `
                <div class="empty">
                    <p>没有找到 "${keyword}" 相关的小说</p>
                    <p class="hint">可能原因：</p>
                    <ul>
                        <li>关键词被网站过滤</li>
                        <li>书源规则不匹配</li>
                        <li>尝试使用其他关键词</li>
                    </ul>
                </div>
            `;
            resultsDiv.innerHTML = html;
            return;
        }
        
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
    
    /**
     * 显示调试信息
     */
    showDebugInfo() {
        if (!this.lastSearchResults || this.lastSearchResults.length === 0) {
            this.showToast('没有调试信息', true);
            return;
        }
        
        const modal = document.getElementById('bookModal');
        const modalContent = document.getElementById('bookModalContent');
        modal.classList.add('active');
        
        let html = '<div class="debug-info"><h3>调试信息</h3>';
        
        for (const result of this.lastSearchResults) {
            html += `
                <div class="debug-item">
                    <h4>${this.escapeHtml(result.sourceName)}</h4>
                    <div class="debug-detail">
                        <p>状态: ${result.success ? '✓ 成功' : '✗ 失败'}</p>
                        <p>请求URL: <code>${this.escapeHtml(result.requestUrl || 'N/A')}</code></p>
                        <p>响应时间: ${result.responseTime}ms</p>
                        <p>HTML长度: ${result.htmlLength || result.html?.length || 0}</p>
                        ${result.isFiltered ? `<p class="warning">⚠️ 可能被过滤: ${result.filterReason}</p>` : ''}
                        ${result.error ? `<p class="error">错误: ${this.escapeHtml(result.error)}</p>` : ''}
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        modalContent.innerHTML = html;
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
                
                <!-- 主要操作：阅读 -->
                <div class="book-actions-main">
                    <button class="btn btn-primary btn-large" onclick="app.startReading()">
                        📖 开始阅读
                    </button>
                </div>
                
                <!-- 次要操作 -->
                <div class="book-actions">
                    <button class="btn btn-secondary" onclick="app.getChaptersAndDownload()">
                        📥 ${inShelf ? '更新缓存' : '缓存全书'}
                    </button>
                    ${inShelf ? 
                        `<button class="btn btn-secondary" onclick="app.removeFromShelf()">移出书架</button>` :
                        `<button class="btn btn-secondary" onclick="app.addToShelf()">加入书架</button>`
                    }
                    <button class="btn btn-secondary" onclick="app.showChangeSource()">换源</button>
                    <button class="btn btn-secondary" onclick="app.debugChapter()">🔍 调试</button>
                    <button class="btn btn-secondary" onclick="app.closeModal()">关闭</button>
                </div>
            </div>
        `;
    }
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
            listDiv.innerHTML = '<div class="empty">书架空空如也，去搜索添加吧</div>';
            return;
        }
        
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
        modalContent.innerHTML = '<div class="loading">正在搜索其他书源...</div>';
        
        try {
            // 获取所有启用的书源
            const sources = this.sourceManager.getEnabledSources();
            
            if (sources.length === 0) {
                modalContent.innerHTML = '<div class="error">没有可用的书源</div>';
                return;
            }
            
            // 排除当前书源
            const otherSources = sources.filter(
                s => s.bookSourceUrl !== this.currentSource.bookSourceUrl
            );
            
            if (otherSources.length === 0) {
                modalContent.innerHTML = '<div class="error">没有其他可用书源</div>';
                return;
            }
            
            // 显示搜索进度
            modalContent.innerHTML = `
                <div class="change-source-progress">
                    <h3>🔄 换书源</h3>
                    <p>正在用 "${this.escapeHtml(this.currentBook.name)}" 在 ${otherSources.length} 个书源中搜索...</p>
                    <div class="progress-bar">
                        <div class="progress-fill" id="changeSourceProgress" style="width: 0%"></div>
                    </div>
                </div>
            `;
            
            // 分批搜索
            const batchSize = 10;
            const allBooks = [];
            let completed = 0;
            
            for (let i = 0; i < otherSources.length; i += batchSize) {
                const batch = otherSources.slice(i, i + batchSize);
                
                try {
                    const response = await fetch('/api/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            keyword: this.currentBook.name,
                            sources: batch,
                            page: 1
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
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
                    }
                } catch (e) {
                    console.error('搜索批次失败:', e);
                }
                
                completed += batch.length;
                const progress = Math.min(100, (completed / otherSources.length * 100));
                const progressBar = document.getElementById('changeSourceProgress');
                if (progressBar) {
                    progressBar.style.width = progress + '%';
                }
            }
            
            // 匹配同名书籍
            const bookName = this.currentBook.name.toLowerCase().trim();
            const bookAuthor = (this.currentBook.author || '').toLowerCase().trim();
            
            // 完全匹配
            const exactMatches = allBooks.filter(b => {
                const name = (b.name || '').toLowerCase().trim();
                const author = (b.author || '').toLowerCase().trim();
                return name === bookName && (!bookAuthor || author === bookAuthor || author.includes(bookAuthor) || bookAuthor.includes(author));
            });
            
            // 模糊匹配（书名相似）
            const fuzzyMatches = allBooks.filter(b => {
                const name = (b.name || '').toLowerCase().trim();
                if (name === bookName) return false;
                return name.includes(bookName) || bookName.includes(name);
            });
            
            if (exactMatches.length === 0 && fuzzyMatches.length === 0) {
                modalContent.innerHTML = `
                    <div class="change-source-result">
                        <h3>🔄 换书源</h3>
                        <div class="empty">
                            <p>没有找到其他来源</p>
                            <p class="hint">可能原因：</p>
                            <ul>
                                <li>其他书源没有这本书</li>
                                <li>书名在不同网站有差异</li>
                            </ul>
                        </div>
                        <button class="btn btn-secondary" onclick="app.renderBookDetail(app.currentBook)">返回</button>
                    </div>
                `;
                return;
            }
            
            this.renderChangeSourceList(exactMatches, fuzzyMatches);
            
        } catch (e) {
            console.error('换源失败:', e);
            modalContent.innerHTML = `<div class="error">换源失败: ${e.message}</div>`;
        }
    }
    
    renderChangeSourceList(exactMatches, fuzzyMatches) {
        const modalContent = document.getElementById('bookModalContent');
        
        let html = `
            <div class="change-source-result">
                <h3>🔄 换书源</h3>
                <p class="change-source-hint">点击选择新的书源</p>
        `;
        
        // 完全匹配
        if (exactMatches.length > 0) {
            html += `
                <div class="match-section">
                    <h4>✅ 完全匹配 (${exactMatches.length})</h4>
                    <div class="source-list">
            `;
            
            for (const book of exactMatches) {
                const isCurrent = book.origin === this.currentSource?.bookSourceUrl;
                html += `
                    <div class="source-item ${isCurrent ? 'current' : ''}" 
                         onclick="app.changeSource('${this.escapeAttr(book.bookUrl)}', '${this.escapeAttr(book.origin)}')">
                        <div class="source-info">
                            <span class="source-name">${this.escapeHtml(book.originName)}</span>
                            ${book.lastChapter ? `<span class="source-latest">最新: ${this.escapeHtml(book.lastChapter)}</span>` : ''}
                        </div>
                        ${isCurrent ? '<span class="current-badge">当前</span>' : ''}
                    </div>
                `;
            }
            
            html += '</div></div>';
        }
        
        // 模糊匹配
        if (fuzzyMatches.length > 0) {
            html += `
                <div class="match-section">
                    <h4>🔍 相似结果 (${fuzzyMatches.length})</h4>
                    <div class="source-list">
            `;
            
            for (const book of fuzzyMatches.slice(0, 20)) {
                html += `
                    <div class="source-item" 
                         onclick="app.changeSource('${this.escapeAttr(book.bookUrl)}', '${this.escapeAttr(book.origin)}')">
                        <div class="source-info">
                            <span class="source-name">${this.escapeHtml(book.name)}</span>
                            <span class="source-author">${this.escapeHtml(book.author || '未知作者')}</span>
                            <span class="source-from">来源: ${this.escapeHtml(book.originName)}</span>
                        </div>
                    </div>
                `;
            }
            
            html += '</div></div>';
        }
        
        html += `
                <div class="change-source-actions">
                    <button class="btn btn-secondary" onclick="app.renderBookDetail(app.currentBook)">返回</button>
                </div>
            </div>
        `;
        
        modalContent.innerHTML = html;
    }
    
    async changeSource(bookUrl, origin) {
        this.currentSource = this.sourceManager.getSource(origin);
        this.currentBook = { ...this.currentBook, bookUrl: bookUrl, origin: origin };
        
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
            let cachedData = this.cacheManager.get(cacheKey);
            let content = '';
            let error = '';
            
            // 检查缓存
            if (cachedData) {
                if (typeof cachedData === 'object' && cachedData.content) {
                    content = cachedData.content;
                } else if (typeof cachedData === 'string') {
                    content = cachedData;
                }
            }
            
            // 没有缓存则请求
            if (!content) {
                try {
                    const response = await this.fetchWithRetry('/api/content', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chapterUrl: chapter.url })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success && data.html) {
                        const parseResult = HtmlParser.parseContent(
                            data.html, 
                            this.currentSource.ruleContent, 
                            data.baseUrl
                        );
                        
                        if (parseResult.success && parseResult.content) {
                            content = parseResult.content;
                            // 缓存对象格式
                            this.cacheManager.set(cacheKey, { content, success: true });
                        } else {
                            error = parseResult.error || '选择器未匹配';
                            content = `[解析失败: ${error}]`;
                            console.warn(`章节 "${chapter.title}" 解析失败:`, parseResult.debug);
                        }
                    } else {
                        error = data.error || 'HTTP错误';
                        content = `[获取失败: ${error}]`;
                    }
                } catch (e) {
                    error = e.message;
                    content = `[下载错误: ${error}]`;
                }
            }
            
            chapters[index] = {
                title: chapter.title,
                content: content,
                error: error,
                length: content.length
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
        
        this.showToast('正在获取订阅...');
        
        try {
            const result = await this.subscribeManager.addSubscription(url);
            
            if (result.success) {
                if (result.sources && result.sources.length > 0) {
                    const addResult = await this.sourceManager.addSources(result.sources);
                    
                    this.showToast(`订阅成功！导入 ${result.sources.length} 个书源（新增 ${addResult.added}，更新 ${addResult.updated}）`);
                    
                    // 立即刷新所有相关界面
                    this.renderSourceList();
                    this.renderExploreSources();
                    this.updateStats();
                    this.render();
                } else {
                    this.showToast('订阅成功，但没有获取到书源', true);
                }
            } else {
                throw new Error(result.error || '订阅失败');
            }
        } catch (e) {
            console.error('订阅失败:', e);
            this.showToast('订阅失败: ' + e.message, true);
        }
    }
    
    async refreshSubscription(id) {
        try {
            const result = await this.subscribeManager.updateSubscription(id);
            
            if (result.success) {
                if (result.sources && result.sources.length > 0) {
                    const addResult = await this.sourceManager.addSources(result.sources);
                    
                    this.showToast(`刷新成功！更新 ${result.sources.length} 个书源（新增 ${addResult.added}，更新 ${addResult.updated}）`);
                    
                    // 立即刷新所有相关界面
                    this.renderSourceList();
                    this.renderExploreSources();
                    this.updateStats();
                    this.render();
                } else {
                    this.showToast('刷新成功，但没有获取到书源');
                }
            } else {
                throw new Error(result.error || '刷新失败');
            }
        } catch (e) {
            console.error('刷新失败:', e);
            this.showToast('刷新失败: ' + e.message, true);
        }
    }
    
    
    async syncAllSubscriptions() {
        const subscriptions = this.subscribeManager.getAllSubscriptions();
        
        if (subscriptions.length === 0) {
            this.showToast('没有订阅需要同步');
            return;
        }
        
        this.showToast('开始同步所有订阅...');
        
        let totalAdded = 0;
        let totalUpdated = 0;
        
        for (const sub of subscriptions) {
            try {
                const result = await this.subscribeManager.updateSubscription(sub.id);
                
                if (result.success && result.sources && result.sources.length > 0) {
                    const addResult = await this.sourceManager.addSources(result.sources);
                    totalAdded += addResult.added;
                    totalUpdated += addResult.updated;
                }
            } catch (e) {
                console.error(`同步订阅 ${sub.name} 失败:`, e);
            }
        }
        
        // 刷新界面
        this.renderSourceList();
        this.renderExploreSources();
        this.updateStats();
        this.render();
        
        this.showToast(`同步完成！新增 ${totalAdded} 个，更新 ${totalUpdated} 个书源`);
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

// ==================== 阅读器功能 ====================

/**
 * 开始阅读
 */
App.prototype.startReading = async function(startIndex = 0) {
    if (!this.currentBook || !this.currentSource) return;
    
    const modalContent = document.getElementById('bookModalContent');
    modalContent.innerHTML = '<div class="loading">加载目录中...</div>';
    
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
            throw new Error('没有找到章节');
        }
        
        if (!this.readerManager) {
            this.readerManager = new ReaderManager();
        }
        
        await this.readerManager.init(
            this.currentBook,
            this.currentSource,
            this.currentChapters,
            startIndex
        );
        
        this.showReader();
        
    } catch (e) {
        console.error('开始阅读失败:', e);
        modalContent.innerHTML = `<div class="error">加载失败: ${e.message}</div>`;
    }
};

/**
 * 显示阅读器
 */
App.prototype.showReader = function() {
    const modal = document.getElementById('bookModal');
    const modalContent = document.getElementById('bookModalContent');
    
    modal.classList.add('active');
    
    const chapter = this.readerManager.getCurrentChapter();
    const progress = this.readerManager.getProgress();
    const theme = this.readerManager.getThemeStyle();
    const settings = this.readerManager.settings;
    
    modalContent.innerHTML = `
        <div class="reader" style="background: ${theme.background}; color: ${theme.color};">
            <div class="reader-header" style="border-color: ${theme.border}">
                <button class="btn btn-small btn-secondary" onclick="app.closeReader()">← 返回</button>
                <span class="reader-title">${this.escapeHtml(this.currentBook.name)}</span>
                <button class="btn btn-small btn-secondary" onclick="app.showReaderSettings()">⚙️</button>
            </div>
            
            <div class="reader-content" id="readerContent" style="
                font-size: ${settings.fontSize}px;
                line-height: ${settings.lineHeight};
                font-family: ${this.readerManager.getFontStyle()};
                padding: ${settings.padding}px;
            ">
                <h3 class="chapter-title">${this.escapeHtml(chapter.title)}</h3>
                <div class="chapter-content">${this.formatContent(this.readerManager.content)}</div>
            </div>
            
            <div class="reader-footer" style="border-color: ${theme.border}">
                <button class="btn btn-secondary" onclick="app.prevChapter()" ${progress.current <= 1 ? 'disabled' : ''}>
                    上一章
                </button>
                <div class="reader-progress">
                    <span>${progress.current}/${progress.total}</span>
                    <div class="progress-bar-mini">
                        <div class="progress-fill-mini" style="width: ${progress.percent}%"></div>
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="app.nextChapter()" ${progress.current >= progress.total ? 'disabled' : ''}>
                    下一章
                </button>
            </div>
            
            <div class="reader-nav" id="readerNav">
                <button onclick="app.prevChapter()">⏮️</button>
                <button onclick="app.showChapterList()">📋 目录</button>
                <button onclick="app.showReaderSettings()">⚙️ 设置</button>
                <button onclick="app.nextChapter()">⏭️</button>
            </div>
        </div>
    `;
    
    document.addEventListener('keydown', this.handleReaderKeydown);
    
    const readerContent = document.getElementById('readerContent');
    readerContent.addEventListener('click', (e) => {
        const rect = readerContent.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        if (x < width * 0.3) {
            this.prevChapter();
        } else if (x > width * 0.7) {
            this.nextChapter();
        } else {
            this.toggleReaderNav();
        }
    });
};

App.prototype.prevChapter = async function() {
    const success = await this.readerManager.prevChapter();
    if (success) {
        this.showReader();
    } else {
        this.showToast('已经是第一章了', true);
    }
};

App.prototype.nextChapter = async function() {
    const success = await this.readerManager.nextChapter();
    if (success) {
        this.showReader();
        document.getElementById('readerContent')?.scrollTo(0, 0);
    } else {
        this.showToast('已经是最后一章了', true);
    }
};

App.prototype.goToChapter = async function(index) {
    const success = await this.readerManager.goToChapter(index);
    if (success) {
        this.showReader();
    }
};

App.prototype.showChapterList = function() {
    const modalContent = document.getElementById('bookModalContent');
    const currentIndex = this.readerManager.currentChapterIndex;
    
    let html = `
        <div class="chapter-list-modal">
            <div class="chapter-list-header">
                <h3>目录 (${this.currentChapters.length}章)</h3>
                <button class="btn btn-small btn-secondary" onclick="app.showReader()">返回阅读</button>
            </div>
            <div class="chapter-list-content">
    `;
    
    for (let i = 0; i < this.currentChapters.length; i++) {
        const chapter = this.currentChapters[i];
        const isCurrent = i === currentIndex;
        
        html += `
            <div class="chapter-item ${isCurrent ? 'current' : ''}" onclick="app.goToChapter(${i})">
                <span class="chapter-num">${i + 1}.</span>
                <span class="chapter-name">${this.escapeHtml(chapter.title)}</span>
                ${isCurrent ? '<span class="current-mark">当前</span>' : ''}
            </div>
        `;
    }
    
    html += '</div></div>';
    modalContent.innerHTML = html;
};

App.prototype.showReaderSettings = function() {
    const modalContent = document.getElementById('bookModalContent');
    const settings = this.readerManager.settings;
    
    modalContent.innerHTML = `
        <div class="reader-settings">
            <h3>阅读设置</h3>
            
            <div class="setting-item">
                <label>字体大小: <span id="fontSizeValue">${settings.fontSize}px</span></label>
                <input type="range" id="fontSize" min="12" max="32" value="${settings.fontSize}" 
                       onchange="app.updateReaderSetting('fontSize', this.value)">
            </div>
            
            <div class="setting-item">
                <label>行高: <span id="lineHeightValue">${settings.lineHeight}</span></label>
                <input type="range" id="lineHeight" min="1.2" max="3" step="0.1" value="${settings.lineHeight}"
                       onchange="app.updateReaderSetting('lineHeight', this.value)">
            </div>
            
            <div class="setting-item">
                <label>边距: <span id="paddingValue">${settings.padding}px</span></label>
                <input type="range" id="padding" min="5" max="50" value="${settings.padding}"
                       onchange="app.updateReaderSetting('padding', this.value)">
            </div>
            
            <div class="setting-item">
                <label>主题</label>
                <div class="theme-options">
                    <button class="theme-btn ${settings.theme === 'dark' ? 'active' : ''}" 
                            onclick="app.updateReaderSetting('theme', 'dark')" 
                            style="background: #1a1a2e; color: #fff;">深色</button>
                    <button class="theme-btn ${settings.theme === 'light' ? 'active' : ''}" 
                            onclick="app.updateReaderSetting('theme', 'light')"
                            style="background: #fff; color: #333;">浅色</button>
                    <button class="theme-btn ${settings.theme === 'sepia' ? 'active' : ''}" 
                            onclick="app.updateReaderSetting('theme', 'sepia')"
                            style="background: #f4ecd8; color: #5c4b37;">护眼</button>
                    <button class="theme-btn ${settings.theme === 'green' ? 'active' : ''}" 
                            onclick="app.updateReaderSetting('theme', 'green')"
                            style="background: #cce8cf; color: #2d4a2e;">绿色</button>
                </div>
            </div>
            
            <div class="setting-item">
                <label>字体</label>
                <div class="font-options">
                    <button class="font-btn ${settings.fontFamily === 'serif' ? 'active' : ''}" 
                            onclick="app.updateReaderSetting('fontFamily', 'serif')">宋体</button>
                    <button class="font-btn ${settings.fontFamily === 'sans-serif' ? 'active' : ''}" 
                            onclick="app.updateReaderSetting('fontFamily', 'sans-serif')">黑体</button>
                </div>
            </div>
            
            <div class="setting-actions">
                <button class="btn btn-secondary" onclick="app.showReader()">返回阅读</button>
            </div>
        </div>
    `;
};

App.prototype.updateReaderSetting = function(key, value) {
    this.readerManager.updateSetting({ [key]: value });
    
    const valueSpan = document.getElementById(key + 'Value');
    if (valueSpan) {
        valueSpan.textContent = value + (key === 'lineHeight' ? '' : 'px');
    }
    
    this.showReader();
};

App.prototype.toggleReaderNav = function() {
    const nav = document.getElementById('readerNav');
    if (nav) {
        nav.classList.toggle('show');
    }
};

App.prototype.handleReaderKeydown = function(e) {
    if (!app.readerManager) return;
    
    switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
            app.prevChapter();
            break;
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
            e.preventDefault();
            app.nextChapter();
            break;
        case 'Escape':
            app.closeReader();
            break;
    }
};

App.prototype.closeReader = function() {
    document.removeEventListener('keydown', this.handleReaderKeydown);
    this.closeModal();
};

App.prototype.formatContent = function(content) {
    if (!content) return '';
    const paragraphs = content.split(/\n+/).filter(p => p.trim());
    return paragraphs.map(p => `<p>${this.escapeHtml(p.trim())}</p>`).join('');
};

// ==================== 调试功能 ====================

/**
 * 调试章节内容
 */
App.prototype.debugChapter = async function() {
    if (!this.currentBook || !this.currentSource) return;
    
    const modalContent = document.getElementById('bookModalContent');
    modalContent.innerHTML = '<div class="loading">加载章节进行调试...</div>';
    
    try {
        // 获取目录
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
        }
        
        this.currentChapters = HtmlParser.parseChapterList(
            data.html, 
            this.currentSource.ruleToc, 
            data.baseUrl
        );
        
        if (this.currentChapters.length === 0) {
            throw new Error('没有找到章节');
        }
        
        // 调试第一章
        const chapter = this.currentChapters[0];
        
        const response = await fetch('/api/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chapterUrl: chapter.url,
                debug: true
            })
        });
        
        const contentData = await response.json();
        
        if (!contentData.success) {
            throw new Error(contentData.error || '获取内容失败');
        }
        
        // 解析内容
        const parseResult = HtmlParser.parseContent(
            contentData.html,
            this.currentSource.ruleContent,
            contentData.baseUrl
        );
        
        // 显示调试信息
        this.showDebugChapter(chapter, contentData, parseResult);
        
    } catch (e) {
        console.error('调试失败:', e);
        modalContent.innerHTML = `<div class="error">调试失败: ${e.message}</div>`;
    }
};

/**
 * 显示调试结果
 */
App.prototype.showDebugChapter = function(chapter, contentData, parseResult) {
    const modalContent = document.getElementById('bookModalContent');
    
    let html = `
        <div class="debug-chapter">
            <h3>🔍 章节调试</h3>
            
            <div class="debug-section">
                <h4>章节信息</h4>
                <p>标题: ${this.escapeHtml(chapter.title)}</p>
                <p>URL: <code>${this.escapeHtml(chapter.url)}</code></p>
            </div>
            
            <div class="debug-section">
                <h4>请求信息</h4>
                <p>HTML长度: ${contentData.contentLength} 字符</p>
                <p>实际URL: <code>${this.escapeHtml(contentData.baseUrl)}</code></p>
            </div>
            
            <div class="debug-section">
                <h4>解析规则</h4>
                <p>内容选择器: <code>${this.escapeHtml(this.currentSource.ruleContent?.content || '未设置')}</code></p>
            </div>
            
            <div class="debug-section">
                <h4>解析结果</h4>
                <p>状态: ${parseResult.success ? '<span class="success">✓ 成功</span>' : '<span class="error">✗ 失败</span>'}</p>
                ${parseResult.error ? `<p class="error">错误: ${this.escapeHtml(parseResult.error)}</p>` : ''}
                <p>内容长度: ${parseResult.content?.length || 0} 字符</p>
                ${parseResult.debug ? `
                    <p>选择器: <code>${this.escapeHtml(parseResult.debug.selector || 'N/A')}</code></p>
                    <p>找到元素: ${parseResult.debug.found ? '是' : '否'}</p>
                    <p>原始长度: ${parseResult.debug.rawLength || 0} 字符</p>
                ` : ''}
            </div>
            
            <div class="debug-section">
                <h4>解析出的内容 (前500字)</h4>
                <div class="debug-content">
                    ${this.escapeHtml(parseResult.content?.substring(0, 500) || '(空)')}
                </div>
            </div>
            
            <div class="debug-section">
                <h4>原始HTML (前1000字)</h4>
                <div class="debug-html">
                    ${this.escapeHtml(contentData.html?.substring(0, 1000) || '(空)')}
                </div>
            </div>
            
            <div class="debug-actions">
                <button class="btn btn-secondary" onclick="app.showBookDetail(app.currentBook)">返回</button>
                <button class="btn btn-primary" onclick="app.copyDebugInfo()">复制调试信息</button>
            </div>
        </div>
    `;
    
    modalContent.innerHTML = html;
    
    // 保存调试数据
    this.lastDebugData = {
        chapter: chapter,
        contentData: contentData,
        parseResult: parseResult,
        rule: this.currentSource.ruleContent
    };
};

/**
 * 复制调试信息
 */
App.prototype.copyDebugInfo = function() {
    if (!this.lastDebugData) return;
    
    const d = this.lastDebugData;
    const info = `
章节调试信息
=============

章节: ${d.chapter.title}
URL: ${d.chapter.url}

规则: ${JSON.stringify(d.rule, null, 2)}

解析结果:
- 成功: ${d.parseResult.success}
- 错误: ${d.parseResult.error || '无'}
- 内容长度: ${d.parseResult.content?.length || 0}

调试信息:
${JSON.stringify(d.parseResult.debug, null, 2)}

内容预览 (前500字):
${d.parseResult.content?.substring(0, 500) || '(空)'}

HTML预览 (前1000字):
${d.contentData.html?.substring(0, 1000) || '(空)'}
`.trim();
    
    navigator.clipboard.writeText(info).then(() => {
        this.showToast('已复制到剪贴板');
    }).catch(() => {
        this.showToast('复制失败', true);
    });
};
