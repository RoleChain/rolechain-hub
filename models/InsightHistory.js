const mongoose = require('mongoose');

const InsightHistorySchema = new mongoose.Schema({
  userId: String,
  channelId: String,
  prompt: String,
  result: String,
  timestamp: { type: Date, default: Date.now }
});

InsightHistorySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('InsightHistory', InsightHistorySchema);