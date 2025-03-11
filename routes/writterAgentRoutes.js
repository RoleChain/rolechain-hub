const express = require('express');
const router = express.Router();
const axios = require('axios');
const AgentTask = require('../models/AgentsTask');

router.post('/generate-blog', async (req, res) => {
    let task;
    try {
        // Create agent task

       console.log(req.body);

        // Initial request to generate blog
        const generateResponse = await axios({
            method: 'post',
            url: 'http://13.50.17.48:8080/generate-blog',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': process.env.WRITER_API_KEY
            },
            data: {topic: req.body.query}
        });

        // Store external task ID and return immediately
        task = new AgentTask({
            agentId: req.query.agentId,
            taskName: 'generate_blog',
            input: JSON.stringify(req.body),
            status: 'in-progress',
            created_by: req.user.id,
            agentId: req.body.agentId,
            output: generateResponse.data.task_id
        });
        await task.save();
        console.log(task);
        
        return res.json({ 
            taskId: generateResponse.data.task_id,
            status: 'in-progress'
        });
        

    } catch (error) {
        console.error('Error in blog generation:', error);
        
        // Update task with failure
        if (task) {
            task.status = 'failed';
            task.output = error.message;
            await task.save();
        }
        
        res.status(500).json({ error: 'Failed to generate blog' });
    }
});

router.get('/blog-status/:taskId', async (req, res) => {
    try {
        console.log(req.params.taskId);
        const task = await AgentTask.findOne({ output: req.params.taskId });
        console.log(task);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const response = await axios({
            method: 'get',
            url: `http://13.50.17.48:8080/blog-status/${req.params.taskId}`,
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': process.env.WRITER_API_KEY
            }
        });

        console.log(response.data); 

        if (response.data.status === 'completed') {
            task.status = 'completed';
            task.output = JSON.stringify(response.data);
            await task.save();
            res.json(response.data);
        } else if (response.data.status === 'failed') {
            task.status = 'failed';
            task.output = JSON.stringify(response.data);
            await task.save();
            res.status(500).json(response.data);
        } else {
            res.json({ status: 'pending' });
        }
    } catch (error) {
        console.error('Error checking blog status:', error);
        res.status(500).json({ error: 'Failed to check blog status' });
    }
});

module.exports = router;
