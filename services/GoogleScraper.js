const axios = require('axios');
const cheerio = require('cheerio');
const UserAgent = require('user-agents');
const { delay } = require('../utils/helpers');

class GoogleScraper {
    constructor() {
        this.userAgent = new UserAgent();
    }

    async analyzeKeyword(targetUrl, keyword) {
        await delay(2000); // Respect rate limits
        console.log('Analyzing keyword:', keyword);
        
        try {
            const searchResults = await this.searchGoogle(keyword);
            const domainName = new URL(targetUrl).hostname;
            
            const position = searchResults.findIndex(result => 
                result.link.includes(domainName)) + 1;

            const competitors = searchResults
                .filter(result => !result.link.includes(domainName))
                .map(result => new URL(result.link).hostname);

            return {
                keyword,
                search_results: searchResults.length,
                position: position || 'Not in top 10',
                top_competitors: [...new Set(competitors)].slice(0, 5),
                difficulty: this.calculateDifficulty(searchResults)
            };

        } catch (error) {
            console.error(`Error analyzing keyword ${keyword}:`, error.message);
            return {
                keyword,
                error: 'Analysis failed'
            };
        }
    }

    async searchGoogle(query) {
        const response = await axios.get('https://www.google.com/search', {
            params: {
                q: query,
                num: 10
            },
            headers: {
                'User-Agent': this.userAgent.random().toString(),
                'Accept': 'text/html',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('.g').each((i, element) => {
            const title = $(element).find('h3').text();
            const link = $(element).find('a').first().attr('href');
            const snippet = $(element).find('.VwiC3b').text();

            if (title && link && !link.includes('/search?')) {
                results.push({
                    title: title.trim(),
                    link: this.cleanUrl(link),
                    snippet: snippet.trim()
                });
            }
        });

        return results;
    }

    calculateDifficulty(results) {
        const authorityDomains = [
            'wikipedia.org', 'amazon.com', 'facebook.com', 
            'youtube.com', 'linkedin.com', 'twitter.com'
        ];
        
        const authorityCount = results.filter(result => 
            authorityDomains.some(domain => result.link.includes(domain))
        ).length;

        if (authorityCount >= 5) return 'High';
        if (authorityCount >= 3) return 'Medium';
        return 'Low';
    }

    cleanUrl(url) {
        if (url.startsWith('/url?q=')) {
            return decodeURIComponent(url.replace('/url?q=', '').split('&')[0]);
        }
        return url;
    }

    async getTopCompetitors(keyword, excludeUrl, limit = 10) {
        try {
            // Use existing searchGoogle method to get results
            const searchResults = await this.searchGoogle(keyword);
            
            // Extract and filter URLs from search results
            const competitors = searchResults
                .map(result => result.link)
                .filter(url => {
                    try {
                        const domain = new URL(url).hostname;
                        return domain !== new URL(excludeUrl).hostname;
                    } catch (e) {
                        return false;
                    }
                })
                .slice(0, limit);

            return competitors;
        } catch (error) {
            console.error('Error getting top competitors:', error);
            return [];
        }
    }
}

module.exports = GoogleScraper; 