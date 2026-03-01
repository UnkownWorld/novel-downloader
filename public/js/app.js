/**
 * 主应用模块 - 重写版
 * 后端获取HTML，前端解析
 */

class App {
    constructor() {
        this.sourceManager = new BookSourceManager();
        this.subscribeManager = new SubscribeManager();
        
        // 状态
        this.currentTab = 'search';
        this.searchResults = [];
        this.currentBook = null;
        this.currentSource = null;
        this.currentChapters = [];
        this.downloadContent = '';
        
        // 配置
        this.config = {
            searchConcurrent: 10,
            searchTimeout: 30000,
            downloadConcurrent: 5
        };
    }
    
    /**
     * 初始化
     */
    async init() {
        await this.sourceManager.init();
        await this.subscribeManager.init();
        
        this.bindEvents();
        this.render();
        this.updateStats();
        
        console.log('App initialized');
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 标签切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // 搜索
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
        
        // 导入书源
        const importInput = document.getElementById('importInput');
        if (importInput) {
            importInput.addEventListener('change', (e) => this.handleImportFile(e));
        }
    }
    
    /**
     * 切换标签
     */
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
     * 搜索
     */
    async search() {
        const keyword = document.getElementById('searchInput')?.value?.trim();
        
        if (!keyword) {
            this.showToast('请输入搜索关键词', true);
            return;
        }
        
        const sources = this.sourceManager.getEnabledSources();
        
        if (sources.length === 0) {
            this.showToast('没有可用的书源，请先导入书源', true);
            this.switchTab('sources');
            return;
        }
        
        // 显示搜索中状态
        const searchBtn = document.getElementById('searchBtn');
        const originalText = searchBtn.textContent;
        searchBtn.textContent = '搜索中...';
        searchBtn.disabled = true;
        
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = '<div class="loading">正在搜索...</div>';
        
        try {
            // 调用搜索API获取HTML
            const response = await fetch('/api/search', {
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
            
            // 在前端解析HTML
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
                    allBooks.push(...books);
                }
            }
            
            // 合并去重
            this.searchResults = this.mergeResults(allBooks, keyword);
            
            this.renderSearchResults(this.searchResults);
            this.showToast(`找到 ${this.searchResults.length} 个结果`);
            
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
     * 合并搜索结果
     */
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
        
        // 排序
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
    
    /**
     * 渲染搜索结果
     */
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
                        ${book.intro ? `<div class="intro">${this.escapeHtml(book.intro)}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        resultsDiv.innerHTML = html;
    }
    
    /**
     * 显示书籍详情
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
            // 获取书籍页面HTML
            const response = await fetch('/api/book-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookUrl: bookUrl })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '获取失败');
            }
            
            // 在前端解析
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
    
    /**
     * 渲染书籍详情
     */
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
                    <button class="btn btn-secondary" onclick="app.closeModal()">
                        关闭
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * 获取目录并下载
     */
    async getChaptersAndDownload() {
        if (!this.currentBook || !this.currentSource) return;
        
        const modalContent = document.getElementById('bookModalContent');
        modalContent.innerHTML = '<div class="loading">获取目录中...</div>';
        
        try {
            // 获取目录页面HTML
            const response = await fetch('/api/chapters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    tocUrl: this.currentBook.tocUrl || this.currentBook.bookUrl 
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '获取目录失败');
            }
            
            // 在前端解析
            this.currentChapters = HtmlParser.parseChapterList(
                data.html, 
                this.currentSource.ruleToc, 
                data.baseUrl
            );
            
            if (this.currentChapters.length === 0) {
                throw new Error('解析目录失败，没有找到章节');
            }
            
            // 开始下载
            this.startDownload();
            
        } catch (e) {
            console.error('获取目录失败:', e);
            modalContent.innerHTML = `<div class="error">获取目录失败: ${e.message}</div>`;
        }
    }
    
    /**
     * 开始下载
     */
    async startDownload() {
        const modalContent = document.getElementById('bookModalContent');
        const total = this.currentChapters.length;
        
        modalContent.innerHTML = `
            <div class="download-progress">
                <h3>下载中...</h3>
                <div class="progress-bar">
                    <div class="progress-fill" id="downloadProgressFill" style="width: 0%"></div>
                </div>
                <div class="progress-text" id="downloadProgressText">0 / ${total}</div>
            </div>
        `;
        
        const content = [];
        content.push(`${this.currentBook.name}`);
        content.push(`作者: ${this.currentBook.author || '未知'}`);
        content.push(`来源: ${this.currentSource.bookSourceName}`);
        content.push('');
        content.push('='.repeat(50));
        content.push('');
        
        for (let i = 0; i < total; i++) {
            const chapter = this.currentChapters[i];
            
            try {
                // 获取章节内容
                const response = await fetch('/api/content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chapterUrl: chapter.url })
                });
                
                const data = await response.json();
                
                if (data.success && data.html) {
                    const chapterContent = HtmlParser.parseContent(
                        data.html, 
                        this.currentSource.ruleContent, 
                        data.baseUrl
                    );
                    
                    content.push(`\n\n第${i + 1}章 ${chapter.title}\n\n${chapterContent}`);
                }
                
            } catch (e) {
                console.error('下载章节失败:', e);
                content.push(`\n\n第${i + 1}章 ${chapter.title}\n\n[下载失败]`);
            }
            
            // 更新进度
            const progress = ((i + 1) / total * 100).toFixed(1);
            const progressFill = document.getElementById('downloadProgressFill');
            const progressText = document.getElementById('downloadProgressText');
            
            if (progressFill) progressFill.style.width = progress + '%';
            if (progressText) progressText.textContent = `${i + 1} / ${total}`;
        }
        
        // 下载完成
        this.downloadContent = content.join('');
        this.downloadComplete();
    }
    
    /**
     * 下载完成
     */
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
    
    /**
     * 保存到文件
     */
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
    
    /**
     * 复制到剪贴板
     */
    async copyToClipboard() {
        if (!this.downloadContent) return;
        
        try {
            await navigator.clipboard.writeText(this.downloadContent);
            this.showToast('已复制到剪贴板');
        } catch (e) {
            this.showToast('复制失败', true);
        }
    }
    
    /**
     * 关闭模态框
     */
    closeModal() {
        document.getElementById('bookModal')?.classList.remove('active');
    }
    
    /**
     * 处理导入文件
     */
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
    
    /**
     * 从URL导入书源
     */
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
    
    /**
     * 导出书源
     */
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
    
    /**
     * 测试书源
     */
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
                
                // 获取搜索页面
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
                    // 解析结果
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
    
    /**
     * 渲染测试结果
     */
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
    
    /**
     * 渲染书源列表
     */
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
            html += `
                <div class="source-item ${source.enabled ? '' : 'disabled'}">
                    <div class="source-info">
                        <span class="source-name">${this.escapeHtml(source.bookSourceName)}</span>
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
    
    /**
     * 切换书源状态
     */
    toggleSource(url) {
        const source = this.sourceManager.getSource(url);
        if (source) {
            this.sourceManager.setSourceEnabled(url, !source.enabled);
            this.renderSourceList();
            this.updateStats();
        }
    }
    
    /**
     * 删除书源
     */
    removeSource(url) {
        if (confirm('确定删除此书源？')) {
            this.sourceManager.removeSource(url);
            this.renderSourceList();
            this.updateStats();
            this.showToast('已删除书源');
        }
    }
    
    /**
     * 更新统计
     */
    updateStats() {
        const stats = this.sourceManager.getStats();
        
        const countEl = document.getElementById('sourceCount');
        if (countEl) {
            countEl.textContent = `${stats.enabled} / ${stats.total}`;
        }
    }
    
    /**
     * 渲染主界面
     */
    render() {
        this.renderSourceList();
        
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
    
    /**
     * 添加订阅
     */
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
    
    /**
     * 刷新订阅
     */
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
    
    /**
     * 删除订阅
     */
    removeSubscription(id) {
        if (confirm('确定删除此订阅？')) {
            this.subscribeManager.removeSubscription(id);
            this.render();
            this.showToast('已删除订阅');
        }
    }
    
    /**
     * 清除所有数据
     */
    clearAllData() {
        if (confirm('确定清除所有数据？此操作不可恢复！')) {
            localStorage.clear();
            location.reload();
        }
    }
    
    /**
     * 显示Toast
     */
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
    
    /**
     * HTML转义
     */
    escapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    /**
     * 属性转义
     */
    escapeAttr(str) {
        if (!str) return '';
        return str.toString()
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }
}

// 导出
window.App = App;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    app.init();
});
