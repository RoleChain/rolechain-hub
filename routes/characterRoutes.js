const express = require('express');
const router = express.Router();
const Character = require('../models/Character');



// Get all characters
router.get('/', async (req, res) => {
  try {
    const characters = await Character.getAll(req.user.id);
    res.json(characters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new character
router.post('/', async (req, res) => {
  try {
    console.log(req.user);
    const character = await Character.create({
      ...req.body,
      created_by: req.user.id
    });
    res.status(201).json(character);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get character by name
router.get('/name/:name', async (req, res) => {
  try {
    const character = await Character.findByName(req.params.name);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }
    res.json(character);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update character by ID
router.put('/:id', async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updated_by: req.user.id
    };
    
    // If custom_api_key exists in the payload, set it
    if (req.body.custom_api_key) {
      updateData.custom_api_key = req.body.custom_api_key;
    }
    
    const character = await Character.updateCharacter(req.params.id, updateData);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }
    res.json(character);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete character by ID
router.delete('/:id', async (req, res) => {
  try {
    const character = await Character.deleteCharacter(req.params.id);
    if (!character) {
      return res.status(404).json({ message: 'Character not found' });
    }
    res.json({ message: 'Character deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Find characters by personality traits
router.get('/personality/:traits', async (req, res) => {
  try {
    const traits = req.params.traits.split(',');
    const characters = await Character.findByPersonality(traits);
    res.json(characters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Find characters by mood
router.get('/mood/:mood', async (req, res) => {
  try {
    const characters = await Character.findByMood(req.params.mood);
    res.json(characters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



module.exports = router;
