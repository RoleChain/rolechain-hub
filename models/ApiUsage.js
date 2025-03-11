const mongoose = require('mongoose');

const ApiUsageSchema = new mongoose.Schema({
  userId: String,
  date: { type: Date, default: Date.now },
  count: { type: Number, default: 0 }
});

ApiUsageSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ApiUsage', ApiUsageSchema);