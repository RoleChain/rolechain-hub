const mongoose = require('mongoose');

const AI_MODELS = {
    DEEPINFRA_LLAMA: {
      platform: 'deepinfra',
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
      endpoint: 'https://api.deepinfra.com/v1/openai/chat/completions',
      apiKeyEnv: 'DEEPINFRA_API_KEY'
    },
    OPENAI_GPT4: {
      platform: 'openai',
      model: 'gpt-4-turbo-preview',
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
      model: 'rolechain-default',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKeyEnv: 'ROLECHAIN_API_KEY'
    }
  };

const characterSchema = new mongoose.Schema({
  // Core Identity
  name: { type: String, required: true },
  bio: { type: String, required: true },
  avatar: String,
  topics: [String],
  areas_of_interest: [String],
  
  // Adding goals section
  goals: {
    primary_goal: { type: String, required: true },
    secondary_goals: [String],
    motivations: [String],
    current_objectives: [{
      description: String,
      priority: { type: String, enum: ['high', 'medium', 'low'] },
      status: { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active' }
    }]
  },
  
  // Personality & Behavior
  personality: {
    traits: [String],
    likes: [String],
    dislikes: [String],
    moral_alignment: String
  },

  // Communication Style
  speech: {
    voice_tone: String,
    phrases: [String],
    vocabulary_level: String,
    speaking_quirks: [String]
  },

  // Emotional System
  emotions: {
    current_mood: String,
    triggers: [{
      stimulus: String,
      reaction: String
    }]
  },

  // Memory & Context
  memory: {
    message_examples: [String],
    relationship_memory: {
      trust_level: Number,
      past_interactions: [String]
    }
  },

  ai_model: {
    type: String,
    enum: Object.keys(AI_MODELS),
    default: 'DEEPINFRA_LLAMA'
  },

  // Add custom API key field
  custom_api_key: {
    type: String,
    required: false // Explicitly mark as optional (though this is the default anyway)
  },

  // Background
  background: {
    backstory: String,
    beliefs: [String],
    values: [String]
  },

  // Adding dos and don'ts
  guidelines: {
    dos: [String],
    donts: [String],
    important_notes: [String]
  },

  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  is_public: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true,
  strict: false
});

// Keep only essential methods
characterSchema.methods = {
  generateResponse: async function(context) {
    // Response generation logic
  },

  updateMood: async function(interaction) {
    // Check if interaction contains a message
    if (!interaction?.message) return;

    // Process triggers and determine mood changes
    const matchedTriggers = this.emotions.triggers.filter(trigger => 
      interaction.message.toLowerCase().includes(trigger.stimulus.toLowerCase())
    );

    if (matchedTriggers.length > 0) {
      // Use the first matched trigger's reaction as the new mood
      this.emotions.current_mood = matchedTriggers[0].reaction;
      await this.save();
    }
  },

  processInteraction: async function(interaction) {
    if (!interaction?.message || !interaction?.userId) return;

    // Update relationship memory
    const memoryEntry = `[${new Date().toISOString()}] User ${interaction.userId}: ${interaction.message}`;
    
    // Add to past interactions, limit to last 50 interactions
    this.memory.relationship_memory.past_interactions.push(memoryEntry);
    if (this.memory.relationship_memory.past_interactions.length > 50) {
      this.memory.relationship_memory.past_interactions.shift();
    }

    // Adjust trust level based on interaction sentiment (simplified)
    const positiveWords = ['thank', 'good', 'great', 'awesome', 'appreciate'];
    const negativeWords = ['bad', 'awful', 'terrible', 'hate', 'dislike'];

    const message = interaction.message.toLowerCase();
    
    if (positiveWords.some(word => message.includes(word))) {
      this.memory.relationship_memory.trust_level = Math.min(
        (this.memory.relationship_memory.trust_level || 0) + 0.1,
        1
      );
    } else if (negativeWords.some(word => message.includes(word))) {
      this.memory.relationship_memory.trust_level = Math.max(
        (this.memory.relationship_memory.trust_level || 0) - 0.1,
        0
      );
    }

    await this.save();
  }
};

const Character = mongoose.model('Character', characterSchema);

// Keep basic CRUD operations
exports.getAll = async (userId) => {
  return await Character.find({ created_by: userId });
};

exports.create = async (data) => {
  const character = new Character(data);
  return await character.save();
};

exports.findByName = async (name) => {
  return await Character.findOne({ name: name });
};

exports.fetchCharacter = async (id) => {
  return await Character.findById(id);
};

exports.updateCharacter = async (id, data) => {
  return await Character.findByIdAndUpdate(id, data, { new: true });
};
