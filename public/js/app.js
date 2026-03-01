/**
 * 主应用模块 - 完整优化版
 */

class App {
    constructor() {
        this.sourceManager = new BookSourceManager();
        this.subscribeManager = new SubscribeManager();
        this.cacheManager = new CacheManager();
        this.invalidSourceManager = new InvalidSourceManager();
        
        this.currentTab = 'search';
        this.searchResults = [];
        this.currentBook = null;
        this.currentSource = null;
        this.currentChapters = [];
        this.downloadContent = '';
        this.isDownloading = false;
        this.downloadAborted = false;
        
        this.config = {
            searchConcurrent: 10,
            downloadConcurrent: 10,
            searchTimeout: 30000,
            retryCount: 2,           // 重试次数
            retryDelay: 1000,        // 重试延迟
            cacheExpire: 3600000,    // 缓存过期时间
            skipInvalidSource: true  // 跳过失效书源
        };
    }
    
    async init() {
        await this.sourceManager.init();
        await this.subscribeManager.init();
        
        this.bindEvents();
        this.render();
        this.updateStats();
        this.renderInvalidSources();
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
    
    /**
     * 搜索 - 带缓存和失效书源跳过
     */
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
        
        // 跳过失效书源
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
                        { 
                            bookSourceUrl: result.source, 
                            bookSourceName: result.sourceName 
                        }
                    );
                    
                    if (books.length > 0) {
                        allBooks.push(...books);
                        // 标记书源有效
                        this.invalidSourceManager.remove(result.source);
                    }
                } else {
                    // 标记书源失效
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
    
    /**
     * 带重试的请求
     */
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
    
    /**
     * 延迟函数
     */
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
            html += `
                <div class="book-item" onclick="app.showBookDetail('${this.escapeAttr(book.bookUrl)}', '${this.escapeAttr(book.origin)}')">
                    <div class="book-cover">
                        ${book.coverUrl ? `<img src="${book.coverUrl}" onerror="this.style.display='none'">` : ''}
                    </div>
                    <div class="book-info">
                        <h3>${this.escapeHtml(book.name)}</h3>
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
     * 显示书籍详情 - 带缓存
     */
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
            // 检查缓存
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
                
                // 缓存结果
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
                    </div>
                </div>
                
                <div class="book-intro">
                    <h3>简介</h3>
                    <p>${this.escapeHtml(book.intro || '暂无简介')}</p>
                </div>
                
                <div class="book-actions">
                    <button class="btn btn-primary" onclick="app.getChaptersAndDownload()">
                        开始下载
                    </button>
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
    
    /**
     * 换源功能
     */
    async showChangeSource() {
        if (!this.currentBook) return;
        
        const modalContent = document.getElementById('bookModalContent');
        modalContent.innerHTML = '<div class="loading">搜索其他书源...</div>';
        
        try {
            // 搜索同名书籍
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
            
            // 过滤同名同作者
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
    
    /**
     * 渲染换源列表
     */
    renderChangeSourceList(books) {
        const modalContent = document.getElementById('bookModalContent');
        
        let html = `
            <div class="change-source">
                <h3>选择其他来源 (${books.length})</h3>
                <div class="source-list">
        `;
        
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
    
    /**
     * 切换书源
     */
    async changeSource(bookUrl, origin) {
        this.currentSource = this.sourceManager.getSource(origin);
        this.currentBook = { ...this.currentBook, bookUrl: bookUrl, origin: origin };
        
        this.showToast('已切换书源');
        this.renderBookDetail(this.currentBook);
    }
    
    /**
     * 获取目录并下载
     */
    async getChaptersAndDownload() {
        if (!this.currentBook || !this.currentSource) return;
        
        const modalContent = document.getElementById('bookModalContent');
        modalContent.innerHTML = '<div class="loading">获取目录中...</div>';
        
        try {
            // 检查缓存
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
            
            this.startDownload();
            
        } catch (e) {
            console.error('获取目录失败:', e);
            modalContent.innerHTML = `<div class="error">获取目录失败: ${e.message}</div>`;
        }
    }
    
    /**
     * 并发下载 - 带缓存
     */
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
            
            // 检查缓存
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
                        
                        // 缓存内容
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
        
        // 分批并发下载
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
    
    async handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const result = await this.sourceManager.importSources(text);
            
            this.showToast(`导入成功: 新增 ${result.added} 个，更新 ${result.updated} 个`);
            this.updateStats();
            this.renderSourceList();
            
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
                        <span class="source-name">${this.escapeHtml(source.bookSourceName)}${isInvalid ? ' (失效)' : ''}</span>
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
            this.updateStats();
        }
    }
    
    removeSource(url) {
        if (confirm('确定删除此书源？')) {
            this.sourceManager.removeSource(url);
            this.invalidSourceManager.remove(url);
            this.renderSourceList();
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
    }
    
    /**
     * 渲染失效书源列表
     */
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
    
    /**
     * 清除失效书源标记
     */
    clearInvalidSources() {
        this.invalidSourceManager.clear();
        this.renderInvalidSources();
        this.renderSourceList();
        this.showToast('已清除失效标记');
    }
    
    render() {
        this.renderSourceList();
        this.renderInvalidSources();
        
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
