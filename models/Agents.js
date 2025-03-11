const mongoose = require('mongoose');

// Define the Agent Schema
const agentSchema = new mongoose.Schema({
  character_id: String,
  platform: String,
  token: String,
  bot_name: String,
  bot_id: String,
  active: { type: Boolean, default: false },
  workflow: {
    type: String,
    enum: [
      'telegram_sentiment',
      'telegram_moderator',
      'research_analyst',
      'crypto_analyzer',
      'news_analyst',
      'content_writer',
      'youtube_downloader',
      'mp3_converter',
      'plagiarism_checker',
      'website_scraper',
      'basic_telegram_agent',
      'basic_discord_agent'
    ],
    required: false
  },
  avatar: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  bio: {
    type: String,
    required: true
  },
  medium: {
    type: String,
    enum: ['x', 'discord', 'telegram', 'api', 'marketplace'],
    required: true
  },
  commands: [{
    name: String,
    description: String,
    platform_type: {
      type: String,
      enum: ['slash_command', 'telegram_command'],
      required: true
    },
    options: [{
      name: String,
      description: String,
      type: String,
      required: Boolean
    }]
  }],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

// Create the model
const Agent = mongoose.model('Agent', agentSchema);

// Export methods
exports.getAgentById = async (agentId) => {
  return await Agent.findById(agentId);
};

exports.getAll = async () => {
  return await Agent.find({}); 
};

exports.getAgentsByUserId = async (userId) => {
  return await Agent.find({ created_by: userId });
};

exports.addAgent = async ({ character_id, platform, token, bot_name, bot_id, medium, avatar, name, bio, created_by, workflow}) => {
  console.log(medium)
  const newAgent = new Agent({
    character_id,
    platform,
    token,
    bot_name,
    bot_id,
    medium,
    avatar,
    name,
    bio,
    created_by: created_by,
    workflow: workflow,
    active: true
  });
  return await newAgent.save();
};

exports.deleteAgent = async (agentId) => {
  return await Agent.findByIdAndDelete(agentId);
};

exports.updateAgent = async (agentId, updates) => {
  return await Agent.findByIdAndUpdate(agentId, updates, { new: true });
};
