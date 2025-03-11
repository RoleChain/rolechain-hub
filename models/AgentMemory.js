const mongoose = require('mongoose');

const ConversationMemorySchema = new mongoose.Schema({
  bot_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  chat_id: String,
  channel_id: { type: String, required: false },
  user_message: String,
  bot_reply: String,
  embedding: {
    type: [Number],
    required: true
  },
  created_at: { type: Date, default: Date.now },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
});

// Replace vector similarity search with text-based search
ConversationMemorySchema.statics.findSimilar = async function(message, limit = 5) {
  return this.find(
    { 
      $text: { $search: message }
    },
    {
      score: { $meta: "textScore" }
    }
  )
  .sort({ score: { $meta: "textScore" } })
  .limit(limit)
  .exec();
};

// Add text index on user_message field
ConversationMemorySchema.index({ user_message: 'text' });

const ConversationMemory = mongoose.model('ConversationMemory', ConversationMemorySchema);

// Export the model
module.exports = ConversationMemory;
