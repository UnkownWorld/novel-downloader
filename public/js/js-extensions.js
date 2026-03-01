/**
 * JsExtensions模块 - 参考Legado实现
 * 提供JS规则中可用的扩展函数
 */

class JsExtensions {
    constructor(source) {
        this.source = source;
    }

    /**
     * AJAX请求
     */
    async ajax(url, options = {}) {
        try {
            const response = await fetch(url, {
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.body
            });
            return await response.text();
        } catch (e) {
            console.error('ajax错误:', e);
            return '';
        }
    }

    /**
     * 带超时的AJAX
     */
    async ajaxWithTimeout(url, timeout = 30000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return await response.text();
        } catch (e) {
            clearTimeout(timeoutId);
            return '';
        }
    }

    /**
     * POST请求
     */
    async post(url, body, headers = {}) {
        return this.ajax(url, {
            method: 'POST',
            body: body,
            headers: headers
        });
    }

    /**
     * JSON请求
     */
    async getJson(url) {
        const text = await this.ajax(url);
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    /**
     * 连接浏览器（模拟）
     */
    connect(url) {
        console.warn('java.connect不支持:', url);
        return { raw: () => ({ request: () => ({ url: () => url }) }) };
    }

    /**
     * Toast提示
     */
    toast(msg) {
        console.log('Toast:', msg);
        if (typeof window !== 'undefined' && window.App) {
            window.App.showToast(msg);
        }
    }

    /**
     * 获取源
     */
    getSource() {
        return this.source;
    }

    /**
     * 获取变量
     */
    getVariable(key) {
        if (!this.source) return '';
        return this.source.variableMap?.[key] || '';
    }

    /**
     * 设置变量
     */
    putVariable(key, value) {
        if (!this.source) return;
        if (!this.source.variableMap) {
            this.source.variableMap = {};
        }
        this.source.variableMap[key] = value;
    }

    /**
     * 编码Base64
     */
    base64Encode(str) {
        try {
            return btoa(unescape(encodeURIComponent(str)));
        } catch (e) {
            return '';
        }
    }

    /**
     * 解码Base64
     */
    base64Decode(str) {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch (e) {
            return '';
        }
    }

    /**
     * MD5
     */
    md5(str) {
        // 需要引入MD5库
        console.warn('MD5需要引入相关库');
        return '';
    }

    /**
     * URL编码
     */
    urlEncode(str) {
        return encodeURIComponent(str);
    }

    /**
     * URL解码
     */
    urlDecode(str) {
        return decodeURIComponent(str);
    }

    /**
     * 正则匹配
     */
    regex(pattern, str, group = 0) {
        try {
            const regex = new RegExp(pattern);
            const match = str.match(regex);
            return match ? match[group] || match[0] : '';
        } catch (e) {
            return '';
        }
    }

    /**
     * 正则匹配全部
     */
    regexAll(pattern, str) {
        try {
            const regex = new RegExp(pattern, 'g');
            return str.match(regex) || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * 字符串替换
     */
    replace(str, pattern, replacement) {
        return str.replace(new RegExp(pattern, 'g'), replacement);
    }

    /**
     * 字符串分割
     */
    split(str, separator) {
        return str.split(separator);
    }

    /**
     * JSON解析
     */
    parseJson(str) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    }

    /**
     * JSON字符串化
     */
    stringify(obj) {
        return JSON.stringify(obj);
    }

    /**
     * 获取当前时间
     */
    currentTimeMillis() {
        return Date.now();
    }

    /**
     * 格式化时间
     */
    formatDate(timestamp, format = 'yyyy-MM-dd HH:mm:ss') {
        const date = new Date(timestamp);
        const map = {
            'yyyy': date.getFullYear(),
            'MM': String(date.getMonth() + 1).padStart(2, '0'),
            'dd': String(date.getDate()).padStart(2, '0'),
            'HH': String(date.getHours()).padStart(2, '0'),
            'mm': String(date.getMinutes()).padStart(2, '0'),
            'ss': String(date.getSeconds()).padStart(2, '0')
        };
        
        let result = format;
        for (const [key, value] of Object.entries(map)) {
            result = result.replace(key, value);
        }
        return result;
    }
}

// 导出
window.JsExtensions = JsExtensions;
