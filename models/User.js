const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  apiKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  credits: {
    type: Number,
    default: 0,
    min: 0
  },
  chatLimit: {
    type: Number,
    default: 10,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isGated: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
