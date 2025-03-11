const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const summaryRoutes = require('./routes/summaryRoutes');
const agentRoutes = require('./routes/agentRoutes');
const characterRoutes = require('./routes/characterRoutes');
const Agent = require('./models/Agents');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const GoogleUser = require('./models/GoogleUser');
const crypto = require('crypto');
const Waitlist = require('./models/Waitlist');
const analyzerRoutes = require('./routes/analyzerRoutes');
// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

app.use(cors());
app.use(express.json());



app.post('/waitlist', async (req, res) => {
  try {
    const { name, email } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Create new waitlist entry
    const waitlistEntry = await Waitlist.create({
      name,
      email
    });

    res.status(201).json({
      success: true,
      message: 'Successfully added to waitlist',
      data: waitlistEntry
    });

  } catch (error) {
    console.error('Waitlist error:', error);
    res.status(500).json({ 
      error: 'Failed to add to waitlist',
      details: error.message 
    });
  }
});

// Passport config
passport.use(new GoogleStrategy({
    clientID: '238823306304-a19uktk0l17pjc73le8u2js5aga33nqf.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: "http://localhost:3002/auth/google/callback"
  },
  async function(_accessToken, _refreshToken, profile, cb) {
    try {
      // First, check if a GoogleUser exists
      let googleUser = await GoogleUser.findOne({ googleId: profile.id });
      
      if (!googleUser) {
        // Create a new User first with a generated API key
        const apiKey = crypto.randomBytes(32).toString('hex');
        const newUser = await User.create({
          apiKey,
          credits: 100 // Initial credits if desired
        });

        // Then create the GoogleUser with reference to User
        googleUser = await GoogleUser.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          displayName: profile.displayName,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          profilePicture: profile.photos?.[0]?.value,
          user: newUser._id
        });
      } else {
        // Update last login time
        googleUser.lastLogin = new Date();
        await googleUser.save();
      }

      // Populate the user reference
      await googleUser.populate('user');
      
      return cb(null, googleUser);
    } catch (error) {
      return cb(error);
    }
  }
));

// Routes

// Add Google auth routes
app.get('/auth/google',
  passport.initialize(),
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  })
);

app.get('/auth/google/callback', 
  passport.initialize(),
  passport.authenticate('google', { 
    session: false,
    failureRedirect: '/login' 
  }),
  (req, res) => {
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: req.user.googleId,
        id: req.user.user._id,
        email: req.user.email,
        type: 'google',
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Use encodeURIComponent to properly encode the token
    const encodedToken = encodeURIComponent(token);
    // Ensure clean redirect URL construction
    const redirectUrl = `${process.env.FRONTEND_URL}?token=${encodedToken}`;
    
    res.redirect(redirectUrl);
  }
);

app.use('/summary', summaryRoutes);

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    // add a case to check if the user isGated from the user model, if not so, return a 403 error, make a db call to check if the user isGated
    const users = await User.findOne({ _id: user.id });
    if (!users.isGated) {
      return res.status(403).json({ message: 'User is not gated' });
    }
    next();
  });
};


app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const googleUser = await GoogleUser.findOne({ googleId: req.user.userId })
      .populate('user');
    
    if (!googleUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: req.user.userId,
      email: googleUser.email,
      displayName: googleUser.displayName,
      firstName: googleUser.firstName,
      lastName: googleUser.lastName,
      profilePicture: googleUser.profilePicture,
      credits: googleUser.user.credits,
      apiKey: googleUser.user.apiKey,
      isGated: googleUser.user.isGated || false  // Added isGated status
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Error fetching user details' });
  }
});
app.use('/agents', authenticateToken, agentRoutes);
app.use('/characters', authenticateToken, characterRoutes);
app.use('/analyzer', authenticateToken, analyzerRoutes);
app.use('/research', authenticateToken, require('./routes/researchAgent')); 
app.use('/news', authenticateToken, require('./routes/newsAgent')); 
app.use('/task', authenticateToken, require('./routes/taskRoutes')); 
app.use('/writter', authenticateToken, require('./routes/writterAgentRoutes')); 
app.use('/youtube', authenticateToken, require('./routes/youtubeRoutes')); 

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

async function cleanup() {
  console.log('Cleaning up...');
  try {
    // Fetch all active agents from the database
    const activeAgents = await Agent.getAll({ status: 'active' });
    
    // Stop each active bot
    for (const agent of activeAgents) {
      console.log(`Stopping bot ${agent._id}`);
      if (agent.botProcess) {
        agent.botProcess.kill();
      }
      // Update agent status to inactive
      await Agent.updateAgent(agent._id, { status: 'inactive' });
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  process.exit(0);
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
