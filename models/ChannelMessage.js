const mongoose = require('mongoose');

const ChannelMessageSchema = new mongoose.Schema({
  channelId: String,
  messageId: String,
  message: String,
  username: String,
  firstName: String,
  lastName: String,
  timestamp: Date,
  sentiment: Number,
  positiveSentiment: Number,
  negativeSentiment: Number,
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: false },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentTask', required: false },
});

ChannelMessageSchema.index({ channelId: 1, timestamp: 1 });

module.exports = mongoose.model('ChannelMessage', ChannelMessageSchema);