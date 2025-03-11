const TelegramBot = require('node-telegram-bot-api');
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const ConversationMemory  = require('../models/AgentMemory');
const  Character  = require('../models/Character');
const axios = require('axios');
const Sentiment = require('sentiment');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ChannelMessage = require('../models/ChannelMessage');
const Task = require('../models/AgentsTask');
const dotenv = require('dotenv');
dotenv.config();

const sentiment = new Sentiment();
const AI_MODELS = {
    DEEPINFRA_LLAMA: {
      platform: 'deepinfra',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      endpoint: 'https://api.deepinfra.com/v1/openai/chat/completions',
      apiKeyEnv: 'DEEPINFRA_API_KEY'
    },
    OPENAI_GPT4: {
      platform: 'openai',
      model: 'gpt-4',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKeyEnv: 'OPENAI_API_KEY'
    },
    MISTRAL: {
      platform: 'mistral',
      model: 'mistral-large-latest',
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      apiKeyEnv: 'MISTRAL_API_KEY'
    },
    GROQ: {
      platform: 'groq',
      model: 'mixtral-8x7b-32768',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      apiKeyEnv: 'GROQ_API_KEY'
    },
    GEMINI: {
      platform: 'google',
      model: 'gemini-pro',
      endpoint: 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
      apiKeyEnv: 'GOOGLE_API_KEY'
    },
    ROLECHAIN: {
      platform: 'rolechain',
      model: 'gpt-4o',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKeyEnv: 'ROLECHAIN_API_KEY'
    }
  };

process.on('message', async (message) => {
  if (message.type === 'start') {
    const { agent, character } = message.data;
    
    try {
      // Establish MongoDB connection
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('Worker MongoDB connection established');

      if (agent.platform === 'telegram') {
        initializeTelegramBot(agent, character);
      } else if (agent.platform === 'discord') {
        initializeDiscordBot(agent, character);
      }
      
      process.send({ type: 'started', agentId: agent.id });
    } catch (error) {
      process.send({ type: 'error', error: error.message });
      process.exit(1);
    }
  } else if (message.type === 'task') {
    try {
      const { task, parameters, agentId } = message.data;
      
      // Acknowledge task receipt
      process.send({ 
        type: 'task_received', 
        agentId,
        task
      });

      // No need to create task - just validate it exists
      const existingTask = await Task.findOneAndUpdate({_id: task._id}, {status: 'in-progress'});
      

      if (!existingTask) {
        throw new Error('Task not found in database');
      }

    } catch (error) {
      process.send({ 
        type: 'task_error', 
        error: error.message,
        agentId: message.data.agentId 
      });
    }
  }
});

// Add cleanup on worker exit
process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

const getRandomProxy = (proxyList) => {
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    const proxyString = proxyList[randomIndex];
    const [host, port, username, password] = proxyString.split(':');
    
    return {
      host,
      port: parseInt(port),
      username,
      password
    };
};

const proxyList = []

function initializeTelegramBot(agent, character) {
  const proxyConfig = getRandomProxy(proxyList);
  
  // Create HTTP proxy agent with the correct format
  const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
  const httpAgent = new HttpsProxyAgent(proxyUrl);

  const bot = new TelegramBot(agent.token, { 
    polling: true,
    request: {
      agent: httpAgent
    }
  });

  // Update polling error handler to use HTTP proxy
  bot.on('polling_error', async (error) => {
    console.error('[Telegram] Polling error:', error.message);
    if (error.code === 'EFATAL' || error.message.includes('tunneling')) {
      console.log('[Telegram] Attempting to reconnect with new proxy...');
      
      await bot.stopPolling();
      
      const newProxyConfig = getRandomProxy(proxyList);
      const newProxyUrl = `http://${newProxyConfig.username}:${newProxyConfig.password}@${newProxyConfig.host}:${newProxyConfig.port}`;
      const newHttpAgent = new HttpsProxyAgent(newProxyUrl);
      
      bot.options.request.agent = newHttpAgent;
      
      setTimeout(() => {
        bot.startPolling();
      }, 5000);
    }
  });
  
  bot.on('message', async (msg) => {
    try {
      // Immediately check if we should process this message
      if (msg.chat.type !== 'private') {  // If not a private chat
        // Ensure bot username is available
        if (!bot.options.username) {
          const botInfo = await bot.getMe();
          bot.options.username = botInfo.username;
        }
        
        // Check for mention using entities
        const isBotMentioned = msg.entities?.some(entity => 
          entity.type === 'mention' && 
          msg.text.slice(entity.offset, entity.offset + entity.length) === `@${bot.options.username}`
        );

        const isReplyToBot = msg.reply_to_message?.from?.id === bot.options.id;

        // If there's text, check for active task regardless of mention
        if (msg.text) {
          try {  
            if (agent.workflow === 'telegram_sentiment') {
              const sentimentResult = sentiment.analyze(msg.text);
              console.log(sentimentResult)
              
              await ChannelMessage.create({
                channelId: msg.chat.id,
                messageId: msg.message_id,
                message: msg.text,
                username: msg.from?.username || 'Unknown',
                firstName: msg.from?.first_name || '',
                lastName: msg.from?.last_name || '',
                timestamp: new Date(msg.date * 1000),
                sentiment: sentimentResult.score,
                positiveSentiment: sentimentResult.positive.length,
                negativeSentiment: sentimentResult.negative.length,
                agentId: agent._id,
                taskId: currentTask._id
              });
            }
          } catch (taskError) {
            console.error('[Telegram] Task checking error:', taskError);
          }
        }

        if(!isBotMentioned) {
          return;
        }

        // Exit early if not mentioned or replied to in a group
        if (!isBotMentioned && !isReplyToBot) {
          return;
        }

        // Remove the mention from the message text if present
        if (isBotMentioned) {
          msg.text = msg.text.replace(`@${bot.options.username}`, '').trim();
        }
      }

      // Skip empty messages
      if (!msg.text) return;
      await bot.sendChatAction(msg.chat.id, 'typing');
      const memoryContext = await fetchLastConversations(agent.id, msg.chat.id);
      const reply = await generateReply(msg.text, character, memoryContext, agent.id, msg.chat.id);
      
      // Handle both single string and array responses
      if (Array.isArray(reply)) {
        // Send each chunk as a separate message
        for (const chunk of reply) {
          await bot.sendMessage(msg.chat.id, chunk, {
            reply_to_message_id: msg.message_id
          });
        }
        // Store the complete conversation by joining the chunks
        await storeConversation(agent._id, msg.chat.id, msg.text, reply.join(' '), agent.created_by);
      } else {
        await bot.sendMessage(msg.chat.id, reply, {
          reply_to_message_id: msg.message_id
        });
        await storeConversation(agent._id, msg.chat.id, msg.text, reply, agent.created_by);
      }
      
      console.log(agent)
    } catch (error) {
      console.error('[Telegram] Message handling error:', error);
    }
  });

  return bot;
}

function initializeDiscordBot(agent, character) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.on('messageCreate', async (message) => {
    if (!message.author.bot) {
      try {
        const chatId = message.channel.id;
        const memoryContext = await fetchLastConversations(agent.id, chatId);
        const reply = await generateReply(message.content, character, memoryContext, agent.id, chatId);
        await message.reply(reply);
        await storeConversation(agent.id, chatId, message.content, reply);
      } catch (error) {
        console.error('[Discord] Error:', error);
      }
    }
  });

  client.login(agent.token);
}

// Generate Embedding for Text
async function generateEmbedding(text) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        model: 'text-embedding-ada-002',
        input: text
      },
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      }
    );
    return response.data.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

// Fetch Character Details
async function fetchCharacter(characterId) {
  try {
    const character = await Character.findById(characterId);
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found.`);
    }
    return character;
  } catch (error) {
    console.error("Error fetching character:", error);
    throw error;
  }
}

// Fetch Last Conversations
async function fetchLastConversations(botId, chatId) {
  try {
    // Check if we're connected to MongoDB
    
    const conversations = await ConversationMemory
      .find({ botId, chatId })
      .sort({ createdAt: -1 })
      .limit(10)
      .maxTimeMS(5000); // Add timeout for the query
    
    return conversations
      .map(conv => `User: ${conv.userMessage}\nBot: ${conv.botReply}`)
      .join("\n");
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return ""; // Return empty string on error to allow conversation to continue
  }
}

// Fetch Similar Topics using vector similarity
async function fetchSimilarTopics(botId, chatId, newMessageEmbedding, threshold = 0.8) {
  try {
    const similarMessages = await ConversationMemory.aggregate([
      {
        $search: {
          index: "vector_index",
          knnBeta: {
            vector: newMessageEmbedding,
            path: "embedding",
            k: 10
          }
        }
      },
      {
        $match: {
          botId: botId,
          chatId: chatId
        }
      },
      {
        $project: {
          userMessage: 1,
          similarity: { $meta: "vectorSearchScore" }
        }
      }
    ]).exec(); // Remove maxTimeMS and use exec()

    return similarMessages
      .filter(msg => msg.similarity >= threshold)
      .map(msg => ({
        message: msg.userMessage,
        similarity: msg.similarity
      }));
  } catch (error) {
    console.error("Error fetching similar topics:", error);
    return [];
  }
}

// Store Conversation with Embedding
async function storeConversation(botId, chatId, userMessage, botReply, created_by) {
  try {
    const embedding = await generateEmbedding(userMessage);

    await ConversationMemory.create({
      bot_id: botId,
      chat_id: chatId,
      user_message: userMessage,
      bot_reply: botReply,
      embedding,
      created_at: new Date(),
      created_by: created_by
    });

    console.log("Conversation stored in memory with embedding.");
  } catch (error) {
    console.error("Error storing conversation in memory:", error);
  }
}

// Generate Reply (unchanged as it doesn't interact with DB directly)
async function generateReply(userMessage, character, memoryContext = "", botId, chatId) {
  if (!character || !character.name || !character.ai_model) {
    console.error("Character data is incomplete:", character);
    return "Character information is incomplete. Unable to generate a reply.";
  }

  const modelConfig = AI_MODELS[character.ai_model];
  if (!modelConfig) {
    console.error("Invalid AI model configuration:", character.ai_model);
    return "AI model configuration is invalid. Unable to generate a reply.";
  }

  const embedding = await generateEmbedding(userMessage);
  const similarTopics = await fetchSimilarTopics(botId, chatId, embedding);
  
  // Process emotional triggers and goals
  let currentMood = character.emotions?.current_mood || 'neutral';
  const triggers = character.emotions?.triggers || [];
  for (const trigger of triggers) {
    if (userMessage.toLowerCase().includes(trigger.stimulus.toLowerCase())) {
      currentMood = trigger.reaction;
      break;
    }
  }

  // Build memory context with similar topics
  const memorySection = [
    memoryContext,
    ...similarTopics.map(topic => `Similar past interaction: ${topic.message}`),
    ...(character.memory?.message_examples || []),
    ...(character.memory?.relationship_memory?.past_interactions || [])
  ].filter(Boolean).join("\n");

  // Build goals and objectives context
  const goalsSection = [
    `Primary Goal: ${character.goals?.primary_goal || 'Not specified'}`,
    character.goals?.secondary_goals?.length ? `Secondary Goals: ${character.goals.secondary_goals.join(', ')}` : '',
    character.goals?.motivations?.length ? `Motivations: ${character.goals.motivations.join(', ')}` : '',
    character.goals?.current_objectives?.length ? 
      `Current Objectives: ${character.goals.current_objectives
        .filter(obj => obj.status === 'active')
        .map(obj => `[${obj.priority}] ${obj.description}`)
        .join(', ')}` : ''
  ].filter(Boolean).join("\n");

  // Build expertise context
  const expertiseContext = [
    ...(character.topics || []),
    ...(character.areas_of_interest || [])
  ].join(", ");

  const characterContext = `
    Role: You are "${character.name}," a specialized ${expertiseContext ? `expert in ${expertiseContext}` : 'assistant'}.

    Core Purpose and Goals:
    ${goalsSection}

    Core Identity:
    ${character.bio}
    
    Personality Blueprint:
    ${character.personality?.traits ? `Core traits: ${character.personality.traits.join(', ')}` : ''}
    ${character.personality?.likes ? `Likes: ${character.personality.likes.join(', ')}` : ''}
    ${character.personality?.dislikes ? `Dislikes: ${character.personality.dislikes.join(', ')}` : ''}
    ${character.personality?.moral_alignment ? `Moral framework: ${character.personality.moral_alignment}` : ''}

    Communication Parameters:
    ${character.speech?.voice_tone ? `Tone: ${character.speech.voice_tone}` : ''}
    ${character.speech?.vocabulary_level ? `Language level: ${character.speech.vocabulary_level}` : ''}
    ${character.speech?.speaking_quirks ? `Unique mannerisms: ${character.speech.speaking_quirks.join(', ')}` : ''}
    ${character.speech?.phrases ? `Signature phrases: ${character.speech.phrases.join(', ')}` : ''}

    Current State:
    - Emotional state: ${currentMood}
    - Trust level with user: ${character.memory?.relationship_memory?.trust_level || 'neutral'}

    Foundational Background:
    ${character.background?.backstory || ''}
    ${character.background?.beliefs ? `Core beliefs: ${character.background.beliefs.join(', ')}` : ''}
    ${character.background?.values ? `Guiding values: ${character.background.values.join(', ')}` : ''}

    Relevant Context:
    ${memorySection}

    User Message: "${userMessage}"

    Instructions:
    1. Maintain consistent character alignment with your role, personality, and current emotional state (${currentMood})
    2. Leverage your expertise in ${expertiseContext || 'your field'}
    3. Work towards your primary goal: ${character.goals?.primary_goal || 'helping the user'}
    4. Naturally incorporate your speaking style and mannerisms
    5. Keep responses concise (under 250 characters when possible)
    6. Split longer responses into 2-3 shorter messages if needed
    7. Consider trust level and past interactions in your response tone
  `;

  try {
    const apiKey = character.custom_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(`API key not found for ${modelConfig.platform}`);
    }

    // Add explicit instructions for shorter responses
    const contextWithLengthLimit = characterContext + "\nIMPORTANT: Keep your response concise and under 200 characters when possible. If a longer response is necessary, split it into 2-3 shorter messages.";

    const response = await axios.post(
      modelConfig.endpoint,
      {
        model: modelConfig.model,
        messages: [{ role: "user", content: contextWithLengthLimit }],
        max_tokens: 150,
        temperature: 0.7
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` }
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      let reply = response.data.choices[0].message.content.trim();
      console.log(reply)
      // Split long replies into chunks of ~200 characters at sentence boundaries
      if (reply.length > 200) {
        const sentences = reply.match(/[^.!?]+[.!?]+/g) || [reply];
        let chunks = [];
        let currentChunk = '';
        
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length <= 200) {
            currentChunk += sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());

        console.log(chunks)
        
        // Return array of chunks if multiple, otherwise single string
        return chunks.length > 1 ? chunks : chunks[0];
      }

      // Update character mood
      try {
        await Character.findByIdAndUpdate(
          { _id: character._id },
          { $set: { 'emotions.current_mood': currentMood } }
        );
      } catch (error) {
        console.error("Error updating character mood:", error);
      }
      
      return reply;
    } else {
      console.error("Unexpected API response:", response.data);
      return "I couldn't generate a response. Please try again.";
    }
  } catch (error) {
    console.error("Error generating reply:", error.response?.data || error.message);
    return "I'm currently experiencing technical issues. Please try again later.";
  }
} 