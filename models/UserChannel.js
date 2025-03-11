const mongoose = require('mongoose');

const UserChannelSchema = new mongoose.Schema({
  channelId: String,
  accessHash: String,
  title: String,
  username: String,

  // Channel statistics
  totalMembers: Number,
  totalMessages: Number,
  unreadCount: Number,
  adminsCount: Number,
  kickedCount: Number,
  bannedCount: Number,
  onlineCount: Number,

  // Channel settings
  about: String,
  slowmodeSeconds: Number,
  slowmodeNextSendDate: Number,
  hiddenPrehistory: Boolean,

  // Permissions and capabilities
  isAdmin: { type: Boolean, default: false },
  canViewParticipants: Boolean,
  canSetUsername: Boolean,
  canSetStickers: Boolean,
  canViewStats: Boolean,
  canSetLocation: Boolean,

  // Related chats
  linkedChatId: Number,

  // Voice chat info
  hasActiveVoiceChat: Boolean,
  voiceChatParticipantsCount: Number,

  // Photo information
  photo: {
    photoId: String,
    photoDcId: Number,
    photoStrippedThumb: Buffer,
    photoSmall: {
      url: String,
      width: Number,
      height: Number,
      size: Number
    },
    photoBig: {
      url: String,
      width: Number,
      height: Number,
      size: Number
    },
    lastUpdated: { type: Date, default: Date.now }
  },

  // System fields
  lastFetched: { type: Date, default: Date.now },
  statsDcId: Number,

  // Users array
  users: [{
    userId: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    lastScanned: Date
  }]
});

UserChannelSchema.index({ channelId: 1 }, { unique: true });

module.exports = mongoose.model('UserChannel', UserChannelSchema);