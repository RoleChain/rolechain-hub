const express = require('express');
const router = express.Router();
const AgentsTask = require('../models/AgentsTask');

// Create a new task
router.post('/', async (req, res) => {
  try {
    const task = new AgentsTask({
      ...req.body,
      created_by: req.user._id
    });
    await task.save();
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all tasks (with optional filtering)
router.get('/', async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.agentId) filters.agentId = req.query.agentId;
    
    const tasks = await AgentsTask.find(filters)
      .populate('agentId', 'name')
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task by ID
router.get('/:id', async (req, res) => {
  try {
    const task = await AgentsTask.findById(req.params.id)
      .populate('agentId', 'name');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task
router.patch('/:id', async (req, res) => {
  try {
    const task = await AgentsTask.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const task = await AgentsTask.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get upcoming tasks
router.get('/schedule/upcoming', async (req, res) => {
  try {
    const tasks = await AgentsTask.find({
      nextRun: { $gte: new Date() },
      status: { $in: ['pending', 'in-progress'] }
    })
    .populate('agentId', 'name')
    .sort({ nextRun: 1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
