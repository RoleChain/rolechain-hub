const mongoose = require('mongoose');

const TelegramUserSchema = new mongoose.Schema({
  userId: String,
  authKey: String,
  dcId: Number,
  telegramUserId: Number,
  lastLogin: { type: Date, default: Date.now },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TelegramUser', TelegramUserSchema);