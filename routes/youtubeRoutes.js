const express = require('express');
const router = express.Router();
const axios = require('axios');
const AgentTask = require('../models/AgentsTask');


router.get('/video-info', async (req, res) => {
    let task;  // Declare task outside try block
    try {
        if (!req.query.agentId) {
            throw new Error('agentId is required');
        }
        if (!req.user) {
            throw new Error('User authentication required');
        }

        // Create agent task
        task = new AgentTask({
            agentId: req.query.agentId,
            taskName: 'fetch_youtube_video_info',
            input: req.query.url,
            status: 'in-progress',
            created_by: req.user.id,
            output: 'Pending' // Initialize output
        });
        await task.save();

        const response = await axios({
            method: 'get',
            url: 'http://13.50.17.48:8080/youtube-video-info',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': process.env.YOUTUBE_MCP_KEY
            },
            params: {
                url: req.query.url
            },
            data: {
                itag: req.body.itag,
                url: req.body.url
            }
        });

        // Update task with success
        task.status = 'completed';
        task.output = JSON.stringify(response.data);
        await task.save();

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching video info:', error);
        
        // Update task with failure
        if (task) {
            task.status = 'failed';
            task.output = error.message;
            await task.save();
        }
        
        res.status(500).json({ error: 'Failed to fetch video info' });
    }
});

router.get('/audio-info', async (req, res) => {
    let task;  // Declare task outside try block
    try {
        if (!req.query.agentId) {
            throw new Error('agentId is required');
        }
        if (!req.user) {
            throw new Error('User authentication required');
        }

        // Create agent task
        task = new AgentTask({
            agentId: req.query.agentId,
            taskName: 'fetch_youtube_audio_info',
            input: req.query.url,
            status: 'in-progress',
            created_by: req.user.id,
            output: 'Pending' // Initialize output
        });
        await task.save();

        const response = await axios({
            method: 'get',
            url: 'http://13.50.17.48:8080/youtube-audio-info',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': process.env.YOUTUBE_MCP_KEY
            },
            params: {
                url: req.query.url
            },
            data: {
                itag: req.body.itag,
                url: req.body.url
            }
        });

        // Update task with success
        task.status = 'completed';
        task.output = JSON.stringify(response.data);
        await task.save();

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching audio info:', error);
        
        // Update task with failure
        if (task) {
            task.status = 'failed';
            task.output = error.message;
            await task.save();
        }
        
        res.status(500).json({ error: 'Failed to fetch audio info' });
    }
});

module.exports = router;


