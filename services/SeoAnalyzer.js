const axios = require('axios');
const cheerio = require('cheerio');
const { performance } = require('perf_hooks');
const { URL } = require('url');

class SeoAnalyzer {
    async analyzePage(url) {
        const startTime = performance.now();
        
        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const endTime = performance.now();
            const loadTime = endTime - startTime;

            return {
                technical: await this.analyzeTechnical($, url, response),
                content: await this.analyzeContent($),
                keywords: await this.analyzeKeywords($),
                performance: await this.analyzePerformance(url),
                mobile_friendly: this.analyzeMobileFriendliness($),
                optimization_suggestions: await this.generateOptimizationSuggestions()
            };
        } catch (error) {
            console.error('Error analyzing page:', error);
            throw error;
        }
    }

    async analyzeTechnical($, url, response) {
        const headers = response.headers;
        const htmlContent = $.html();
        const parsedUrl = new URL(url);

        return {
            meta: {
                title: $('title').text(),
                title_length: $('title').text().length,
                description: $('meta[name="description"]').attr('content'),
                description_length: $('meta[name="description"]').attr('content')?.length || 0,
                keywords: $('meta[name="keywords"]').attr('content'),
                viewport: $('meta[name="viewport"]').attr('content'),
                robots: $('meta[name="robots"]').attr('content'),
                canonical: this.analyzeCanonical($),
                duplicate_canonicals: $('link[rel="canonical"]').length > 1,
                og_tags: this.analyzeOpenGraph($),
                twitter_cards: this.analyzeTwitterCards($)
            },
            headings: this.analyzeHeadings($),
            images: this.analyzeImages($),
            links: await this.analyzeLinks($, url),
            structured_data: this.analyzeStructuredData($),
            hreflang_errors: this.checkHreflangErrors($),
            mixed_content: this.checkMixedContent($, parsedUrl),
            xml_sitemap: await this.checkXmlSitemap(parsedUrl),
            redirect_chains: await this.analyzeRedirectChains(url),
            ssl_security: this.analyzeSslSecurity(headers),
            gzip_compression: this.checkGzipCompression(headers),
            browser_caching: this.checkBrowserCaching(headers),
            minification: await this.analyzeMinification($, url),
            render_blocking_resources: this.analyzeRenderBlocking($),
            mobile_optimization: await this.analyzeMobileOptimization(url),
            page_speed_score: await this.analyzePageSpeed(url)
        };
    }

    analyzeCanonical($) {
        const canonical = $('link[rel="canonical"]').first().attr('href');
        const metaCanonical = $('meta[property="og:url"]').attr('content');
        return {
            url: canonical || metaCanonical,
            is_present: Boolean(canonical),
            matches_url: true, // You would compare with current URL
            multiple_detected: $('link[rel="canonical"]').length > 1
        };
    }

    async analyzeLinks($, baseUrl) {
        const links = [];
        const brokenLinks = [];
        
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push(href);
        });

        // Check for broken links (limited to internal links)
        for (const link of links) {
            try {
                if (link.startsWith('/') || link.includes(baseUrl)) {
                    const url = link.startsWith('/') ? `${baseUrl}${link}` : link;
                    const response = await axios.head(url);
                    if (response.status >= 400) brokenLinks.push(link);
                }
            } catch (error) {
                brokenLinks.push(link);
            }
        }

        return {
            total: links.length,
            internal: links.filter(l => l.startsWith('/') || l.includes(baseUrl)).length,
            external: links.filter(l => !l.startsWith('/') && !l.includes(baseUrl)).length,
            broken: brokenLinks.length,
            broken_links: brokenLinks
        };
    }

    analyzeImages($) {
        const images = $('img');
        const missingAlt = [];
        const largeImages = [];

        images.each((i, img) => {
            if (!$(img).attr('alt')) {
                missingAlt.push($(img).attr('src'));
            }
            // Check for large images (src attribute containing dimensions)
            const src = $(img).attr('src');
            if (src && src.match(/\d{4,}/)) {
                largeImages.push(src);
            }
        });

        return {
            total: images.length,
            missing_alt: missingAlt.length,
            missing_alt_list: missingAlt,
            large_images: largeImages.length,
            large_images_list: largeImages
        };
    }

    analyzeStructuredData($) {
        const structuredData = $('script[type="application/ld+json"]');
        const schemas = [];

        structuredData.each((i, el) => {
            try {
                const schema = JSON.parse($(el).html());
                schemas.push(schema['@type']);
            } catch (e) {
                console.error('Error parsing structured data:', e);
            }
        });

        return {
            present: structuredData.length > 0,
            types: schemas,
            count: structuredData.length
        };
    }

    checkHreflangErrors($) {
        const hreflangs = $('link[rel="alternate"][hreflang]');
        const errors = [];

        if (hreflangs.length > 0) {
            // Check for self-referencing hreflang
            const hasXDefault = hreflangs.filter((i, el) => $(el).attr('hreflang') === 'x-default').length > 0;
            if (!hasXDefault) {
                errors.push('Missing x-default hreflang');
            }

            // Check for reciprocal links
            // This would require checking other pages
        }

        return errors;
    }

    checkMixedContent($, parsedUrl) {
        const isHttps = parsedUrl.protocol === 'https:';
        const mixedContent = [];

        if (isHttps) {
            // Check scripts
            $('script[src^="http:"]').each((i, el) => {
                mixedContent.push($(el).attr('src'));
            });

            // Check styles
            $('link[rel="stylesheet"][href^="http:"]').each((i, el) => {
                mixedContent.push($(el).attr('href'));
            });

            // Check images
            $('img[src^="http:"]').each((i, el) => {
                mixedContent.push($(el).attr('src'));
            });
        }

        return {
            has_mixed_content: mixedContent.length > 0,
            mixed_content_resources: mixedContent
        };
    }

    async checkXmlSitemap(parsedUrl) {
        const commonSitemapPaths = [
            '/sitemap.xml',
            '/sitemap_index.xml',
            '/sitemap/',
            '/sitemap/sitemap.xml'
        ];

        for (const path of commonSitemapPaths) {
            try {
                const response = await axios.get(`${parsedUrl.origin}${path}`);
                if (response.status === 200 && response.data.includes('<?xml')) {
                    return {
                        found: true,
                        url: `${parsedUrl.origin}${path}`,
                        is_valid: true
                    };
                }
            } catch (error) {
                continue;
            }
        }

        return {
            found: false,
            url: null,
            is_valid: false
        };
    }

    async analyzeRedirectChains(url) {
        const redirects = [];
        let currentUrl = url;
        let chainLength = 0;

        while (chainLength < 10) { // Prevent infinite loops
            try {
                const response = await axios.head(currentUrl, { maxRedirects: 0 });
                break;
            } catch (error) {
                if (error.response && error.response.headers.location) {
                    redirects.push({
                        from: currentUrl,
                        to: error.response.headers.location,
                        status: error.response.status
                    });
                    currentUrl = error.response.headers.location;
                    chainLength++;
                } else {
                    break;
                }
            }
        }

        return {
            chain_length: chainLength,
            redirects: redirects
        };
    }

    analyzeSslSecurity(headers) {
        return {
            has_ssl: headers['strict-transport-security'] ? true : false,
            hsts: headers['strict-transport-security'] ? true : false,
            security_headers: {
                'x-frame-options': headers['x-frame-options'] || null,
                'x-content-type-options': headers['x-content-type-options'] || null,
                'x-xss-protection': headers['x-xss-protection'] || null
            }
        };
    }

    checkGzipCompression(headers) {
        return headers['content-encoding'] === 'gzip';
    }

    checkBrowserCaching(headers) {
        const cacheControl = headers['cache-control'];
        const expires = headers['expires'];
        
        return {
            has_caching: Boolean(cacheControl || expires),
            cache_control: cacheControl,
            expires: expires
        };
    }

    async analyzeMinification($, url) {
        const scripts = $('script[src]');
        const styles = $('link[rel="stylesheet"]');
        const needed = [];

        // Check file sizes and content for minification opportunities
        scripts.each((i, el) => {
            const src = $(el).attr('src');
            if (src && !src.includes('.min.js')) {
                needed.push(src);
            }
        });

        styles.each((i, el) => {
            const href = $(el).attr('href');
            if (href && !href.includes('.min.css')) {
                needed.push(href);
            }
        });

        return {
            needed: needed.length > 0,
            resources_to_minify: needed
        };
    }

    analyzeRenderBlocking($) {
        const renderBlocking = [];

        // Check for render-blocking resources in head
        $('head link[rel="stylesheet"]').each((i, el) => {
            renderBlocking.push($(el).attr('href'));
        });

        $('head script[src]').each((i, el) => {
            if (!$(el).attr('async') && !$(el).attr('defer')) {
                renderBlocking.push($(el).attr('src'));
            }
        });

        return renderBlocking.length;
    }

    async analyzeContent($) {
        const wordCount = $('body').text().trim().split(/\s+/).length;
        const paragraphs = $('p').length;
        const readingTime = Math.ceil(wordCount / 200); // Average reading speed of 200 words per minute

        // Analyze text-to-HTML ratio
        const textContent = $('body').text().trim().length;
        const htmlContent = $.html().length;
        const textToHtmlRatio = (textContent / htmlContent * 100).toFixed(2);

        // Check for thin content
        const isThinContent = wordCount < 300;

        // Analyze headings structure
        const headingsStructure = this.analyzeHeadings($);

        return {
            word_count: wordCount,
            paragraph_count: paragraphs,
            reading_time_minutes: readingTime,
            text_to_html_ratio: parseFloat(textToHtmlRatio),
            is_thin_content: isThinContent,
            headings_structure: headingsStructure
        };
    }

    async analyzeKeywords($) {
        const stopWords = ['null', 'undefined', 'div', 'className', 'class', 'span', 'function', 
            'const', 'let', 'var', 'return', 'static', 'chunks'];
        
        // Get text content while excluding script and style tags
        const content = $('body')
            .clone()
            .find('script, style, code, pre')
            .remove()
            .end()
            .text();

        // Split into words and clean up
        const words = content
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(word => 
                word.length > 2 && 
                !stopWords.includes(word) &&
                !/^\d+$/.test(word)  // Exclude pure numbers
            );

        // Count word frequencies
        const wordCount = {};
        words.forEach(word => {
            wordCount[word] = (wordCount[word] || 0) + 1;
        });

        // Calculate keyword density and sort by frequency
        const totalWords = words.length;
        const topKeywords = Object.entries(wordCount)
            .map(([word, count]) => ({
                keyword: word,
                count: count,
                density: ((count / totalWords) * 100).toFixed(2)
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            top_keywords: topKeywords,
            keyword_density: Object.fromEntries(
                topKeywords.map(k => [k.keyword, parseFloat(k.density)])
            ),
            total_words: totalWords
        };
    }

    async analyzePerformance(url) {
        try {
            const startTime = performance.now();
            const response = await fetch(url);
            const loadTime = performance.now() - startTime;
            
            // Get page size
            const content = await response.text();
            const pageSize = new TextEncoder().encode(content).length;

            // Analyze resource counts
            const $ = cheerio.load(content);
            const resourceCount = {
                images: $('img').length,
                scripts: $('script').length,
                styles: $('link[rel="stylesheet"]').length + $('style').length,
                fonts: $('link[rel="stylesheet"][href*="font"]').length
            };

            const totalResources = Object.values(resourceCount).reduce((a, b) => a + b, 0);

            // Performance metrics analysis
            const performanceMetrics = {
                is_load_time_acceptable: loadTime < 3000,
                is_page_size_acceptable: pageSize < 5000000, // 5MB threshold
                resource_load_concerns: this.analyzeResourceConcerns(resourceCount, totalResources),
                core_web_vitals: {
                    lcp: this.estimateLCP(loadTime),
                    fid: this.estimateFID(resourceCount.scripts),
                    cls: this.estimateCLS()
                }
            };

            return {
                load_time_ms: Math.round(loadTime),
                page_size_bytes: pageSize,
                resource_count: resourceCount,
                total_resources: totalResources,
                performance_metrics: performanceMetrics,
                optimization_opportunities: this.identifyPerformanceOptimizations(
                    resourceCount,
                    performanceMetrics
                )
            };
        } catch (error) {
            console.error('Performance analysis error:', error);
            return {
                error: 'Failed to analyze performance',
                details: error.message
            };
        }
    }

    // Helper methods for performance analysis
    analyzeResourceConcerns(resourceCount, totalResources) {
        const concerns = [];
        
        if (totalResources > 50) concerns.push('High total resource count');
        if (resourceCount.images > 20) concerns.push('High image count');
        if (resourceCount.scripts > 15) concerns.push('High script count');
        if (resourceCount.styles > 5) concerns.push('Multiple stylesheet resources');
        
        return concerns.length ? concerns.join('; ') : null;
    }

    estimateLCP(loadTime) {
        return {
            value: loadTime,
            score: loadTime < 2500 ? 'good' : loadTime < 4000 ? 'needs improvement' : 'poor'
        };
    }

    estimateFID(scriptCount) {
        const estimatedFID = 50 + (scriptCount * 10);
        return {
            value: estimatedFID,
            score: estimatedFID < 100 ? 'good' : estimatedFID < 300 ? 'needs improvement' : 'poor'
        };
    }

    estimateCLS() {
        return {
            value: 0.1,
            score: 'good'
        };
    }

    identifyPerformanceOptimizations(resourceCount, metrics) {
        const optimizations = [];
        
        if (resourceCount.images > 20) {
            optimizations.push({
                type: 'images',
                suggestion: 'Consider lazy loading images and using next-gen formats',
                priority: 'high'
            });
        }

        if (resourceCount.scripts > 15) {
            optimizations.push({
                type: 'scripts',
                suggestion: 'Reduce JavaScript payload and defer non-critical scripts',
                priority: 'high'
            });
        }

        if (!metrics.is_load_time_acceptable) {
            optimizations.push({
                type: 'load_time',
                suggestion: 'Implement caching and optimize critical rendering path',
                priority: 'high'
            });
        }

        return optimizations;
    }

    analyzeMobileFriendliness($) {
        const viewport = $('meta[name="viewport"]').attr('content');
        const hasResponsiveImages = $('img[srcset], img[sizes]').length > 0;
        const hasTouchTargets = this.analyzeTouchTargets($);
        const fontSizes = this.analyzeFontSizes($);

        return {
            has_viewport_meta: Boolean(viewport),
            is_responsive: hasResponsiveImages,
            touch_targets: hasTouchTargets,
            font_sizes: fontSizes,
            potential_issues: this.findMobileIssues($)
        };
    }

    async analyzeMobileOptimization(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
                }
            });

            return {
                loads_on_mobile: true,
                mobile_specific_elements: {
                    has_amp_version: response.data.includes('<link rel="amphtml"'),
                    has_mobile_specific_meta: response.data.includes('viewport'),
                    has_mobile_specific_css: response.data.includes('@media')
                }
            };
        } catch (error) {
            return {
                loads_on_mobile: false,
                error: error.message
            };
        }
    }

    async analyzePageSpeed(url) {
        try {
            const API_KEY = process.env.GOOGLE_API_KEY;
            if (!API_KEY) {
                throw new Error('PageSpeed API key not configured');
            }

            const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${API_KEY}&strategy=mobile`;
            const response = await axios.get(apiUrl);
            const data = response.data;

            if (!data.lighthouseResult) {
                throw new Error('Invalid PageSpeed API response');
            }

            return {
                score: Math.round(data.lighthouseResult.categories.performance.score * 100),
                metrics: {
                    first_contentful_paint: data.lighthouseResult.audits['first-contentful-paint'].displayValue,
                    speed_index: data.lighthouseResult.audits['speed-index'].displayValue,
                    largest_contentful_paint: data.lighthouseResult.audits['largest-contentful-paint'].displayValue,
                    time_to_interactive: data.lighthouseResult.audits['interactive'].displayValue,
                    total_blocking_time: data.lighthouseResult.audits['total-blocking-time'].displayValue,
                    cumulative_layout_shift: data.lighthouseResult.audits['cumulative-layout-shift'].displayValue
                },
                opportunities: Object.values(data.lighthouseResult.audits)
                    .filter(audit => audit.details?.type === 'opportunity')
                    .map(audit => ({
                        title: audit.title,
                        description: audit.description,
                        score: audit.score,
                        savings_ms: audit.details?.overallSavingsMs || 0
                    }))
            };
        } catch (error) {
            console.error('PageSpeed API error:', error.message);
            return {
                score: null,
                error: error.message,
                message: "Failed to fetch PageSpeed insights"
            };
        }
    }

    // Helper methods for mobile friendliness analysis
    analyzeTouchTargets($) {
        const smallTouchTargets = [];
        
        $('a, button, [role="button"]').each((i, el) => {
            const width = $(el).css('width');
            const height = $(el).css('height');
            
            // Check if element might be too small for touch (less than 44px)
            if (width && height) {
                const numWidth = parseInt(width);
                const numHeight = parseInt(height);
                if (numWidth < 44 || numHeight < 44) {
                    smallTouchTargets.push($(el).prop('outerHTML'));
                }
            }
        });

        return {
            has_small_touch_targets: smallTouchTargets.length > 0,
            small_touch_targets_count: smallTouchTargets.length
        };
    }

    analyzeFontSizes($) {
        const tooSmallFonts = [];
        
        $('*').each((i, el) => {
            const fontSize = $(el).css('font-size');
            if (fontSize && parseInt(fontSize) < 12) {
                tooSmallFonts.push({
                    element: el.tagName,
                    size: fontSize
                });
            }
        });

        return {
            has_small_fonts: tooSmallFonts.length > 0,
            small_fonts_count: tooSmallFonts.length
        };
    }

    findMobileIssues($) {
        const issues = [];

        // Check for horizontal scrolling issues
        if ($('*').filter((i, el) => $(el).css('width') > '100vw').length > 0) {
            issues.push('Content wider than viewport detected');
        }

        // Check for unplayable content
        if ($('object, embed').length > 0) {
            issues.push('Possible unplayable content (Flash, etc.) detected');
        }

        // Check for fixed-width elements
        $('*[style*="width"]').each((i, el) => {
            const style = $(el).attr('style');
            if (style && style.includes('px') && !style.includes('%')) {
                issues.push('Fixed-width elements detected');
            }
        });

        return issues;
    }

    analyzeHeadings($) {
        const headings = {
            h1: [],
            h2: [],
            h3: [],
            h4: [],
            h5: [],
            h6: []
        };
        
        // Collect all headings
        for (let i = 1; i <= 6; i++) {
            $(`h${i}`).each((_, el) => {
                headings[`h${i}`].push($(el).text().trim());
            });
        }

        // Analyze heading structure
        const issues = [];
        
        // Check if there's exactly one H1
        if (headings.h1.length === 0) {
            issues.push('Missing H1 heading');
        } else if (headings.h1.length > 1) {
            issues.push('Multiple H1 headings detected');
        }

        // Check for proper heading hierarchy
        let previousLevel = 1;
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const currentLevel = parseInt(el.tagName.substring(1));
            if (currentLevel - previousLevel > 1) {
                issues.push(`Skipped heading level: H${previousLevel} to H${currentLevel}`);
            }
            previousLevel = currentLevel;
        });

        // Check for empty headings
        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            if ($(el).text().trim() === '') {
                issues.push(`Empty ${el.tagName} heading detected`);
            }
        });

        return {
            structure: headings,
            count: {
                h1: headings.h1.length,
                h2: headings.h2.length,
                h3: headings.h3.length,
                h4: headings.h4.length,
                h5: headings.h5.length,
                h6: headings.h6.length,
                total: Object.values(headings).reduce((sum, arr) => sum + arr.length, 0)
            },
            issues: issues,
            has_proper_structure: issues.length === 0
        };
    }

    analyzeOpenGraph($) {
        return {
            title: $('meta[property="og:title"]').attr('content'),
            description: $('meta[property="og:description"]').attr('content'),
            image: $('meta[property="og:image"]').attr('content'),
            url: $('meta[property="og:url"]').attr('content'),
            type: $('meta[property="og:type"]').attr('content'),
            site_name: $('meta[property="og:site_name"]').attr('content')
        };
    }

    analyzeTwitterCards($) {
        return {
            card: $('meta[name="twitter:card"]').attr('content'),
            site: $('meta[name="twitter:site"]').attr('content'),
            title: $('meta[name="twitter:title"]').attr('content'),
            description: $('meta[name="twitter:description"]').attr('content'),
            image: $('meta[name="twitter:image"]').attr('content')
        };
    }

    async generateOptimizationSuggestions() {
        // Implementation of generateOptimizationSuggestions method
        // This method should return an array of optimization suggestions
        return [];
    }
}

module.exports = SeoAnalyzer; 