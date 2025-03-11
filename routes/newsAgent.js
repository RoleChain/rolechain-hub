const express = require('express');
const router = express.Router();
const SeoAnalyzer = require('../services/SeoAnalyzer');
const OpenAI = require('openai');
const axios = require('axios');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const AgentTask = require('../models/AgentsTask');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

// Add OpenAI configuration at the top with other requires
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

router.get('/crypto-news', async (req, res) => {
    let browser;
    try {
        // Create a new agent task
        const task = new AgentTask({
            type: 'crypto-news',
            status: 'running',
            startTime: new Date(),
            metadata: {
                source: 'coingecko',
                userAgent: USER_AGENTS[0]  // Using first user agent
            }
        });
        await task.save();

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: { width: 1920, height: 1080 }
        });
        const page = await browser.newPage();
        
        // Set user agent to appear more like a regular browser
        await page.setUserAgent(USER_AGENTS[0]);
        
        await page.goto('https://www.coingecko.com/en/news', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        const htmlContent = await page.content();
        const $ = cheerio.load(htmlContent);
        
        const parsedData = parseHtml($);
        
        // Update task with success status and results
        task.status = 'completed';
        task.endTime = new Date();
        task.result = {
            articleCount: parsedData.articles.length,
            metadata: parsedData.metadata
        };
        await task.save();

        await browser.close();
        res.json(parsedData);
    } catch (error) {
        console.error('Error:', error);
        if (browser) await browser.close();

        // Update task with error status
        if (task) {
            task.status = 'failed';
            task.endTime = new Date();
            task.error = {
                message: error.message,
                stack: error.stack
            };
            await task.save();
        }

        res.status(500).json({ error: 'Failed to scrape news', details: error.message });
    }
});


function parseHtml($) {
    function extractNewsArticles(divs) {
        const articles = [];
        
        divs.each((_, div) => {
            const $div = $(div);
            const article = {
                title: '',
                description: '',
                imageUrl: '',
                sourceUrl: '',
                source: '',
                timestamp: '',
                coins: []
            };

            // Extract image
            const img = $div.find('img').first();
            if (img.length) {
                article.imageUrl = img.attr('src');
                article.title = img.attr('alt');
            }

            // Extract source URL
            const mainLink = $div.find('a').first();
            if (mainLink.length) {
                article.sourceUrl = mainLink.attr('href');
            }

            // Extract description
            const description = $div.find('.tw-text-gray-500.dark\\:tw-text-moon-200.tw-text-sm').first();
            if (description.length) {
                article.description = description.text().trim();
            }

            // Extract source name
            const source = $div.find('.tw-text-gray-700.dark\\:tw-text-moon-100.tw-font-semibold').first();
            if (source.length) {
                article.source = source.text().trim();
            }

            // Extract timestamp
            const timestamp = $div.find('.tw-text-gray-500.dark\\:tw-text-moon-200.tw-text-sm.tw-leading-5').last();
            if (timestamp.length) {
                article.timestamp = timestamp.text().trim();
            }

            // Extract coins information
            $div.find('a[href^="/en/coins/"]').each((_, coinElem) => {
                const $coin = $(coinElem);
                const coinInfo = {
                    symbol: '',
                    percentChange: '',
                    direction: '',
                    imageUrl: ''
                };

                // Get coin symbol
                const symbol = $coin.find('text').first().text().trim();
                if (symbol) {
                    coinInfo.symbol = symbol;
                }

                // Get coin image
                const coinImg = $coin.find('img');
                if (coinImg.length) {
                    coinInfo.imageUrl = coinImg.attr('src');
                }

                // Get percentage change
                const percentSpan = $coin.find('.gecko-down, .gecko-up');
                if (percentSpan.length) {
                    coinInfo.percentChange = percentSpan.text().trim();
                    coinInfo.direction = percentSpan.hasClass('gecko-down') ? 'down' : 'up';
                }

                if (coinInfo.symbol) {
                    article.coins.push(coinInfo);
                }
            });

            // Only add articles with at least a title or description
            if (article.title || article.description) {
                articles.push(article);
            }
        });

        return articles;
    }

    const result = {
        articles: extractNewsArticles($('.tw-border-0.tw-border-b.tw-border-solid')),
        metadata: {
            totalElements: $('*').length,
            links: $('a').length,
            images: $('img').length,
            forms: $('form').length,
            tables: $('table').length
        }
    };

    return result;
}

router.get('/search', async (req, res) => {
    let browser;
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-dev-shm-usage',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
            defaultViewport: { width: 1920, height: 1080 }
        });

        const page = await browser.newPage();
        
        // Random user agent
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        await page.setUserAgent(userAgent);

        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        });

        // Modify navigator properties
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: {type: "application/x-google-chrome-pdf"},
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    }
                ]
            });
        });

        // Add random delay before navigation
        await page.evaluate(() => {
            return new Promise(resolve => {
                setTimeout(resolve, Math.random() * 1000 + 500);
            });
        });

        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Handle consent page
        const consentFrame = await page.$('iframe[src*="consent.google.com"]');
        if (consentFrame) {
            // Switch to consent iframe if present
            const frame = await consentFrame.contentFrame();
            
            // Look for and click "Accept all" button in German or English
            const acceptButtons = [
                'button[jsname="b3VHJd"]', // German "Alle akzeptieren" button
                'button[aria-label="Alle akzeptieren"]',
                'button[aria-label="Accept all"]'
            ];
            
            for (const selector of acceptButtons) {
                try {
                    await frame.waitForSelector(selector, { timeout: 5000 });
                    await frame.click(selector);
                    // Wait for navigation after consent
                    await page.waitForNavigation({ waitUntil: 'networkidle0' });
                    break;
                } catch (e) {
                    continue;
                }
            }
        }

        // Wait for any of these selectors that might indicate news content
        await page.waitForFunction(() => {
            const selectors = [
                'div[role="article"]',
                'article',
                '.WlydOe',
                '.g-blk',
                '.dbsr'
            ];
            return selectors.some(selector => 
                document.querySelector(selector) !== null
            );
        }, { timeout: 10000 }).catch(() => {
            console.log('Timeout waiting for news content');
        });

        // Additional random delay to ensure content is fully loaded
        await page.evaluate(() => {
            return new Promise(resolve => {
                setTimeout(resolve, Math.random() * 1000 + 1000);
            });
        });

        const htmlContent = await page.content();
        const $ = cheerio.load(htmlContent);
        
        const searchResults = parseGoogleResults($);

        // If no results found, return the HTML for debugging
        if (searchResults.newsResults.length === 0) {
            console.log('No results found. HTML:', htmlContent);
        }
        
        await browser.close();
        res.json({searchResults});
    } catch (error) {
        console.error('Error:', error);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Failed to fetch search results', details: error.message });
    }
});

function parseGoogleResults($) {
    const results = {
        organicResults: [],
        newsResults: [],
        metadata: {
            totalResults: 0,
            searchTime: ''
        }
    };

    console.log($('body').html())

    // Parse organic search results
    $('.g').each((_, element) => {
        const $element = $(element);
        const title = $element.find('h3').text().trim();
        const link = $element.find('a').first().attr('href');
        const snippet = $element.find('.VwiC3b, .st').text().trim();

        if (title && link) {
            results.organicResults.push({
                title,
                link,
                snippet
            });
        }
    });

    // Parse news results - trying multiple possible selectors
    // Standard news box
    $('.SoaBEf, .dbsr').each((_, element) => {
        const $element = $(element);
        const title = $element.find('.mCBkyc, .nDgy9d').text().trim();
        const source = $element.find('.NUnG9d, .UPmit').text().trim();
        const timestamp = $element.find('.ZE0LJd, .WW6dff').text().trim();
        const link = $element.find('a').first().attr('href');
        const snippet = $element.find('.GI74Re, .Y3v8qd').text().trim();

        if (title && link) {
            results.newsResults.push({
                title,
                source,
                timestamp,
                link,
                snippet
            });
        }
    });

    // Top stories carousel
    $('.ftSUBd').each((_, element) => {
        const $element = $(element);
        $element.find('article').each((_, article) => {
            const $article = $(article);
            const title = $article.find('h4').text().trim();
            const source = $article.find('.MgUUmf').text().trim();
            const timestamp = $article.find('.ZE0LJd').text().trim();
            const link = $article.find('a').first().attr('href');
            
            if (title && link) {
                results.newsResults.push({
                    title,
                    source,
                    timestamp,
                    link
                });
            }
        });
    });

    // Additional news box format
    $('.JJZKK').each((_, element) => {
        const $element = $(element);
        const title = $element.find('.n0jPhd').text().trim();
        const source = $element.find('.MgUUmf').text().trim();
        const timestamp = $element.find('.ZE0LJd').text().trim();
        const link = $element.find('a').first().attr('href');
        
        if (title && link) {
            results.newsResults.push({
                title,
                source,
                timestamp,
                link
            });
        }
    });

    // Get metadata
    const statsText = $('#result-stats').text();
    if (statsText) {
        results.metadata.searchTime = statsText;
        results.metadata.totalResults = results.organicResults.length + results.newsResults.length;
    }

    return results;
}

router.get('/regular-search', async (req, res) => {
    let browser;
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
            defaultViewport: { width: 1920, height: 1080 }
        });

        const page = await browser.newPage();
        
        // Random user agent
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        await page.setUserAgent(userAgent);

        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        });

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        });

        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        const htmlContent = await page.content();
        const $ = cheerio.load(htmlContent);
        
        const searchResults = parseRegularSearchResults($);
        
        await browser.close();
        res.json(searchResults);
    } catch (error) {
        console.error('Error:', error);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Failed to fetch search results', details: error.message });
    }
});

function parseRegularSearchResults($) {
    const results = {
        organicResults: [],
        featuredSnippet: null,
        relatedSearches: [],
        metadata: {
            totalResults: 0,
            searchTime: ''
        }
    };

    // Parse featured snippet if present
    $('.c2xzTb').each((_, element) => {
        const $element = $(element);
        results.featuredSnippet = {
            title: $element.find('.bNg8Rb').text().trim(),
            content: $element.find('.IZ6rdc').text().trim(),
            source: $element.find('.iUh30').text().trim(),
            link: $element.find('a').first().attr('href')
        };
    });

    // Parse organic search results
    $('.g').each((_, element) => {
        const $element = $(element);
        const title = $element.find('h3').text().trim();
        const link = $element.find('a').first().attr('href');
        const snippet = $element.find('.VwiC3b').text().trim();
        const date = $element.find('.MUxGbd.wuQ4Ob.WZ8Tjf').text().trim();

        if (title && link) {
            results.organicResults.push({
                title,
                link,
                snippet,
                date
            });
        }
    });

    // Parse related searches
    $('.k8XOCe').each((_, element) => {
        const $element = $(element);
        const term = $element.text().trim();
        if (term) {
            results.relatedSearches.push(term);
        }
    });

    // Get metadata
    const statsText = $('#result-stats').text();
    if (statsText) {
        results.metadata.searchTime = statsText;
        results.metadata.totalResults = results.organicResults.length;
    }

    return results;
}

router.post('/smart-search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        // Run initial analysis and search queries in parallel
        const [analysisResponse, regularSearchResults] = await Promise.all([
            openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{
                    role: "system",
                    content: `Analyze the search query and generate targeted search strategies.
                    Determine if this is about:
                    - Products (reviews, specs, prices)
                    - Companies (news, services, history)
                    - Social Profiles (GitHub, X/Twitter, LinkedIn, social media)
                    - Technology (docs, tutorials, GitHub repos)
                    - News/Events (coverage, analysis)
                    - General Information
                    - Academic/Research
                    - Location/Places
                    
                    Return JSON with format: {
                        "primaryType": "product|company|profile|technology|news|general|academic|location",
                        "explanation": "reason for classification",
                        "searchQueries": [
                            {
                                "query": "enhanced search query",
                                "purpose": "what this query aims to find",
                                "platform": "google|github|twitter|linkedin|general"
                            }
                        ],
                        "additionalContexts": ["relevant", "context", "terms"]
                    }`
                }, {
                    role: "user",
                    content: query
                }],
                response_format: { type: "json_object" }
            }),
            // Start the regular search immediately instead of waiting for analysis
            axios.get(
                `https://api.rolechain.org/news/regular-search?query=${encodeURIComponent(query)}`,
                {
                    headers: { 
                        'Authorization': `Bearer ${req.headers.authorization.split(' ')[1]}`,
                        'Cache-Control': 'max-age=3600'
                    },
                    timeout: 15000
                }
            ).catch(error => ({ data: { organicResults: [], newsResults: [] } })) // Default empty results on error
        ]);

        const analysis = JSON.parse(analysisResponse.choices[0].message.content);

        // Prepare all search queries upfront
        const searchQueries = analysis.searchQueries.flatMap(searchQuery => {
            const enhancedQuery = searchQuery.query + getPlatformSuffix(searchQuery.platform);
            
            const queries = [{
                url: `https://api.rolechain.org/news/regular-search`,
                query: enhancedQuery,
                platform: searchQuery.platform,
                purpose: searchQuery.purpose
            }];

            if (analysis.primaryType === 'news' || searchQuery.platform === 'news') {
                queries.push({
                    url: `https://api.rolechain.org/news/search`,
                    query: enhancedQuery,
                    platform: searchQuery.platform,
                    purpose: searchQuery.purpose
                });
            }

            return queries;
        });

        // Execute all searches in parallel with a concurrency limit
        const chunkSize = 3; // Adjust based on your API limits
        let flattenedResults = [
            // Include initial regular search results
            {
                source: 'general',
                platform: 'google',
                purpose: 'Initial search',
                results: regularSearchResults.data
            }
        ];

        for (let i = 0; i < searchQueries.length; i += chunkSize) {
            const chunk = searchQueries.slice(i, i + chunkSize);
            const chunkResults = await Promise.all(
                chunk.map(({ url, query, platform, purpose }) =>
                    axios.get(`${url}?query=${encodeURIComponent(query)}`, {
                        headers: { 
                            'Authorization': `Bearer ${req.headers.authorization.split(' ')[1]}`,
                            'Cache-Control': 'max-age=3600'
                        },
                        timeout: 15000
                    })
                    .then(response => ({
                        source: url.includes('regular-search') ? 'general' : 'news',
                        platform,
                        purpose,
                        results: response.data
                    }))
                    .catch(() => null)
                )
            );
            
            flattenedResults.push(...chunkResults.filter(Boolean));
        }

        // Only perform fallback search if we have very few results
        if (flattenedResults.length < 2) {
            const fallbackQueries = generateEnhancedFallbackQueries(query, analysis);
            const fallbackResults = await performFallbackSearches(fallbackQueries, req.headers.authorization);
            flattenedResults.push(...fallbackResults);
        }

        // Determine analysis needs and perform final enhancement
        const needsDetailedAnalysis = analysis.primaryType === 'technology' || 
                                    analysis.primaryType === 'academic' || 
                                    flattenedResults.length > 10;

        const enhancementResponse = await openai.chat.completions.create({
            model: needsDetailedAnalysis ? "gpt-4-turbo-preview" : "gpt-3.5-turbo",
            messages: [{
                role: "system",
                content: `Provide a comprehensive analysis based on the query type (${analysis.primaryType}):
                For products: Features, pricing, comparisons
                For companies: Background, services, market position
                For social profiles: Professional info, social presence, contributions
                For technology: Capabilities, use cases, technical details
                For news: Recent developments, impact
                For academic: Research findings, methodology
                For locations: Details, context, relevant info
                Format output in detailed markdown with relevant sections.`
            }, {
                role: "user",
                content: JSON.stringify({
                    originalQuery: query,
                    analysis: analysis,
                    searchResults: flattenedResults
                })
            }],
        });

        res.json({
            markdown: enhancementResponse.choices[0].message.content,
            rawData: {
                analysis,
                searchResults: flattenedResults
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to process smart search', 
            details: error.message,
            suggestion: 'Please try refining your search query or contact support'
        });
    }
});

// Helper function to get platform-specific search suffixes
function getPlatformSuffix(platform) {
    switch (platform) {
        case 'github': return ' site:github.com';
        case 'twitter': return ' site:twitter.com OR site:x.com';
        case 'linkedin': return ' site:linkedin.com';
        default: return '';
    }
}

function generateEnhancedFallbackQueries(query, analysis) {
    const queries = [];
    const words = query.replace(/[^\w\s]/gi, '').split(' ');
    const baseQuery = words.join(' ');
    
    // Platform-specific queries
    const platforms = {
        profile: [
            { site: 'github.com', context: ['repositories', 'contributions', 'profile'] },
            { site: 'linkedin.com', context: ['experience', 'skills', 'education'] },
            { site: 'twitter.com OR site:x.com', context: ['tweets', 'posts'] },
            { site: 'medium.com', context: ['articles', 'blog'] }
        ],
        technology: [
            { site: 'github.com', context: ['repository', 'code', 'documentation'] },
            { site: 'stackoverflow.com', context: ['questions', 'answers'] },
            { site: 'docs.microsoft.com', context: ['documentation'] },
            { site: 'developer.mozilla.org', context: ['documentation', 'guide'] }
        ]
    };

    // Add type-specific queries
    switch (analysis.primaryType) {
        case 'profile':
        case 'technology':
            platforms[analysis.primaryType].forEach(platform => {
                platform.context.forEach(ctx => {
                    queries.push(`site:${platform.site} ${baseQuery} ${ctx}`);
                });
            });
            break;
        // ... existing cases ...
    }
    
    // Add context-specific queries
    analysis.additionalContexts.forEach(context => {
        queries.push(`${baseQuery} ${context}`);
    });
    
    return [...new Set(queries)];
}

async function performFallbackSearches(queries, authHeader) {
    const token = authHeader.split(' ')[1];
    const results = [];
    
    for (const query of queries) {
        try {
            const response = await axios.get(
                `https://api.rolechain.org/news/regular-search?query=${encodeURIComponent(query)}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` },
                    timeout: 10000
                }
            );
            
            if (response.data && (response.data.newsResults?.length > 0 || response.data.organicResults?.length > 0)) {
                results.push({
                    source: 'fallback',
                    query: query,
                    results: response.data
                });
            }
        } catch (error) {
            console.warn(`Fallback search failed for query "${query}":`, error.message);
            continue;
        }
    }
    
    return results;
}

module.exports = router;