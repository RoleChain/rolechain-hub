const axios = require('axios');
const cheerio = require('cheerio');
const UserAgent = require('user-agents');
const { delay } = require('../utils/helpers');

class CompetitorAnalyzer {
    async analyzeCompetitors(targetUrl, keywords) {
        const competitors = await this.findCompetitors(targetUrl, keywords);
        const analysis = [];

        for (const competitor of competitors.slice(0, 5)) {
            await delay(2000); // Respect rate limits
            
            try {
                const competitorData = await this.analyzeCompetitorSite(competitor);
                analysis.push(competitorData);
            } catch (error) {
                console.error(`Error analyzing competitor ${competitor}:`, error.message);
            }
        }

        return analysis;
    }

    async findCompetitors(targetUrl, keywords) {
        const competitorUrls = new Set();
        const userAgent = new UserAgent();

        for (const keyword of keywords) {
            await delay(2000);

            try {
                const response = await axios.get('https://www.google.com/search', {
                    params: { q: keyword, num: 10 },
                    headers: { 'User-Agent': userAgent.random().toString() }
                });

                const $ = cheerio.load(response.data);
                $('.g').each((i, element) => {
                    const link = $(element).find('a').first().attr('href');
                    if (link && !link.includes(targetUrl)) {
                        const domain = new URL(this.cleanUrl(link)).hostname;
                        competitorUrls.add(domain);
                    }
                });
            } catch (error) {
                console.error(`Error searching for keyword ${keyword}:`, error.message);
            }
        }

        return Array.from(competitorUrls);
    }

    async analyzeCompetitorSite(domain) {
        const userAgent = new UserAgent();
        const response = await axios.get(`https://${domain}`, {
            headers: { 'User-Agent': userAgent.random().toString() }
        });

        const $ = cheerio.load(response.data);

        return {
            domain,
            title: $('title').text(),
            meta_description: $('meta[name="description"]').attr('content'),
            word_count: $('body').text().trim().split(/\s+/).length,
            headings: {
                h1: $('h1').length,
                h2: $('h2').length
            },
            links: $('a').length,
            images: $('img').length,
            social_links: this.findSocialLinks($)
        };
    }

    findSocialLinks($) {
        const socialPlatforms = ['facebook', 'twitter', 'linkedin', 'instagram'];
        const socialLinks = {};

        socialPlatforms.forEach(platform => {
            socialLinks[platform] = $(`a[href*="${platform}.com"]`).length > 0;
        });

        return socialLinks;
    }

    cleanUrl(url) {
        if (url.startsWith('/url?q=')) {
            return decodeURIComponent(url.replace('/url?q=', '').split('&')[0]);
        }
        return url;
    }
}

module.exports = CompetitorAnalyzer; 