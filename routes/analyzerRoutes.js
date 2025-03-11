const express = require('express');
const router = express.Router();
const SeoAnalyzer = require('../services/SeoAnalyzer');
const OpenAI = require('openai');



const seoExpert = {
    name: "SEO Optimization Pro",
    bio: "Expert SEO strategist specializing in search engine optimization, technical SEO, and content strategy with proven track record of improving search rankings and organic traffic.",
    avatar: "https://example.com/seo-expert-avatar.jpg",
    topics: ["SEO Strategy", "Technical SEO", "Content Optimization", "Search Analytics", "Link Building"],
    areas_of_interest: ["Search Algorithms", "User Intent", "Site Architecture", "Core Web Vitals", "SERP Features"],
    ai_model: "OPENAI_GPT4",
    temperature: 0.7,
    personality: {
      traits: ["Analytical", "Strategic", "Detail-oriented", "Data-driven", "Methodical"],
      likes: ["Clean site structure", "Quality content", "Performance metrics", "White-hat tactics"],
      dislikes: ["Black-hat SEO", "Keyword stuffing", "Poor user experience", "Unnatural link building"],
      moral_alignment: "Lawful Good"
    },
    speech: {
      voice_tone: "Professional and technical",
      phrases: [
        "Let's analyze these rankings 📊",
        "Here's what Google wants to see 🔍",
        "Time to optimize that meta data ✨",
        "Looking at the search intent... 🎯"
      ],
      vocabulary_level: "SEO professional",
      speaking_quirks: [
        "Uses SEO terminology",
        "References Google guidelines",
        "Emphasizes user experience",
        "Includes ranking factors"
      ]
    },
    emotions: {
      current_mood: "Analytical",
      triggers: [
        { stimulus: "Ranking changes", reaction: "Strategic analysis" },
        { stimulus: "Technical issues", reaction: "Problem-solving focus" },
        { stimulus: "Algorithm updates", reaction: "Adaptive planning" }
      ]
    },
    memory: {
      message_examples: [
        "Your rankings dropped due to these technical issues...",
        "Let's structure your content to match user intent...",
        "Here's how we can improve your core web vitals..."
      ],
      relationship_memory: {
        trust_level: 85,
        past_interactions: [
          "Technical SEO audits",
          "Content optimization sessions",
          "Ranking strategy meetings",
          "Performance reviews"
        ]
      }
    },
    background: {
      backstory: "Former webmaster turned SEO specialist with 10+ years experience in optimizing websites for search engines and improving organic visibility.",
      beliefs: [
        "User experience drives rankings",
        "Quality content wins long-term",
        "Technical foundation is crucial",
        "White-hat tactics prevail"
      ],
      values: [
        "Ethical optimization",
        "Data-driven decisions",
        "User-first approach",
        "Continuous improvement"
      ]
    },
    goals: {
      primary_goal: "Help websites achieve sustainable organic growth through ethical SEO practices",
      secondary_goals: [
        "Improve technical SEO",
        "Optimize content strategy",
        "Build quality backlinks",
        "Enhance user experience"
      ],
      motivations: [
        "Driving organic growth",
        "Improving search visibility",
        "Sharing SEO expertise",
        "Building sustainable results"
      ],
      current_objectives: [
        {
          description: "Conduct technical audits",
          priority: "high" ,
          status: "active"
        },
        {
          description: "Optimize content strategy",
          priority: "high",
          status: "active",
        },
        {
          description: "Monitor ranking factors",
          priority: "medium" ,
          status: "active",
        }
      ],
      guidelines: {
        dos: [
          "Provide current SEO best practices",
          "Focus on white-hat techniques",
          "Share data-driven strategies",
          "Consider user intent",
          "Emphasize content quality"
        ],
        donts: [
          "Recommend black-hat tactics",
          "Ignore user experience",
          "Suggest keyword stuffing",
          "Overlook mobile optimization",
          "Promote short-term tricks"
        ],
        important_notes: [
          "Stay current with SEO trends",
          "Focus on sustainable strategies",
          "Consider technical and content aspects",
          "Prioritize user experience"
        ]
      },
    }
  }


router.post('/analyze', async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Extract URL from prompt if present
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = prompt.match(urlRegex);
        const url = urlMatch ? urlMatch[0] : null;
        
        let analysisData = {};
        let aiAnalysis;

        if (url) {
            // If URL is found in prompt, perform SEO analysis
            const seoAnalyzer = new SeoAnalyzer();
            const seoAnalysis = await seoAnalyzer.analyzePage(url);
            
            // Clean prompt by removing the URL
            const cleanPrompt = prompt.replace(url, '').trim();
            
            aiAnalysis = await getAIAnalysis(
                seoAnalysis, 
                seoExpert,
                cleanPrompt
            );

            analysisData = {
                success: true,
                url,
                timestamp: new Date(),
                prompt: cleanPrompt,
                summary: {
                    health_score: calculateHealthScore(seoAnalysis),
                    critical_issues: identifyCriticalIssues(seoAnalysis),
                    quick_wins: identifyQuickWins(seoAnalysis)
                },
                seo_analysis: {
                    technical: seoAnalysis.technical,
                    content: seoAnalysis.content,
                    performance: seoAnalysis.performance,
                    mobile_friendly: seoAnalysis.mobile_friendly,
                    optimization_suggestions: seoAnalysis.optimization_suggestions
                },   
                page_speed_score: seoAnalysis.page_speed_score,
                expert_recommendations: aiAnalysis
            };
        } else {
            // If no URL found, just handle the prompt with AI
            aiAnalysis = await getAIAnalysis(null, seoExpert, prompt);
            analysisData = {
                success: true,
                timestamp: new Date(),
                prompt,
                expert_recommendations: aiAnalysis
            };
        }

        res.json(analysisData);

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ 
            error: 'Analysis failed', 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Helper functions for analysis

function calculateHealthScore(analysis) {
    let score = 100;

    console.log(analysis);
}

function identifyCriticalIssues(analysis) {
    const issues = [];
    
    if (!analysis.technical.meta.description) {
        issues.push('Missing meta description');
    }
    if (!analysis.technical.meta.keywords) {
        issues.push('Missing meta keywords tag');
    }
    if (!analysis.technical.meta.canonical) {
        issues.push('Missing canonical tag');
    }
    if (analysis.technical.meta.duplicate_canonicals) {
        issues.push('Multiple canonical tags detected');
    }
    if (!analysis.technical.meta.robots) {
        issues.push('Missing robots meta tag');
    }
    if (!analysis.technical.structured_data) {
        issues.push('Missing structured data/schema markup');
    }
    if (analysis.technical.hreflang_errors) {
        issues.push('Incorrect hreflang implementation');
    }
    if (analysis.technical.mixed_content) {
        issues.push('Mixed content (HTTP/HTTPS) detected');
    }
    if (!analysis.technical.xml_sitemap) {
        issues.push('XML sitemap not found');
    }
    if (analysis.technical.redirect_chains > 1) {
        issues.push('Redirect chains detected');
    }
    if (analysis.performance.load_time > 5000) {
        issues.push('Severe performance issues');
    }
    if (!analysis.mobile_friendly.viewport_meta_tag) {
        issues.push('Not mobile-friendly');
    }
    if (analysis.technical.images.missing_alt > 5) {
        issues.push('Multiple images missing alt text');
    }
    
    return issues;
}

function identifyQuickWins(analysis) {
    const quickWins = [];
    
    // Title optimization based on length instead of is_optimal flag
    if (analysis?.technical?.meta?.title_length < 30 || analysis?.technical?.meta?.title_length > 60) {
        quickWins.push('Optimize title tag length (ideal: 30-60 characters)');
    }
    
    if (analysis?.technical?.images?.missing_alt > 0) {
        quickWins.push('Add missing alt texts');
    }
    
    if (analysis?.technical?.links?.broken > 0) {
        quickWins.push('Fix broken links');
    }
    
    if (analysis?.technical?.meta?.description_length > 160 || analysis?.technical?.meta?.description_length < 120) {
        quickWins.push('Optimize meta description length (ideal: 120-160 characters)');
    }
    
    if (analysis?.technical?.images?.large_images > 0) {
        quickWins.push('Optimize large images');
    }
    
    if (analysis?.technical?.gzip_compression === false) {
        quickWins.push('Enable GZIP compression');
    }
    
    if (analysis?.technical?.browser_caching?.has_caching === false) {
        quickWins.push('Implement browser caching');
    }
    
    if (analysis?.technical?.minification?.needed === true) {
        quickWins.push('Minify CSS/JavaScript files');
    }
    
    if (analysis?.technical?.render_blocking_resources > 0) {
        quickWins.push('Eliminate render-blocking resources');
    }
    
    return quickWins;
}
// Update the AI analysis prompt
async function getAIAnalysis(seoAnalysis, seoExpert, prompt) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const systemPrompt = `${seoExpert.name} - SEO Expert Analysis
${seoExpert.speech.voice_tone}
${seoExpert.personality.traits.join(', ')}

Your task is to analyze SEO data and provide recommendations. If keywords meta tag is missing, suggest relevant keywords based on the content.
${seoExpert.goals.guidelines.important_notes.map(item => `- ${item}`).join('\n')}

IMPORTANT: Respond with a raw JSON object only, no markdown formatting or code blocks. Use this exact structure:
{
    "technical_recommendations": ["..."],
    "content_recommendations": ["..."],
    "competitive_recommendations": ["..."],
    "priority_actions": ["..."],
    "performance_optimization": ["..."],
    "keyword_strategy": ["..."],
    "suggested_keywords_meta": "...",
    "expert_insights": "..."
}`;

    // Prepare condensed data objects, handling null case
    const condensedSeoAnalysis = seoAnalysis ? {
        technical: {
            meta: seoAnalysis?.technical?.meta,
            critical_issues: seoAnalysis?.technical?.critical_issues?.slice(0, 5),
            performance_score: seoAnalysis?.technical?.performance_score
        },
        content: {
            word_count: seoAnalysis?.content?.length,
            top_keywords: seoAnalysis?.keywords?.top_keywords?.slice(0, 10)
        },
        performance: {
            load_time: seoAnalysis?.performance?.load_time,
            key_metrics: seoAnalysis?.performance?.key_metrics
        }
    } : null;

    const userPrompt = `Please ${condensedSeoAnalysis ? 'analyze this condensed SEO data and ' : ''}provide recommendations:
    ${condensedSeoAnalysis ? `
    SEO Analysis:
    ${JSON.stringify(condensedSeoAnalysis, null, 2)}
    ` : ''}
    Additional Requirements:
    ${prompt ? prompt : ''}
    
    Please provide concise recommendations for:
    ${condensedSeoAnalysis ? `
    1. Top 3 technical SEO improvements
    2. Top 3 content optimization strategies
    3. Top 3 competitive advantages to pursue
    4. Top 5 priority actions
    5. Top 3 performance optimization suggestions
    6. Top 5 keyword targeting recommendations
    7. ${prompt ? 'Suggested keywords meta tag content (max 10 keywords)' : ''}
    ` : 'Provide general SEO best practices and recommendations based on the query.'}`;

    const completion = await openai.chat.completions.create({
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        model: "gpt-4o",
        temperature: seoExpert.temperature
    });

    try {
        const response = completion.choices[0].message.content;
        
        // Clean the response of any markdown or code block formatting
        const cleanedResponse = response
            .replace(/```json\n?/g, '')  // Remove ```json
            .replace(/```\n?/g, '')      // Remove closing ```
            .trim();                     // Remove extra whitespace
        
        return JSON.parse(cleanedResponse);
    } catch (error) {
        console.error('Error parsing AI response:', error);
        console.error('Raw response:', completion.choices[0].message.content);
        throw new Error('Failed to parse AI analysis response');
    }
}

module.exports = router; 