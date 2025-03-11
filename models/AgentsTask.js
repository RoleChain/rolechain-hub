const mongoose = require('mongoose');

const AgentsTaskSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  taskName: {
    type: String,
    required: true
  },
  input: {
    type: String,
    required: true
  },
  output: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'failed'],
    default: 'pending'
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly','hourly'],
  },
  parameters: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastRun: Date,
  nextRun: Date
}, {
  timestamps: true
});

// Index for common queries
AgentsTaskSchema.index({ agentId: 1, status: 1 });
AgentsTaskSchema.index({ nextRun: 1, status: 1 });

module.exports = mongoose.model('AgentsTask', AgentsTaskSchema);
