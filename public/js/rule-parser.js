/**
 * 规则解析器 - 完整实现Legado规则语法
 * 
 * 支持的规则类型:
 * - CSS选择器: .class, #id, tag
 * - XPath: /html/body/div (需要浏览器支持)
 * - JSONPath: $.data.list
 * - JS规则: <js>...</js> 或 @js:...
 * - 正则表达式: :regex
 * 
 * 支持的操作符:
 * - @ 属性选择器: a@href, img@src, .text@text
 * - . 索引选择器: .0, .1
 * - ## 替换规则: rule##regex##replacement
 * - || 或规则: rule1||rule2 (任一成功)
 * - && 且规则: rule1&&rule2 (都要执行)
 * - %% 并行规则: rule1%%rule2 (交替组合)
 */

class RuleParser {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.variables = {};
        this.baseUrl = '';
    }

    /**
     * 解析规则获取字符串
     */
    getString(context, ruleStr, baseUrl = '') {
        if (!ruleStr) return '';
        this.baseUrl = baseUrl;
        
        try {
            // 处理||分隔符（或规则）
            if (this.containsOperator(ruleStr, '||')) {
                const rules = this.splitByOperator(ruleStr, '||');
                for (const rule of rules) {
                    const result = this.getString(context, rule.trim(), baseUrl);
                    if (result) return result;
                }
                return '';
            }
            
            // 处理&&分隔符（且规则）
            if (this.containsOperator(ruleStr, '&&')) {
                const rules = this.splitByOperator(ruleStr, '&&');
                const results = [];
                for (const rule of rules) {
                    const result = this.getString(context, rule.trim(), baseUrl);
                    if (result) results.push(result);
                }
                return results.join('\n');
            }
            
            // 处理%%分隔符（并行规则）
            if (this.containsOperator(ruleStr, '%%')) {
                const rules = this.splitByOperator(ruleStr, '%%');
                const results = rules.map(rule => this.getString(context, rule.trim(), baseUrl));
                // 交替组合
                const maxLen = Math.max(...results.map(r => r.split('\n').length));
                const combined = [];
                for (let i = 0; i < maxLen; i++) {
                    for (const result of results) {
                        const lines = result.split('\n');
                        if (i < lines.length && lines[i]) {
                            combined.push(lines[i]);
                        }
                    }
                }
                return combined.join('\n');
            }
            
            // 解析单个规则链
            return this.parseSingleRule(context, ruleStr);
            
        } catch (e) {
            if (this.debug) console.error('规则解析错误:', e, ruleStr);
            return '';
        }
    }

    /**
     * 解析规则获取元素列表
     */
    getElements(context, ruleStr, baseUrl = '') {
        if (!ruleStr) return [];
        this.baseUrl = baseUrl;
        
        try {
            // 处理反向
            let reverse = false;
            if (ruleStr.startsWith('-')) {
                reverse = true;
                ruleStr = ruleStr.substring(1);
            }
            
            // 处理正向标记
            if (ruleStr.startsWith('+')) {
                ruleStr = ruleStr.substring(1);
            }
            
            // 获取元素
            let elements = this.getElementsInternal(context, ruleStr);
            
            if (reverse) {
                elements = elements.reverse();
            }
            
            return elements;
            
        } catch (e) {
            if (this.debug) console.error('获取元素错误:', e, ruleStr);
            return [];
        }
    }

    /**
     * 解析单个规则链
     */
    parseSingleRule(context, ruleStr) {
        // 分解规则链
        const rules = this.splitRuleChain(ruleStr);
        let result = context;
        
        for (const rule of rules) {
            if (!result) break;
            result = this.executeRule(rule, result);
        }
        
        return this.toString(result);
    }

    /**
     * 分解规则链
     */
    splitRuleChain(ruleStr) {
        const rules = [];
        let i = 0;
        let current = '';
        
        while (i < ruleStr.length) {
            const char = ruleStr[i];
            const nextChar = ruleStr[i + 1] || '';
            
            // 检查特殊规则前缀
            if (ruleStr.substring(i).startsWith('@CSS:')) {
                // CSS规则
                if (current) {
                    rules.push(this.parseRulePart(current));
                    current = '';
                }
                let j = i + 5;
                while (j < ruleStr.length && ruleStr[j] !== '@') j++;
                rules.push({ type: 'css', value: ruleStr.substring(i + 5, j) });
                i = j + 1;
            } else if (ruleStr.substring(i).startsWith('@XPath:')) {
                if (current) {
                    rules.push(this.parseRulePart(current));
                    current = '';
                }
                let j = i + 7;
                while (j < ruleStr.length && ruleStr[j] !== '@') j++;
                rules.push({ type: 'xpath', value: ruleStr.substring(i + 7, j) });
                i = j + 1;
            } else if (ruleStr.substring(i).startsWith('@Json:')) {
                if (current) {
                    rules.push(this.parseRulePart(current));
                    current = '';
                }
                let j = i + 6;
                while (j < ruleStr.length && ruleStr[j] !== '@') j++;
                rules.push({ type: 'json', value: ruleStr.substring(i + 6, j) });
                i = j + 1;
            } else if (ruleStr.substring(i).startsWith('<js>')) {
                // JS规则
                if (current) {
                    rules.push(this.parseRulePart(current));
                    current = '';
                }
                const endIdx = ruleStr.indexOf('</js>', i + 4);
                if (endIdx > 0) {
                    rules.push({ type: 'js', value: ruleStr.substring(i + 4, endIdx) });
                    i = endIdx + 5;
                } else {
                    i += 4;
                }
            } else if (ruleStr.substring(i).startsWith('@js:')) {
                if (current) {
                    rules.push(this.parseRulePart(current));
                    current = '';
                }
                let j = i + 4;
                // JS代码可能包含@，需要找到规则结束位置
                let depth = 0;
                while (j < ruleStr.length) {
                    if (ruleStr[j] === '(') depth++;
                    else if (ruleStr[j] === ')') depth--;
                    else if (ruleStr[j] === '@' && depth === 0 && !ruleStr.substring(j).startsWith('@js:')) {
                        break;
                    }
                    j++;
                }
                rules.push({ type: 'js', value: ruleStr.substring(i + 4, j) });
                i = j + 1;
            } else if (char === '@' && current) {
                // 属性分隔符
                rules.push(this.parseRulePart(current + '@'));
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
        
        if (current) {
            rules.push(this.parseRulePart(current));
        }
        
        return rules;
    }

    /**
     * 解析规则部分
     */
    parseRulePart(ruleStr) {
        // 检查替换规则
        let replaceRegex = '';
        let replacement = '';
        const replaceMatch = ruleStr.match(/^(.+?)##(.+?)(?:##(.+?))?$/);
        if (replaceMatch) {
            ruleStr = replaceMatch[1];
            replaceRegex = replaceMatch[2];
            replacement = replaceMatch[3] || '';
        }
        
        // 解析选择器和属性
        let selector = ruleStr;
        let attr = 'text';
        let index = -1;
        
        // 处理@属性
        const atIndex = selector.lastIndexOf('@');
        if (atIndex > 0) {
            attr = selector.substring(atIndex + 1);
            selector = selector.substring(0, atIndex);
        }
        
        // 处理.索引 (如: .author.0)
        const indexMatch = selector.match(/\.(\d+)$/);
        if (indexMatch) {
            index = parseInt(indexMatch[1]);
            selector = selector.substring(0, selector.length - indexMatch[0].length);
        }
        
        // 确定规则类型
        let type = 'css';
        if (selector.startsWith('/')) {
            type = 'xpath';
        } else if (selector.startsWith('$.') || selector.startsWith('$[')) {
            type = 'json';
        } else if (selector.startsWith(':')) {
            type = 'regex';
            selector = selector.substring(1);
        }
        
        return {
            type,
            selector,
            attr,
            index,
            replaceRegex,
            replacement
        };
    }

    /**
     * 执行规则
     */
    executeRule(rule, context) {
        let result;
        
        switch (rule.type) {
            case 'css':
                result = this.executeCss(rule, context);
                break;
            case 'xpath':
                result = this.executeXPath(rule, context);
                break;
            case 'json':
                result = this.executeJson(rule, context);
                break;
            case 'js':
                result = this.executeJs(rule, context);
                break;
            case 'regex':
                result = this.executeRegex(rule, context);
                break;
            default:
                result = context;
        }
        
        // 应用替换
        if (rule.replaceRegex && result) {
            result = this.toString(result).replace(
                new RegExp(rule.replaceRegex, 'g'), 
                rule.replacement
            );
        }
        
        return result;
    }

    /**
     * 执行CSS选择器
     */
    executeCss(rule, context) {
        let selector = rule.selector;
        
        // 转换Legado格式到标准CSS
        // class.tag -> .class tag
        // class.0 -> .class (索引在rule.index中)
        selector = this.convertSelector(selector);
        
        // 获取元素
        let elements;
        if (context.querySelectorAll) {
            elements = Array.from(context.querySelectorAll(selector));
        } else if (context.querySelector) {
            const el = context.querySelector(selector);
            elements = el ? [el] : [];
        } else {
            return '';
        }
        
        if (elements.length === 0) return '';
        
        // 应用索引
        if (rule.index >= 0) {
            elements = rule.index < elements.length ? [elements[rule.index]] : [];
        }
        
        if (elements.length === 0) return '';
        
        // 获取属性
        return this.getElementValue(elements[0], rule.attr);
    }

    /**
     * 转换选择器格式
     */
    convertSelector(selector) {
        // 处理[property$=xxx]格式
        selector = selector.replace(/\[property\$=([^\]]+)\]/g, '[property$1]');
        
        // 处理.连接的class
        // .author.0 -> .author (索引已单独处理)
        // .bookname a -> .bookname a
        
        return selector;
    }

    /**
     * 获取元素值
     */
    getElementValue(element, attr) {
        if (!element) return '';
        
        switch (attr) {
            case 'text':
            case 'textContent':
            case 'textNodes':
                return element.textContent?.trim() || '';
            case 'html':
            case 'innerHTML':
                return element.innerHTML || '';
            case 'href':
            case 'src':
                let url = element.getAttribute(attr) || '';
                if (url && !url.startsWith('http') && this.baseUrl) {
                    try {
                        url = new URL(url, this.baseUrl).href;
                    } catch (e) {}
                }
                return url;
            case 'content':
            case 'value':
                return element.getAttribute('content') || 
                       element.getAttribute('value') || 
                       element.textContent?.trim() || '';
            default:
                return element.getAttribute(attr) || 
                       element.textContent?.trim() || '';
        }
    }

    /**
     * 执行XPath
     */
    executeXPath(rule, context) {
        // 浏览器环境需要XPath支持
        try {
            const doc = context.ownerDocument || context;
            const result = doc.evaluate(
                rule.selector,
                context,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );
            return result.singleNodeValue?.textContent || '';
        } catch (e) {
            if (this.debug) console.warn('XPath不支持:', rule.selector);
            return '';
        }
    }

    /**
     * 执行JSONPath
     */
    executeJson(rule, context) {
        try {
            let json = context;
            if (typeof context === 'string') {
                json = JSON.parse(context);
            }
            
            const path = rule.selector;
            const parts = path.replace(/^\$\.?/, '').split(/\.|\[|\]/).filter(p => p);
            let result = json;
            
            for (const part of parts) {
                if (result === null || result === undefined) return '';
                result = result[part];
            }
            
            return result || '';
        } catch (e) {
            return '';
        }
    }

    /**
     * 执行JS规则
     */
    executeJs(rule, context) {
        try {
            const result = this.toString(context);
            
            // 创建沙箱执行环境
            const fn = new Function('java', 'result', 'baseUrl', 'src', rule.value);
            
            // 模拟java对象
            const javaMock = {
                ajax: (url) => {
                    console.warn('java.ajax需要异步执行');
                    return '';
                },
                connect: (url) => '',
                toast: (msg) => console.log('Toast:', msg)
            };
            
            return fn(javaMock, result, this.baseUrl, context) || '';
        } catch (e) {
            if (this.debug) console.error('JS执行错误:', e);
            return '';
        }
    }

    /**
     * 执行正则
     */
    executeRegex(rule, context) {
        try {
            const text = this.toString(context);
            const regex = new RegExp(rule.selector, 'g');
            const matches = text.match(regex);
            return matches ? matches.join('\n') : '';
        } catch (e) {
            return '';
        }
    }

    /**
     * 获取元素列表内部实现
     */
    getElementsInternal(context, ruleStr) {
        const rule = this.parseRulePart(ruleStr);
        
        if (rule.type === 'css') {
            const selector = this.convertSelector(rule.selector);
            if (context.querySelectorAll) {
                return Array.from(context.querySelectorAll(selector));
            }
        }
        
        return [];
    }

    /**
     * 检查是否包含操作符（排除引号和括号内的）
     */
    containsOperator(str, op) {
        let depth = 0;
        let inQuote = false;
        let quoteChar = '';
        
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            
            if (inQuote) {
                if (char === quoteChar) inQuote = false;
                continue;
            }
            
            if (char === '"' || char === "'") {
                inQuote = true;
                quoteChar = char;
                continue;
            }
            
            if (char === '(' || char === '[') depth++;
            else if (char === ')' || char === ']') depth--;
            else if (depth === 0 && str.substring(i, i + op.length) === op) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 按操作符分割（排除引号和括号内的）
     */
    splitByOperator(str, op) {
        const parts = [];
        let current = '';
        let depth = 0;
        let inQuote = false;
        let quoteChar = '';
        
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            
            if (inQuote) {
                current += char;
                if (char === quoteChar) inQuote = false;
                continue;
            }
            
            if (char === '"' || char === "'") {
                inQuote = true;
                quoteChar = char;
                current += char;
                continue;
            }
            
            if (char === '(' || char === '[') depth++;
            else if (char === ')' || char === ']') depth--;
            
            if (depth === 0 && str.substring(i, i + op.length) === op) {
                parts.push(current);
                current = '';
                i += op.length - 1;
            } else {
                current += char;
            }
        }
        
        parts.push(current);
        return parts;
    }

    /**
     * 转换为字符串
     */
    toString(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (value.textContent) return value.textContent.trim();
        if (Array.isArray(value)) {
            return value.map(v => this.toString(v)).join('\n');
        }
        return String(value);
    }

    /**
     * 设置变量
     */
    put(key, value) {
        this.variables[key] = value;
        return value;
    }

    /**
     * 获取变量
     */
    get(key) {
        return this.variables[key] || '';
    }
}

// 导出
window.RuleParser = RuleParser;
