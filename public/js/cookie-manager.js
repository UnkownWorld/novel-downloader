/**
 * CookieManager模块 - Cookie管理
 */

class CookieManager {
    constructor() {
        this.cookies = {};
        this.loadFromStorage();
    }

    /**
     * 从localStorage加载
     */
    loadFromStorage() {
        try {
            const data = localStorage.getItem('cookies');
            if (data) {
                this.cookies = JSON.parse(data);
            }
        } catch (e) {
            this.cookies = {};
        }
    }

    /**
     * 保存到localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('cookies', JSON.stringify(this.cookies));
        } catch (e) {
            console.error('保存Cookie失败:', e);
        }
    }

    /**
     * 获取Cookie
     */
    getCookie(url) {
        const domain = this.getDomain(url);
        return this.cookies[domain] || '';
    }

    /**
     * 设置Cookie
     */
    setCookie(url, cookie) {
        const domain = this.getDomain(url);
        this.cookies[domain] = cookie;
        this.saveToStorage();
    }

    /**
     * 添加Cookie
     */
    addCookie(url, cookie) {
        const domain = this.getDomain(url);
        const existing = this.cookies[domain] || '';
        if (existing) {
            this.cookies[domain] = existing + '; ' + cookie;
        } else {
            this.cookies[domain] = cookie;
        }
        this.saveToStorage();
    }

    /**
     * 删除Cookie
     */
    removeCookie(url) {
        const domain = this.getDomain(url);
        delete this.cookies[domain];
        this.saveToStorage();
    }

    /**
     * 清空所有Cookie
     */
    clearAll() {
        this.cookies = {};
        this.saveToStorage();
    }

    /**
     * 获取域名
     */
    getDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (e) {
            return url;
        }
    }

    /**
     * 解析Set-Cookie头
     */
    parseSetCookie(setCookieHeader) {
        const cookies = [];
        if (!setCookieHeader) return cookies;
        
        const parts = setCookieHeader.split(',');
        for (const part of parts) {
            const cookie = part.split(';')[0].trim();
            if (cookie) {
                cookies.push(cookie);
            }
        }
        
        return cookies;
    }

    /**
     * 合并Cookie
     */
    mergeCookies(existing, newCookies) {
        const cookieMap = {};
        
        // 解析现有Cookie
        if (existing) {
            for (const part of existing.split(';')) {
                const [name, ...valueParts] = part.trim().split('=');
                if (name) {
                    cookieMap[name.trim()] = valueParts.join('=').trim();
                }
            }
        }
        
        // 合并新Cookie
        for (const cookie of newCookies) {
            const [name, ...valueParts] = cookie.split('=');
            if (name) {
                cookieMap[name.trim()] = valueParts.join('=').trim();
            }
        }
        
        // 生成Cookie字符串
        return Object.entries(cookieMap)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }
}

// 创建全局实例
window.CookieManager = new CookieManager();
