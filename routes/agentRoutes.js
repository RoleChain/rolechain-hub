const express = require('express');
const router = express.Router();
const { fork } = require('child_process');
const path = require('path');
const { getAgentById, addAgent, getAgentsByUserId } = require('../models/Agents');
const axios = require('axios');
const { fetchCharacter } = require('../models/Character');
const AgentsTask = require('../models/AgentsTask');
const ChannelMessage = require('../models/ChannelMessage');
const AgentsMemory = require('../models/AgentMemory');
const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const { HttpsProxyAgent } = require('https-proxy-agent');
const ChatHistory = require('../models/chatHistory');
const User = require('../models/User');

// Store active bot processes
const activeBots = new Map();

// Add CoinGecko API client
const CoinGeckoClient = require('coingecko-api');
const CoinGecko = new CoinGeckoClient();

// Add after other const declarations
const proxyList = [
];

// Add after other const declarations
const cryptoSessions = new Map(); // Store user's current crypto context

// Helper function to get CoinGecko coin list with caching
let coinListCache = null;
let lastCacheTime = null;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

async function getCoinList() {
  if (coinListCache && lastCacheTime && (Date.now() - lastCacheTime < CACHE_DURATION)) {
    return coinListCache;
  }

  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/list');
    coinListCache = response.data;
    lastCacheTime = Date.now();
    return coinListCache;
  } catch (error) {
    console.error('Error fetching coin list:', error);
    return coinListCache || []; // Return cached data if available, empty array if not
  }
}

// Helper function to normalize crypto names
function normalizeCryptoName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '') // Remove all spaces
    .replace(/-/g, '')   // Remove hyphens
    .replace(/\./g, ''); // Remove dots
}

// Helper function to check if two crypto names are similar
function areSimilarCryptoNames(name1, name2) {
  const normalized1 = normalizeCryptoName(name1);
  const normalized2 = normalizeCryptoName(name2);

  // Direct match after normalization
  if (normalized1 === normalized2) return true;

  // Check if one is contained in the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;

  // Check Levenshtein distance for similar spellings
  return levenshteinDistance(normalized1, normalized2) <= 2;
}

// Helper function to extract crypto info from question
async function extractCryptoInfo(question, userId) {
  const coinList = await getCoinList();
  const questionLower = normalizeCryptoName(question);
  
  console.log('Searching for:', questionLower);
  console.log('CoinList sample:', coinList.slice(0, 5));

  // Common words to ignore
  const ignoreWords = new Set([
    'analyse', 'analyze', 'analysis',
    'volume', 'price', 'trend',
    'chart', 'market', 'trading',
    'buy', 'sell', 'hold',
    'bullish', 'bearish',
    'support', 'resistance',
    'target', 'prediction',
    'forecast', 'outlook',
    'technical', 'fundamental',
    'indicator', 'pattern',
    'breakout', 'breakdown',
    'high', 'low', 'open',
    'close', 'what', 'when',
    'how', 'why', 'where',
    'the', 'for', 'about',
    'me', 'my', 'give',
    'show', 'tell', 'check'
  ]);

  // Common aliases with exact CoinGecko IDs
  const commonAliases = {
    'bitcoin': { name: 'Bitcoin', symbol: 'BTC', id: 'bitcoin' },
    'btc': { name: 'Bitcoin', symbol: 'BTC', id: 'bitcoin' },
    'eth': { name: 'Ethereum', symbol: 'ETH', id: 'ethereum' },
    'ethereum': { name: 'Ethereum', symbol: 'ETH', id: 'ethereum' },
    'sol': { name: 'Solana', symbol: 'SOL', id: 'solana' },
    'solana': { name: 'Solana', symbol: 'SOL', id: 'solana' },
    'ada': { name: 'Cardano', symbol: 'ADA', id: 'cardano' },
    'cardano': { name: 'Cardano', symbol: 'ADA', id: 'cardano' },
    'ton': { name: 'Toncoin', symbol: 'TON', id: 'the-open-network' },
    'toncoin': { name: 'Toncoin', symbol: 'TON', id: 'the-open-network' }
  };

  // First check for common aliases with similarity matching
  for (const [alias, info] of Object.entries(commonAliases)) {
    if (areSimilarCryptoNames(questionLower, alias)) {
      console.log('Found common alias:', alias);
      cryptoSessions.set(userId, info);
      return info;
    }
  }

  // Check for $SYMBOL pattern
  const tickerMatch = question.match(/\$([a-zA-Z0-9]+)/i);
  if (tickerMatch) {
    const symbol = tickerMatch[1].toLowerCase();
    const coin = coinList.find(c => 
      c.symbol.toLowerCase() === symbol
    );
    if (coin) {
      const info = { name: coin.name, symbol: coin.symbol.toUpperCase(), id: coin.id };
      cryptoSessions.set(userId, info);
      return info;
    }
  }

  // Extract potential crypto mentions from question
  const words = questionLower.match(/\b[a-zA-Z0-9]{2,}\b/g) || [];
  const filteredWords = words.filter(word => !ignoreWords.has(word));
  console.log('Extracted words (after filtering):', filteredWords);
  
  // Try exact matches first
  for (const word of filteredWords) {
    const coin = coinList.find(c => {
      const symbolMatch = c.symbol.toLowerCase() === word;
      const nameMatch = c.name.toLowerCase() === word;
      const idMatch = c.id.toLowerCase() === word;
      
      if (symbolMatch || nameMatch || idMatch) {
        console.log('Found exact match:', c);
        return true;
      }
      return false;
    });
    
    if (coin) {
      const info = { name: coin.name, symbol: coin.symbol.toUpperCase(), id: coin.id };
      cryptoSessions.set(userId, info);
      return info;
    }
  }

  // Try fuzzy matching if no exact match found
  for (const word of filteredWords) {
    const coin = coinList.find(c => {
      const symbolSimilar = areSimilarCryptoNames(c.symbol, word);
      const nameSimilar = areSimilarCryptoNames(c.name, word);
      const idSimilar = areSimilarCryptoNames(c.id, word);
      
      if (symbolSimilar || nameSimilar || idSimilar) {
        console.log('Found similar match:', c, {
          word,
          symbolSimilar,
          nameSimilar,
          idSimilar
        });
        return true;
      }
      return false;
    });

    if (coin) {
      const info = { name: coin.name, symbol: coin.symbol.toUpperCase(), id: coin.id };
      cryptoSessions.set(userId, info);
      return info;
    }
  }

  console.log('No match found, returning default Bitcoin');
  return cryptoSessions.get(userId) || { name: 'Bitcoin', symbol: 'BTC', id: 'bitcoin' };
}

// Helper function to calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Helper function to get random proxy
function getRandomProxy() {
  const proxy = [Math.floor(Math.random() * proxyList.length)];
  const [host, port, username, password] = proxy.split(':');
  return {
    host,
    port,
    auth: `${username}:${password}`,
    protocol: 'http'
  };
}

// Helper function to create axios instance with proxy
function createProxiedAxios() {
  const proxy = getRandomProxy();
  const proxyUrl = `http://${proxy.auth}@${proxy.host}:${proxy.port}`;

  return axios.create({
    proxy: false,
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
}

// Add error handling for proxy requests
async function makeProxiedRequest(url, options = {}) {
  let retries = 3;
  while (retries > 0) {
    try {
      const axiosInstance = createProxiedAxios();
      const response = await axiosInstance.get(url, options);
      return response;
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.log(`Request failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
    }
  }
}

// Get all agents
router.get('/', async (req, res) => {
  try {
    const agents = await getAgentsByUserId(req.user.id);

    // Get active tasks for all agents
    const agentsWithTasks = await Promise.all(agents.map(async (agent) => {
      const activeTasks = await AgentsTask.find({
        agentId: agent._id,
        status: 'in-progress'
      }).lean();

      return {
        ...agent.toObject(),
        activeTasks
      };
    }));

    res.json(agentsWithTasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Get agent by ID
router.get('/:id', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// Create new agent
router.post('/', async (req, res) => {
  try {
    const {
      character_id,
      platform,
      token,
      bot_name,
      bot_id,
      medium,
      avatar,
      name,
      bio,
      workflow
    } = req.body;
    

    // Validate required fields
    if (!medium || !avatar || !name || !bio || !workflow) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate medium enum
    if (!['x', 'discord', 'telegram', 'api'].includes(medium)) {
      return res.status(400).json({ error: 'Invalid medium value' });
    }

    console.log(req.user.id)

    const newAgent = await addAgent({
      character_id,
      platform,
      token,
      bot_name,
      bot_id,
      medium,
      avatar,
      name,
      bio,
      created_by: req.user.id,
      workflow: workflow
    });



    // Automatically start the bot after creation
    const character = await fetchCharacter(newAgent.character_id);
    const workerPath = path.join(__dirname, '../workers/botWorker.js');
    const botProcess = fork(workerPath);

    // Handle worker messages
    botProcess.on('message', (message) => {
      if (message.type === 'started') {
        console.log(`Bot ${newAgent.id} started successfully`);
      } else if (message.type === 'error') {
        console.error(`Bot ${newAgent.id} error:`, message.error);
        botProcess.kill();
        activeBots.delete(newAgent.id);
      }
    });

    // Handle worker exit
    botProcess.on('exit', (code) => {
      console.log(`Bot ${newAgent._id} exited with code ${code}`);
      activeBots.delete(newAgent._id);
    });

    // Start the bot
    botProcess.send({
      type: 'start',
      data: { agent: newAgent, character }
    });

    activeBots.set(newAgent._id.toString(), botProcess);
    console.log('--------------------------------')
    console.log(activeBots)

    res.status(201).json({
      agent: newAgent,
      botStatus: 'started'
    });
  } catch (error) {
    console.error('Error creating and starting agent:', error);
    res.status(500).json({ error: 'Failed to create and start agent' });
  }
});

// Update agent
router.put('/:id', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const updatedFields = req.body;
    Object.assign(agent, updatedFields);
    await agent.save();

    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Delete agent
router.delete('/:id', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    await agent.deleteOne();
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// Start bot
router.post('/:id/start', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (activeBots.has(agent._id)) {
      return res.status(400).json({ error: 'Bot is already running' });
    }

    const character = await fetchCharacter(agent.character_id);
    const workerPath = path.join(__dirname, '../workers/botWorker.js');
    const botProcess = fork(workerPath);

    // Handle worker messages
    botProcess.on('message', (message) => {
      if (message.type === 'started') {
        console.log(`Bot ${agent.id} started successfully`);
      } else if (message.type === 'error') {
        console.error(`Bot ${agent.id} error:`, message.error);
        botProcess.kill();
        activeBots.delete(agent.id);
      }
    });

    // Handle worker exit
    botProcess.on('exit', (code) => {
      console.log(`Bot ${agent.id} exited with code ${code}`);
      activeBots.delete(agent.id);
    });

    // Start the bot
    botProcess.send({
      type: 'start',
      data: { agent, character }
    });

    activeBots.set(agent._id.toString(), botProcess);
    res.json({ message: 'Bot started successfully', agentId: agent._id });
  } catch (error) {
    console.error('Error starting bot:', error);
    res.status(500).json({ error: 'Failed to start bot' });
  }
});

// Stop bot
router.post('/:id/stop', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    console.log(agent)

    console.log(activeBots)
    console.log('--------------------------------')
    console.log(agent._id)

    const botProcess = activeBots.get(agent._id.toString());
    if (!botProcess) {
      return res.status(400).json({ error: 'Bot is not running' });
    }

    botProcess.kill();
    activeBots.delete(agent._id);
    res.json({ message: 'Bot stopped successfully' });
  } catch (error) {
    console.error('Error stopping bot:', error);
    res.status(500).json({ error: 'Failed to stop bot' });
  }
});

// Get bot status
router.get('/:id/status', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const isRunning = activeBots.has(agent._id.toString());
    res.json({
      status: isRunning ? 'running' : 'stopped',
      pid: isRunning ? activeBots.get(agent._id.toString()).pid : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get bot status' });
  }
});

// Update Telegram bot profile
router.post('/telegram/update-profile', async (req, res) => {
  try {
    const { token, name, bio, avatar } = req.body;

    if (!token || !name) {
      return res.status(400).json({ error: 'Token and name are required' });
    }

    const axiosWithProxy = createProxiedAxios();
    const baseUrl = `https://api.telegram.org/bot${token}`;

    // Update bot name
    await axiosWithProxy.post(`${baseUrl}/setMyName`, {
      name: name
    });

    // Update bio if provided
    if (bio) {
      await axiosWithProxy.post(`${baseUrl}/setMyDescription`, {
        description: bio
      });
    }

    // Update avatar if provided
    if (avatar) {
      await axiosWithProxy.post(`${baseUrl}/setMyProfilePhoto`, {
        photo: avatar
      });
    }

    res.json({ message: 'Bot profile updated successfully' });
  } catch (error) {
    console.error('Error updating bot profile:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to update bot profile',
      details: error.response?.data || error.message
    });
  }
});

// Send task to bot
router.post('/:id/task', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const botProcess = activeBots.get(agent._id.toString());
    if (!botProcess) {
      return res.status(400).json({ error: 'Bot is not running' });
    }

    const { taskName, taskType, parameters } = req.body;
    if (!taskName) {
      return res.status(400).json({ error: 'Task is required' });
    }

    const task = await AgentsTask.create({
      agentId: agent._id,
      taskName,
      taskType,
      status: 'pending',
      parameters,
      created_by: req.user.id
    });

    // Send task to bot worker
    botProcess.send({
      type: 'task',
      data: {
        task,
        parameters,
        agentId: agent.id
      }
    });

    res.json({
      message: 'Task sent successfully',
      agentId: agent.id,
      task
    });
  } catch (error) {
    console.error('Error sending task to bot:', error);
    res.status(500).json({ error: 'Failed to send task to bot' });
  }
});

// Get dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    // Get agents for current user
    const userAgents = await getAgentsByUserId(req.user.id);

    // Count active agents (those with active flag set to true)
    const activeAgents = userAgents.filter(agent => agent.active).length;

    // Get active tasks count and failed tasks count
    const totalTasks = await AgentsTask.find({ created_by: req.user.id }).countDocuments();
    const activeTasks = await AgentsTask.find({ status: 'in-progress', created_by: req.user.id }).countDocuments();
    const failedTasks = await AgentsTask.find({ status: 'failed', created_by: req.user.id }).countDocuments();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get memory counts for today and yesterday
    const todayMemories = await AgentsMemory.find({
      created_by: req.user.id,
      created_at: { $gte: today }
    }).countDocuments();

    const yesterdayMemories = await AgentsMemory.find({
      created_by: req.user.id,
      created_at: { $gte: yesterday, $lt: today }
    }).countDocuments();

    // Calculate memory percentage change
    const memoryPercentageChange = yesterdayMemories === 0
      ? 100
      : ((todayMemories - yesterdayMemories) / yesterdayMemories * 100).toFixed(1);

    const formattedMemoryPercentageChange = `${memoryPercentageChange > 0 ? '+' : ''}${memoryPercentageChange}%`;

    // Get message counts
    const todayMessages = await ChannelMessage.find({
      agentId: { $in: userAgents.map(agent => agent.id) },
      timestamp: { $gte: today }
    }).countDocuments();

    const yesterdayMessages = await ChannelMessage.find({
      agentId: { $in: userAgents.map(agent => agent.id) },
      timestamp: { $gte: yesterday, $lt: today }
    }).countDocuments();

    // Calculate percentage change
    const percentageChange = yesterdayMessages === 0
      ? 100 // If yesterday had 0 messages, treat as 100% increase
      : ((todayMessages - yesterdayMessages) / yesterdayMessages * 100).toFixed(1);

    // Format percentage change with + or - sign
    const formattedPercentageChange = `${percentageChange > 0 ? '+' : ''}${percentageChange}%`;

    res.json({
      overview: {
        activeAgents,
        activeTasks,
        failedTasks,
        totalTasks
      },
      community: {
        totalUsers: userAgents.length,
        percentageChange: formattedPercentageChange
      },
      performance: {
        responseTime: '238ms', // Implement actual response time calculation
        status: 'Excellent performance'
      },
      messages: {
        today: todayMessages,
        yesterday: yesterdayMessages,
        percentageChange: formattedPercentageChange
      },
      memories: {
        today: todayMemories,
        yesterday: yesterdayMemories,
        percentageChange: formattedMemoryPercentageChange
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Get all agents activity
router.get('/activity/recent', async (req, res) => {
  try {
    const userAgents = await getAgentsByUserId(req.user.id);
    const agentIds = userAgents.map(agent => agent.id);
    const now = new Date();

    // Fetch recent memories and messages - reduced limit to 10 each to ensure total of 20
    const [memories, messages] = await Promise.all([
      AgentsMemory.find({
        created_by: req.user.id
      })
        .sort({ created_at: -1 })
        .limit(10)
        .populate('created_by', 'name')
        .populate('bot_id', 'name')
        .lean(),
      ChannelMessage.find({
        bot_id: { $in: agentIds }
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .populate('agentId', 'name')
        .lean()
    ]);

    console.log(memories)
    console.log(messages)

    // Format activities
    const activities = [...memories, ...messages].map(item => {
      const timestamp = item.created_at || item.timestamp;
      const timeDiff = now - new Date(timestamp);

      // Format time difference
      let timeAgo;
      if (timeDiff < 60000) {
        timeAgo = `${Math.floor(timeDiff / 1000)} secs ago`;
      } else if (timeDiff < 3600000) {
        timeAgo = `${Math.floor(timeDiff / 60000)} mins ago`;
      } else if (timeDiff < 86400000) {
        timeAgo = `${Math.floor(timeDiff / 3600000)} hour ago`;
      } else {
        timeAgo = `${Math.floor(timeDiff / 86400000)} days ago`;
      }

      if (item.sentiment !== undefined) { // ChannelMessage
        // Determine sentiment category
        let sentimentCategory;
        if (item.sentiment >= 0.5) {
          sentimentCategory = 'Positive';
        } else if (item.sentiment <= -0.5) {
          sentimentCategory = 'Negative';
        } else {
          sentimentCategory = 'Neutral';
        }

        return {
          type: 'User Interaction',
          agentName: item.agentId?.name || 'Unknown Agent',
          agentId: item.agentId?._id || item.agentId,
          description: `Processed message from ${item.username || 'user'}`,
          details: {
            message: item.message,
            sentiment: sentimentCategory,
            positiveScore: Math.round(item.positiveSentiment * 100) + '%',
            negativeScore: Math.round(item.negativeSentiment * 100) + '%'
          },
          timeAgo
        };
      } else { // ConversationMemory

        return {
          type: 'Agent Response',
          agentName: `${item.bot_id.name}`,
          channelId: item.channel_id,
          description: 'Conversation interaction',
          details: {
            userMessage: item.user_message,
            agentReply: item.bot_reply
          },
          timeAgo
        };
      }
    });

    // Sort by time difference
    activities.sort((a, b) => {
      const aTime = parseInt(a.timeAgo.match(/\d+/)[0]);
      const bTime = parseInt(b.timeAgo.match(/\d+/)[0]);

      const unitWeight = {
        'secs': 1,
        'mins': 60,
        'hour': 3600,
        'days': 86400
      };

      const aUnit = a.timeAgo.split(' ')[1];
      const bUnit = b.timeAgo.split(' ')[1];

      return (aTime * unitWeight[aUnit]) - (bTime * unitWeight[bUnit]);
    });

    // Take only the 20 most recent activities
    const recentActivities = activities.slice(0, 20);

    res.json({
      totalActivities: recentActivities.length,
      activities: recentActivities
    });
  } catch (error) {
    console.error('Error fetching agents activity:', error);
    res.status(500).json({ error: 'Failed to fetch agents activity' });
  }
});

// Get all tasks for user
router.get('/tasks/all', async (req, res) => {
  try {
    const userAgents = await getAgentsByUserId(req.user.id);
    const agentIds = userAgents.map(agent => agent._id);

    const tasks = await AgentsTask.find({
      agentId: { $in: agentIds }
    })
      .populate('agentId', 'name avatar medium')
      .sort({ createdAt: -1 })
      .lean();

    const formattedTasks = tasks.map(task => ({
      id: task._id,
      agentName: task.agentId?.name || 'Unknown Agent',
      agentAvatar: task.agentId?.avatar,
      platform: task.agentId?.medium,
      taskName: task.taskName,
      taskType: task.taskType,
      status: task.status,
      parameters: task.parameters,
      startedAt: task.createdAt,
      completedAt: task.completedAt
    }));

    // Group tasks by status
    const groupedTasks = formattedTasks.reduce((acc, task) => {
      if (!acc[task.status]) {
        acc[task.status] = [];
      }
      acc[task.status].push(task);
      return acc;
    }, {});

    res.json({
      total: formattedTasks.length,
      tasks: groupedTasks
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Helper function to extract cryptocurrency symbol from question
function extractCryptoSymbol(question) {
  const cryptoKeywords = {
    'bitcoin': 'BTC',
    'btc': 'BTC',
    'ethereum': 'ETH',
    'eth': 'ETH',
    'cardano': 'ADA',
    'ada': 'ADA',
    'solana': 'SOL',
    'sol': 'SOL',
    'binance': 'BNB',
    'bnb': 'BNB',
    // Add more cryptocurrencies as needed
  };

  const questionLower = question.toLowerCase();
  for (const [keyword, symbol] of Object.entries(cryptoKeywords)) {
    if (questionLower.includes(keyword)) {
      return symbol;
    }
  }

  return 'BTC'; // Default to Bitcoin if no cryptocurrency is explicitly mentioned
}

// Helper function to get CoinGecko ID from symbol
async function getCoinGeckoId(symbol) {
  try {
    const list = await CoinGecko.coins.list();
    const coin = list.data.find(coin =>
      coin.symbol.toLowerCase() === symbol.toLowerCase()
    );
    return coin?.id;
  } catch (error) {
    console.error('Error getting CoinGecko ID:', error);
    return null;
  }
}

// Helper function to validate trading pair
async function isValidTradingPair(symbol, pair) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
    const symbols = response.data.symbols;
    return symbols.some(s => s.symbol === `${symbol}${pair}`);
  } catch (error) {
    console.error('Error checking trading pair:', error);
    return false;
  }
}

// Helper function to get trading data from multiple sources
async function getMultiExchangeData(cryptoInfo) {
  try {
    // Try Binance first
    const binancePair = `${cryptoInfo.symbol}USDT`;
    const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${binancePair}`);
    
    // Fetch additional market data from CoinGecko
    const marketData = await fetchMarketData(cryptoInfo.id);
    console.log({marketData})
    
    return {
      exchange: 'BINANCE',
      pair: binancePair,
      data: {
        ...response.data,
        marketCap: marketData?.marketCap || null,
        volume: marketData?.volume || null
      }
    };
  } catch (binanceError) {
    console.log(`Not found on Binance, trying other exchanges...`);
    
    // If Binance fails, try CoinGecko as fallback
    try {
      const coinId = cryptoInfo.id || await getCoinGeckoId(cryptoInfo.symbol);
      if (coinId) {
        const marketData = await fetchMarketData(coinId);
        const geckoData = await CoinGecko.coins.fetch(coinId, {
          localization: false,
          tickers: true,
          market_data: true,
          community_data: false,
          developer_data: false,
          sparkline: false
        });

        return {
          exchange: 'COINGECKO',
          pair: `${cryptoInfo.symbol}USD`,
          data: {
            price: geckoData.data.market_data.current_price.usd,
            marketCap: marketData?.marketCap,
            volume: marketData?.volume
          }
        };
      }
    } catch (geckoError) {
      console.error('Error fetching from CoinGecko:', geckoError);
    }
    
    throw new Error('Unable to find trading data on any supported exchange');
  }
}

// Add the new fetchMarketData function
async function fetchMarketData(coinId, currency = 'usd') {
  console.log({coinId})
  if (!coinId) return null;
  
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: currency,
        ids: coinId,
      }
    });

    const data = response.data[0];
    if (data) {
      return {
        marketCap: data.market_cap,
        volume: data.total_volume,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching market data:', error.message);
    return null;
  }
}

// Add conversation history map to store recent conversations per user
const userConversations = new Map();
const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Helper function to get and clean conversation history
function getConversationHistory(userId) {
  const now = Date.now();
  const conversation = userConversations.get(userId);
  
  if (!conversation || (now - conversation.lastUpdate > CONVERSATION_TIMEOUT)) {
    // Start new conversation if none exists or timeout exceeded
    const newConversation = {
      messages: [],
      lastUpdate: now,
      currentCrypto: null
    };
    userConversations.set(userId, newConversation);
    return newConversation;
  }
  
  conversation.lastUpdate = now;
  return conversation;
}

// ChartMaster GPT Analysis
router.post('/chartmaster/analyze', async (req, res) => {
  try {
    const { question } = req.body;
    const userId = req.user.id;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Get conversation history
    const conversation = getConversationHistory(userId);

    // Improved intent analysis prompt
    const intentAnalysis = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a crypto query analyzer. Your task is to determine if this is a question about cryptocurrency and extract any mentioned crypto symbols or names.

Rules:
1. Look for $ symbols followed by ticker (e.g., $BTC, $ETH)
2. Look for common crypto names (Bitcoin, Ethereum, etc.)
3. Consider context from previous messages if it's a follow-up question
4. If no specific crypto is mentioned but the question is about crypto in general, mark as crypto-related

Previous context: ${conversation.currentCrypto ? `User was discussing ${conversation.currentCrypto.name} (${conversation.currentCrypto.symbol})` : 'No previous context'}.

Return a JSON response with format:
{
  "isCryptoRelated": boolean,
  "isFollowUp": boolean,
  "cryptoMention": string or null (exact text of crypto mention, including $ if present),
  "confidence": number (0-1),
  "reasoning": string (brief explanation)
}`
        },
        ...conversation.messages.slice(-4), // Include last 4 messages for context
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(intentAnalysis.choices[0].message.content);
    console.log('Intent Analysis:', analysis);

    if (!analysis.isCryptoRelated) {
      return res.status(400).json({
        error: 'Non-crypto query',
        details: analysis.reasoning || 'The question does not appear to be related to cryptocurrency analysis.'
      });
    }

    // Extract crypto info with priority to $ symbols
    let cryptoInfo;
    if (analysis.isFollowUp && conversation.currentCrypto && !analysis.cryptoMention) {
      cryptoInfo = conversation.currentCrypto;
      console.log('Using previous crypto context:', cryptoInfo);
    } else {
      cryptoInfo = await extractCryptoInfo(analysis.cryptoMention || question, userId);
      conversation.currentCrypto = cryptoInfo;
      console.log('Extracted new crypto info:', cryptoInfo);
    }

    // Get trading data from available exchanges
    const exchangeData = await getMultiExchangeData(cryptoInfo);

    console.log(JSON.stringify(exchangeData, null, 2))
    
    // Update trading info with the exchange that worked
    const tradingInfo = {
      symbol: cryptoInfo.symbol,
      exchange: exchangeData.exchange,
      interval: 'D',
      pair: exchangeData.pair.replace(cryptoInfo.symbol, ''),
      analysisType: 'general',
      name: cryptoInfo.name
    };

    // Validate trading pair
    const isValid = await isValidTradingPair(tradingInfo.symbol, tradingInfo.pair);
    if (!isValid) {
      // Fallback to BTC if the trading pair is invalid
      tradingInfo.symbol = 'BTC';
      console.log(`Invalid trading pair, falling back to ${tradingInfo.symbol}${tradingInfo.pair}`);
    }

    try {
      const [
        ticker,
        dayStats,
        klines,
        depth
      ] = await Promise.all([
        axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${tradingInfo.symbol}${tradingInfo.pair}`)
          .catch(() => {
            console.log(`Failed to fetch ${tradingInfo.symbol}${tradingInfo.pair}, trying alternative pairs...`);
            // Try alternative pairs before falling back to BTC
            return axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${tradingInfo.symbol}BUSD`)
              .catch(() => axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`));
          }),
        axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${tradingInfo.symbol}${tradingInfo.pair}`)
          .catch(() => {
            console.log(`Failed to fetch 24hr stats for ${tradingInfo.symbol}${tradingInfo.pair}`);
            return axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${tradingInfo.symbol}BUSD`)
              .catch(() => axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`));
          }),
        axios.get(`https://api.binance.com/api/v3/klines?symbol=${tradingInfo.symbol}${tradingInfo.pair}&interval=1d&limit=30`)
          .catch(() => {
            console.log(`Failed to fetch klines for ${tradingInfo.symbol}${tradingInfo.pair}`);
            return axios.get(`https://api.binance.com/api/v3/klines?symbol=${tradingInfo.symbol}BUSD&interval=1d&limit=30`)
              .catch(() => axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=30`));
          }),
        axios.get(`https://api.binance.com/api/v3/depth?symbol=${tradingInfo.symbol}${tradingInfo.pair}&limit=10`)
          .catch(() => {
            console.log(`Failed to fetch depth for ${tradingInfo.symbol}${tradingInfo.pair}`);
            return axios.get(`https://api.binance.com/api/v3/depth?symbol=${tradingInfo.symbol}BUSD&limit=10`)
              .catch(() => axios.get(`https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=10`));
          })
      ]);

      // Log which pair was actually used
      console.log('Using trading pair:', ticker.config.url);

      console.log(JSON.stringify(ticker.data, null, 2))
      console.log(JSON.stringify(dayStats.data, null, 2))

      // Update tradingInfo with the actual pair that worked
      const actualUrl = new URL(ticker.config.url);
      const actualSymbol = new URLSearchParams(actualUrl.search).get('symbol');
      if (actualSymbol !== `${tradingInfo.symbol}${tradingInfo.pair}`) {
        console.log(`Switched to alternative pair: ${actualSymbol}`);
        // Update tradingInfo to reflect the actual pair being used
        tradingInfo.pair = actualSymbol.replace(tradingInfo.symbol, '');
      }

      // Get circulating supply from CoinGecko using the original symbol
      let circulatingSupply = null;
      let marketCap = null;
      const coinId = await getCoinGeckoId(cryptoInfo.symbol); // Use cryptoInfo instead of tradingInfo
      if (coinId) {
        try {
          const coinData = await CoinGecko.coins.fetch(coinId, {
            localization: false,
            tickers: false,
            market_data: true,
            community_data: false,
            developer_data: false,
            sparkline: false
          });


          console.log('CoinGecko data found for:', coinId);
          
          circulatingSupply = coinData.data.market_data.circulating_supply || 
                             coinData.data.market_data.total_supply ||
                             coinData.data.market_data.max_supply;

      

          marketCap = exchangeData.data.marketCap;

          if (!marketCap && circulatingSupply) {
            marketCap = exchangeData.data.marketCap;
          }
        } catch (error) {
          console.error('Error fetching CoinGecko data:', error);
        }
      }

      // Format market cap for display
      const formatMarketCap = (marketCap) => {
        if (!marketCap) return 'Unknown';
        if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
        if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
        return `$${marketCap.toFixed(2)}`;
      };

      const currentPrice = parseFloat(ticker.data.price);

      // Calculate support and resistance from order book
      const supports = depth.data.bids.slice(0, 3).map(bid => parseFloat(bid[0]));
      const resistances = depth.data.asks.slice(0, 3).map(ask => parseFloat(ask[0]));

      // Get ATH from historical data
      const ath = Math.max(...klines.data.map(k => parseFloat(k[2])));

      // Calculate sentiment based on price action and volume
      const priceChange = parseFloat(dayStats.data.priceChangePercent) || 0;
      const volumeChange = parseFloat(dayStats.data.volumeChangePercent) || 0;
      const sentimentScore = Math.min(Math.max(((priceChange + volumeChange) / 4) + 50, 100)); // Normalize to 0-100 scale and clamp

      // Customize prompt based on analysis type
      let focusedAnalysis = '';
      switch (tradingInfo.analysisType) {
        case 'price':
          focusedAnalysis = `
Focus on price action analysis:
- Current price levels and immediate price targets
- Price comparison with recent highs/lows
- Price patterns and formations
- Key price levels to watch`;
          break;
        case 'trend':
          focusedAnalysis = `
Focus on trend analysis:
- Current trend direction and strength
- Trend indicators (Moving Averages, MACD, RSI)
- Trend continuation/reversal signals
- Multiple timeframe trend alignment`;
          break;
        case 'volume':
          focusedAnalysis = `
Focus on volume analysis:
- Volume profile and patterns
- Volume comparison with averages
- Volume-price relationship
- Liquidity analysis`;
          break;
        case 'levels':
          focusedAnalysis = `
Focus on key levels:
- Major support and resistance levels
- Previous high/low levels
- Technical levels (Fibonacci, pivot points)
- Breakout/breakdown levels`;
          break;
      }

      // Update system prompt to focus on context
      const systemPrompt = `You are ChartMaster GPT, a cryptocurrency analysis expert. 
Use the conversation history to determine if this is a follow-up question about a previously discussed cryptocurrency.
If it is a follow-up, maintain the context and cryptocurrency from the previous discussion.
If it's a new question, analyze the new cryptocurrency mentioned.

Here is the current market data for ${tradingInfo.name} (${tradingInfo.symbol}):

Price: $${currentPrice.toString()} 
24h Change: ${priceChange.toFixed(2)}%
Market Cap: ${formatMarketCap(marketCap)}
24h Volume: $${(parseFloat(exchangeData.data.volume)).toString()}
ATH: $${ath.toString()}
Current Sentiment: ${sentimentScore.toFixed(1)}% Positive

${focusedAnalysis}

Please provide a comprehensive analysis including:

1. Technical Analysis
   - Current trend analysis based on the real-time price of $${currentPrice.toString()}
   - Support levels: ${supports.map(s => '$' + s.toString()).join(', ')}
   - Resistance levels: ${resistances.map(r => '$' + r.toString()).join(', ')}
   - Multiple timeframe analysis
   - Key technical indicators

2. Fundamental Analysis
   - Market cap analysis (currently ${formatMarketCap(marketCap)})
   - Volume analysis (24h volume: $${(parseFloat(dayStats.data.volume) * currentPrice).toString()})
   - Recent developments and news
   - On-chain metrics if relevant

3. Market Sentiment
   - Current market mood based on ${sentimentScore.toFixed(1)}% positive sentiment
   - Social media trends
   - News sentiment
   - Price impact analysis

4. Risk Management
   - Key levels to monitor
   - Stop-loss suggestions based on current price
   - Risk-reward scenarios
   - Position sizing recommendations

After analysis, ask if the user would like more specific information about any aspect.`;

      // Get GPT analysis with conversation history
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...conversation.messages,
          {
            role: "user",
            content: question
          }
        ],
        temperature: 0.7,
      });

      // Store the assistant's response in conversation history
      conversation.messages.push(
        { role: "assistant", content: completion.choices[0].message.content }
      );

      // Trim conversation history if it gets too long
      if (conversation.messages.length > 10) {
        conversation.messages = conversation.messages.slice(-10);
      }

      // Create trading pair symbol
      const tradingPair = `${tradingInfo.exchange}:${tradingInfo.symbol}${tradingInfo.pair}`;

      // Prepare response data
      const responseData = {
        success: true,
        markdown: completion.choices[0].message.content,
        marketData: {
          price: currentPrice,
          priceChange24h: priceChange,
          marketCap: marketCap,
          volume24h: parseFloat(exchangeData.data.volume),
          ath: ath,
          atl: Math.min(...klines.data.map(k => parseFloat(k[3]))),
          sentiment: sentimentScore,
          lastUpdated: new Date(dayStats.data.closeTime).toISOString(),
        },
        chartConfig: {
          symbol: tradingInfo.symbol,
          exchange: tradingInfo.exchange,
          interval: tradingInfo.interval,
          pair: tradingInfo.pair,
          tradingPair: tradingPair,
          alternativePairs: [
            `BINANCE:${tradingInfo.symbol}USDT`,
            `BINANCE:${tradingInfo.symbol}BUSD`,
            `BINANCE:${tradingInfo.symbol}USD`
          ]
        }
      };

      // Store chat history with correct field name
      await ChatHistory.create({
        user: userId,
        query: question,
        result: responseData
      });

      res.json(responseData);
    } catch (error) {
      console.error('Error fetching market data:', error);
      return res.status(400).json({
        error: 'Failed to fetch market data',
        details: `Unable to fetch data for ${tradingInfo.symbol}. Error: ${error.message}`
      });
    }
  } catch (error) {
    console.error('Error generating analysis:', error);
    res.status(500).json({
      error: 'Failed to generate analysis',
      details: error.message,
      suggestion: 'The requested cryptocurrency might not be available on major exchanges'
    });
  }
});



module.exports = router;
