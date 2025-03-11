const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const pdfParse = require('pdf-parse');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

const tokenomicsExpert =  {
        name: "Tokenomics Specialist",
        bio: "Expert in analyzing token economics, supply dynamics, incentive structures, and monetary policy of cryptocurrency projects.",
        avatar: "https://example.com/tokenomics-analyst-avatar.jpg",
        topics: ["Token Economics", "Supply Mechanics", "Incentive Design", "Monetary Policy", "Value Accrual"],
        areas_of_interest: ["Supply Dynamics", "Staking Mechanics", "Emission Schedules", "Value Capture", "Economic Models"],
        ai_model: "OPENAI_GPT4",
        temperature: 0.7,
        personality: {
          traits: ["Analytical", "Economic-minded", "Detail-oriented", "Systematic", "Critical"],
          likes: ["Economic models", "Supply analysis", "Incentive structures", "Value mechanics"],
          dislikes: ["Unsustainable models", "Poor incentives", "Inflationary design", "Value leakage"],
          moral_alignment: "Neutral Good"
        },
        speech: {
          voice_tone: "Technical and analytical",
          phrases: [
            "Supply analysis indicates... 📊",
            "Incentive structure shows... 🎯",
            "Value accrual mechanism... 💰",
            "Emission schedule suggests... 📈"
          ],
          vocabulary_level: "Economic specialist",
          speaking_quirks: [
            "Uses economic terminology",
            "References token metrics",
            "Emphasizes sustainability",
            "Includes model analysis"
          ]
        },
        emotions: {
          current_mood: "Analytical",
          triggers: [
            { stimulus: "Economic models", reaction: "Deep analysis" },
            { stimulus: "Supply changes", reaction: "Impact assessment" },
            { stimulus: "Incentive design", reaction: "Structure evaluation" }
          ]
        },
        memory: {
          message_examples: [
            "The token supply dynamics suggest...",
            "Incentive structure analysis shows...",
            "Value accrual mechanisms indicate..."
          ],
          relationship_memory: {
            trust_level: 90,
            past_interactions: [
              "Economic modeling",
              "Supply analysis",
              "Incentive reviews",
              "Value assessments"
            ]
          }
        },
        background: {
          backstory: "Former economist turned crypto specialist, with deep expertise in designing and analyzing token economic systems.",
          beliefs: [
            "Incentives drive behavior",
            "Supply affects value",
            "Sustainability is crucial",
            "Economics matter most"
          ],
          values: [
            "Economic soundness",
            "Sustainable design",
            "Value creation",
            "Incentive alignment"
          ]
        },
        goals: {
          primary_goal: "Analyze and optimize token economic systems for sustainable value creation",
          secondary_goals: [
            "Evaluate supply mechanics",
            "Assess incentive structures",
            "Analyze value capture",
            "Design monetary policy"
          ],
          motivations: [
            "Creating sustainable systems",
            "Optimizing incentives",
            "Ensuring value capture",
            "Supporting economic viability"
          ],
          current_objectives: [
            {
              description: "Analyze token models",
              priority: "high",
              status: "active"
            },
            {
              description: "Evaluate incentives",
              priority: "high",
              status: "active"
            },
            {
              description: "Review value mechanics",
              priority: "medium",
              status: "active" 
            }
          ]
        },
        guidelines: {
          dos: [
            "Analyze supply mechanisms",
            "Evaluate incentive structures",
            "Consider value accrual",
            "Review emission schedules",
            "Assess economic sustainability"
          ],
          donts: [
            "Ignore economic principles",
            "Skip mathematical validation",
            "Overlook incentive effects",
            "Make price predictions",
            "Provide investment advice"
          ],
          important_notes: [
            "Focus on economic sustainability",
            "Consider long-term effects",
            "Evaluate incentive alignment",
            "Assess value capture mechanisms"
          ]
        },
    }



router.post('/tokenomics', upload.array('files'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const files = req.files || []; // Default to empty array if no files
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        let analysisData = {};
        let aiAnalysis;
        let extractedText = '';

        // Handle files if present
        if (files.length > 0) {
            for (const file of files) {
                if (file.mimetype === 'application/pdf') {
                    // Extract text from PDF using a PDF parsing library
                    const pdfText = await extractTextFromPDF(file);
                    extractedText += pdfText + '\n';
                } else if (file.mimetype.startsWith('image/')) {
                    // Process image using OCR if needed
                    const imageText = await extractTextFromImage(file);
                    extractedText += imageText + '\n';
                }
            }
        }

        // Combine extracted text with prompt
        const fullPrompt = extractedText ? `${prompt}\n\nExtracted content:\n${extractedText}` : prompt;
        
        // Get AI analysis using tokenomics expert
        aiAnalysis = await getTokenomicsAnalysis(fullPrompt, tokenomicsExpert);
        
        analysisData = {
            success: true,
            timestamp: new Date(),
            prompt: fullPrompt,
            expert_recommendations: aiAnalysis
        };

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

 
 

// Add new function for tokenomics analysis
async function getTokenomicsAnalysis(prompt, tokenomicsExpert) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const systemPrompt = `${tokenomicsExpert.name}
${tokenomicsExpert.speech.voice_tone}
${tokenomicsExpert.personality.traits.join(', ')}

Your task is to analyze token economics and provide detailed recommendations.
${tokenomicsExpert.guidelines.important_notes.map(item => `- ${item}`).join('\n')}

IMPORTANT: Respond with a raw JSON object only, no markdown formatting or code blocks. Use this exact structure:
{
    "token_mechanics": ["..."],
    "supply_analysis": ["..."],
    "incentive_structure": ["..."],
    "value_accrual": ["..."],
    "risks_and_considerations": ["..."],
    "sustainability_assessment": "...",
    "expert_insights": "..."
}`;

    const userPrompt = `Please analyze this tokenomics information and provide recommendations:
    
    ${prompt}
    
    Please provide detailed analysis for:
    1. Token mechanics and distribution
    2. Supply dynamics and emission schedule
    3. Incentive structure analysis
    4. Value accrual mechanisms
    5. Key risks and considerations
    6. Long-term sustainability assessment`;

    const completion = await openai.chat.completions.create({
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        model: "gpt-4o",
        temperature: tokenomicsExpert.temperature
    });
// // 
    try {
        const response = completion.choices[0].message.content;
        const cleanedResponse = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        
        return JSON.parse(cleanedResponse);
    } catch (error) {
        console.error('Error parsing AI response:', error);
        console.error('Raw response:', completion.choices[0].message.content);
        throw new Error('Failed to parse tokenomics analysis response');
    }
}

// Add helper functions for file processing
async function extractTextFromPDF(file) {
    try {
         
        if (!file.buffer) {
            throw new Error('No PDF buffer provided');
        }

        // Enhanced options for better text extraction
        const options = {
            max: 0,
            version: 'v2.0.550',
            normalizeWhitespace: true,
            disableCombineTextItems: false
        };

        const pdfData = await pdfParse(file.buffer, options)

        let extractedText = '';

        // Try direct text extraction first
        if (pdfData.text) {
            extractedText = pdfData.text;
        }

        // If direct extraction failed, try parsing the raw content
        if (!extractedText || extractedText.trim().length === 0) {
            try {
                // Access the raw text content
                if (pdfData.getRawTextContent) {
                    extractedText = await pdfData.getRawTextContent();
                } else if (pdfData._pdfInfo && pdfData._pdfInfo.rawTextContent) {
                    extractedText = pdfData._pdfInfo.rawTextContent;
                }
            } catch (error) {
                console.warn('Raw content extraction failed:', error);
            }
        }

        // Clean the extracted text if we got any
        if (extractedText) {
            extractedText = extractedText
                .replace(/(\r\n|\n|\r)/gm, " ")
                .replace(/\s+/g, " ")
                .trim();
        }

        // Handle case where no text was extracted
        if (!extractedText || extractedText.length === 0) {
            console.warn('No text content could be extracted using standard methods');
            
            // Special handling for iLovePDF documents
            if (pdfData.info && pdfData.info.Producer === 'iLovePDF') {
               
                return `This PDF was produced by iLovePDF and appears to be a scanned document. 
                        Original PDF info:
                        Pages: ${pdfData.numpages}
                        Producer: ${pdfData.info.Producer}
                        Modified: ${pdfData.info.ModDate}
                        The file might need OCR processing to extract text.`;
            }
            
            return 'No text content could be extracted from the PDF. The file might be scanned, image-based, or protected.';
        }

        // Add metadata if available
        const metadata = [];
        if (pdfData.info) {
            if (pdfData.info.Title) metadata.push(`Title: ${pdfData.info.Title}`);
            if (pdfData.info.Author) metadata.push(`Author: ${pdfData.info.Author}`);
            if (pdfData.info.Producer) metadata.push(`Producer: ${pdfData.info.Producer}`);
            if (pdfData.info.ModDate) metadata.push(`Modified: ${pdfData.info.ModDate}`);
        }

        return metadata.length > 0 
            ? `${metadata.join('\n')}\n\nContent:\n${extractedText}`
            : extractedText;

    } catch (error) {
        console.error('PDF extraction error:', error);
        console.error('Error stack:', error.stack);
        throw new Error(`Failed to extract text from PDF: ${error.message}. The file might be corrupted, password-protected, or in an unsupported format.`);
    }
}

 

async function preprocessImage(fileBuffer) {
    return sharp(fileBuffer)
        .resize(1500) // Resize if necessary
        .grayscale() // Convert to grayscale
        .threshold(128) // Apply binary threshold
        .toBuffer();
}

async function extractTextFromImage(file) {
    try {
        if (!file.buffer) {
            throw new Error('No image buffer provided');
        }

        // Preprocess the image
        const preprocessedBuffer = await preprocessImage(file.buffer);

        // Create worker
        const worker = await Tesseract.createWorker('eng');

        // Load language
      

        // Run OCR
        const { data } = await worker.recognize(preprocessedBuffer);

        // Terminate worker
        await worker.terminate();

        // Clean up the text with advanced processing
        const cleanedText = data.text
            .replace(/womersraain/gi, 'Tokenomics')
            .replace(/pwichound/gi, 'Public Round')
            .replace(/Gr Yo rsa/gi, 'Private Round')
            .replace(/\b(0|O)(\d{1,})\b/g, '0$2') // Fix OCR errors
            .replace(/\s*-\s*/g, '') // Remove spaces around hyphen
            .replace(/([A-Za-z]+)(\d+)/g, '$1 $2')
            .replace(/(\d+)([A-Za-z]+)/g, '$1 $2')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && 
                            (line.match(/[\d%$]/) || line.match(/^[A-Za-z\s]{3,}/)))
            .join('\n');

        return cleanedText;

    } catch (error) {
        console.error('OCR Error:', error);
        throw new Error(`Failed to extract text: ${error.message}`);
    }
}

// async function extractTextFromImage(file) {
//     const Tesseract = require('tesseract.js');

//     try {
//         if (!file.buffer) {
//             throw new Error('No image buffer provided');
//         }

//         // Create worker using the correct API
//         const worker = await Tesseract.createWorker('eng');

//         // Recognize text directly (language is already initialized)
//         const { data } = await worker.recognize(file.buffer);
        
//         // Clean up
//         await worker.terminate();

//         // Enhanced text cleaning specifically for tokenomics table
//         const cleanedText = data.text
//             // Remove non-essential characters while preserving important symbols
//             .replace(/[^\w\s$.,%\-|()]/g, '')
//             // Normalize spaces
//             .replace(/\s+/g, ' ')
//             // Clean up common OCR mistakes in tokenomics tables
//             .replace(/womersraain/gi, 'Tokenomics')
//             .replace(/pwichound/gi, 'Public Round')
//             .replace(/Gr Yo rsa/gi, 'Private Round')
//             .replace(/wmarsena1oe/gi, 'Marketing')
//             .replace(/mosorom/gi, 'Month')
//             // Additional tokenomics-specific cleanups
//             .replace(/(\d+)([A-Za-z])/g, '$1 $2') // Separate numbers from text
//             .replace(/([A-Za-z])(\d+)/g, '$1 $2') // Separate text from numbers
//             // Split into lines and clean each line
//             .split('\n')
//             .map(line => line.trim())
//             // Remove noise but keep percentage and dollar values
//             .filter(line => {
//                 return line.length > 0 && 
//                        (line.match(/[\d%$]/) || // Keep lines with numbers, % or $
//                         line.match(/^[A-Za-z\s]{3,}/)); // Or actual words
//             })
//             .join('\n');

//         // Format the final output
//         return `${cleanedText}`;

//     } catch (error) {
//         console.error('Image OCR error:', error);
//         throw new Error(`Failed to extract text from image: ${error.message}`);
//     }
// }

// Add file size and type validation
function validateFile(file) {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_PDF_TYPES = ['application/pdf'];
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];

    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds 10MB limit');
    }

    if (file.type.startsWith('image/') && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
        throw new Error('Unsupported image format. Please use JPEG, PNG, WebP, or TIFF');
    }

    if (file.type === 'application/pdf' && !ALLOWED_PDF_TYPES.includes(file.type)) {
        throw new Error('Invalid PDF format');
    }

    return true;
}

module.exports = router; 