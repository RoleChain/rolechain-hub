const express = require('express');
const jwt = require('jsonwebtoken');
const createMTProto = require('../utils/mtproto');
const { Configuration, OpenAIApi } = require('openai');
const mongoose = require('mongoose');
const cron = require('node-cron');
const Sentiment = require('sentiment'); // Add sentiment analysis library
const dotenv = require('dotenv');
const NodeCache = require('node-cache');
const axios = require('axios');
const OpenAI = require('openai');
const { createTelegramClient, loginWithPhone, verifyCode } = require('../utils/mtproto');
const cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const { Api } = require('telegram');
const UserChannel = require('../models/UserChannel');
const ApiUsage = require('../models/ApiUsage');
const InsightHistory = require('../models/InsightHistory');
const ChannelMessage = require('../models/ChannelMessage');
const TelegramUser = require('../models/TelegramUser');

dotenv.config();
const router = express.Router();


 

// Sentiment analysis setup
const sentiment = new Sentiment();

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET;

// Add a connection pool to manage Telegram clients
const clientPool = new Map();

// Add helper function to manage client connections
const getOrCreateClient = async (userId) => {
  try {
    // Check if we have an existing client
    console.log(clientPool);
    if (clientPool.has(userId)) {
      const existingClient = clientPool.get(userId);
      try {
        // Test if client is still valid
        await existingClient.getMe();
        return existingClient;
      } catch (error) {
        // Remove invalid client
        clientPool.delete(userId);
      }
    }

    // Create new client
    const client = await createTelegramClient(userId);
    console.log(client);
    clientPool.set(userId, client);
    return client;
  } catch (error) {
    console.error(`Error creating Telegram client for ${userId}:`, error);
    throw new Error('Failed to establish Telegram connection');
  }
};

// Modified callTelegram helper with correct parameter formatting
const callTelegram = async (userId, method, params) => {
  console.log(userId, method, params)
  let retries = 3;
  while (retries > 0) {
    try {
      const client = await getOrCreateClient(userId);

      console.log(client);

      // Use client.invoke() with the appropriate API method
      if (method === 'messages.getDialogs') {
        return await client.invoke(new Api.messages.GetDialogs({
          offsetDate: 0,
          offsetId: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          limit: params.limit || 100,
          hash: 0
        }));
      } else if (method === 'channels.getFullChannel') {
        return await client.invoke(new Api.channels.GetFullChannel({
          channel: new Api.InputChannel({
            channelId: params.channel_id,
            accessHash: params.access_hash
          })
        }));
      } else if (method === 'messages.getHistory') {
        // Fix: Ensure proper type conversion and validation
        const channelId =params.channel_id;
        const accessHash = params.access_hash;
        
        if (!channelId || !accessHash) {
          throw new Error('Invalid channel_id or access_hash');
        }

        const peer = new Api.InputPeerChannel({
          channelId: channelId,
          accessHash: accessHash
        });

        return await client.invoke(new Api.messages.GetHistory({
          peer: 'magiccraftgamechat',
          limit: params.limit || 100,
          offsetId: params.offset_id || 0,
          offsetDate: params.offset_date || 0,
          addOffset: params.add_offset || 0,
          maxId: params.max_id || 0,
          minId: params.min_id || 0,
        }));
      }

      throw new Error(`Unsupported method: ${method}`);
    } catch (error) {
      retries--;

      // Handle specific error cases
      if (error.message?.includes('AUTH_KEY_UNREGISTERED') ||
        error.message?.includes('SESSION_REVOKED')) {
        // Clear invalid client
        clientPool.delete(userId);
        // Remove user auth data
        await TelegramUser.deleteOne({ userId });
        throw new Error('Authentication expired. Please log in again.');
      }

      if (error.message?.includes('FLOOD_WAIT_')) {
        const waitTime = parseInt(error.message.match(/\d+/)[0]);
        await sleep(waitTime * 1000);
        continue;
      }

      if (error.message?.includes('CHANNEL_INVALID')) {
        console.error('Invalid channel:', params);
        throw new Error('Channel not found or inaccessible');
      }

      if (retries === 0) {
        throw error;
      }

      // Wait before retry
      await sleep(1000);
    }
  }
};



// Add cleanup interval for inactive clients
setInterval(() => {
  const maxInactiveTime = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();

  for (const [userId, client] of clientPool.entries()) {
    if (now - client.lastUsed > maxInactiveTime) {
      client.destroy();
      clientPool.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Modified helper function for Telegram API calls with rate limiting and caching
const callTelegramWithCache = async (userId, method, params) => {
  const cacheKey = `${method}:${JSON.stringify(params)}`;
  const cachedResponse = cache.get(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await callTelegram(userId, method, params);
    cache.set(cacheKey, response);
    await sleep(2000); // 2 second delay between calls
    return response;
  } catch (error) {
    if (error.message?.includes('FLOOD_WAIT_')) {
      const waitTime = parseInt(error.message.match(/\d+/)[0]);
      console.log(`Rate limited. Waiting ${waitTime} seconds...`);
      await sleep(waitTime * 1000);
      return callTelegramWithCache(userId, method, params);
    }
    throw error;
  }
};

// Modified cacheMiddleware helper
const cacheMiddleware = (key) => {
  return async (req, res, next) => {
    try {
      // Extract userId from token
      const token = req.headers.authorization?.split(' ')[1];
      let userId = '';

      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.phone_number;
      }

      const cacheKey = `${key}:${userId}:${JSON.stringify(req.query)}:${JSON.stringify(req.body)}`;
      const cachedResponse = cache.get(cacheKey);

      if (cachedResponse) {
        console.log(`Cache hit for ${key} - userId: ${userId}`);
        return res.json(cachedResponse);
      }

      // Store original res.json function
      const originalJson = res.json;

      // Override res.json method
      res.json = function (data) {
        // Convert Mongoose documents to plain objects before caching
        const plainData = JSON.parse(JSON.stringify(data));
        console.log(`Cache miss for ${key} - userId: ${userId}`);
        cache.set(cacheKey, plainData);
        originalJson.call(this, plainData);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

// Add this middleware function before the routes
const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;

  // Check if both dates are provided
  if (!startDate || !endDate) {
    return res.status(400).json({
      error: 'Both startDate and endDate are required'
    });
  }

  // Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Check if dates are valid
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({
      error: 'Invalid date format. Please use ISO 8601 format (YYYY-MM-DD)'
    });
  }

  // Check if start date is before end date
  if (start > end) {
    return res.status(400).json({
      error: 'startDate must be before endDate'
    });
  }

  // Optional: Add maximum range limit (e.g., 30 days)
  const maxRangeInDays = 30;
  const daysDifference = (end - start) / (1000 * 60 * 60 * 24);
  if (daysDifference > maxRangeInDays) {
    return res.status(400).json({
      error: `Date range cannot exceed ${maxRangeInDays} days`
    });
  }

  // If all validations pass, continue to the next middleware/route handler
  next();
};

// Step 1: Send the login code (sendCode)
router.post('/login', async (req, res) => {
  const { phone_number } = req.body;

  try {
    // Check if user already exists and has valid auth
    const existingUser = await TelegramUser.findOne({ userId: phone_number });
    if (existingUser) {
      // Check if last login was within 24 hours
      const lastLoginAge = Date.now() - existingUser.lastLogin.getTime();
      const oneDayInMs = 24 * 60 * 60 * 1000;

      if (lastLoginAge < oneDayInMs) {
        try {
          const client = await createTelegramClient(phone_number);
          const me = await client.getMe();

          if (me) {
            return res.status(400).json({
              error: 'Already logged in',
              message: 'User has active sessions in both database and Telegram',
              expiresIn: oneDayInMs - lastLoginAge,
              telegramSession: {
                userId: me.id,
                username: me.username,
                isActive: true
              }
            });
          }
        } catch (telegramError) {
          console.log('Telegram session check failed:', telegramError.message);
          // If session is invalid, remove the existing user
          await TelegramUser.deleteOne({ userId: phone_number });
        }
      }
    }

    // Initialize login with proper string handling


    // Proceed with new login
    const result = await loginWithPhone(phone_number);

    if (!result || !result.phoneCodeHash) {
      throw new Error('Failed to get phone code hash');
    }

    const token = jwt.sign(
      {
        phone_number: phone_number,
        phone_code_hash: result.phoneCodeHash
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      message: 'Code sent to your phone',
      expires_in: 24 * 60 * 60 // 24 hours in seconds
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Failed to send code',
      details: error.message,
      code: 'LOGIN_FAILED'
    });
  }
});

// Step 2: Confirm login and authenticate the user
router.post('/confirm-login', async (req, res) => {
  const { phone_code } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const { phone_number, phone_code_hash } = jwt.verify(token, JWT_SECRET);

    const result = await verifyCode(phone_number, phone_code_hash, phone_code);

    // Get the client to fetch user details
    const client = await createTelegramClient(phone_number);
    const me = await client.getMe();

    // Check if user exists
    const existingUser = await TelegramUser.findOne({ userId: phone_number });

    // Only update if user doesn't exist
    if (!existingUser) {
      await User.create({
        apiKey: crypto.randomBytes(32).toString('hex'),
        credits: 100,
        chatLimit: 10
      });
      await TelegramUser.create({
        userId: phone_number,
        authKey: me.accessHash.toString(),
        dcId: client.session.dcId,
        telegramUserId: me.id,
        user: newUser._id
      });
    }

    // Use existing user data for token if available, otherwise use new data
    const tokenData = existingUser ?
      {
        phone_number,
        auth_key: existingUser.authKey,
        telegram_user_id: existingUser.telegramUserId
      } :
      {
        phone_number,
        auth_key: me.accessHash.toString(),
        telegram_user_id: me.id
      };

    const newToken = jwt.sign(tokenData, JWT_SECRET, {
      expiresIn: '24h'
    });

    res.json({
      token: newToken,
      message: 'Successfully logged in',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Login session expired',
        code: 'TOKEN_EXPIRED',
        message: 'Please restart the login process'
      });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// Add middleware to handle token verification
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'No token provided',
      code: 'NO_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
        message: 'Please log in again'
      });
    }
    return res.status(401).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }
};

// Step 3: Fetch and save user's channels with total members
router.post('/fetch-channels', verifyToken, cacheMiddleware('fetch-channels'), async (req, res) => {
  try {
    const { phone_number } = req.user;
    
    const dialogs = await callTelegramWithCache(phone_number, 'messages.getDialogs', {
      limit: 100,
      offsetPeer: new Api.InputPeerEmpty(),
      excludePinned: false,
      folderId: 0
    });

    console.log('Response class:', dialogs.className);

    if (!dialogs || !dialogs.dialogs) {
      console.error('No dialogs received:', dialogs);
      return res.status(404).json({ 
        error: 'No channels found',
        details: 'Dialog fetch returned empty result'
      });
    }

    // First, find all dialog entries that are channels
    const channelDialogs = dialogs.dialogs.filter(dialog => 
      dialog.peer?.className === 'PeerChannel'
    );

    console.log(`Found ${channelDialogs.length} channel dialogs`);

    // Then, map these to their full channel information from the chats array
    const channels = channelDialogs
      .map(dialog => {
        const channelId = dialog.peer.channelId.toString();
        const channel = dialogs.chats.find(chat => 
          chat.id.toString() === channelId
        );
        
        if (channel) {
          console.log(`Found matching channel: ${channel.title}`);
        } else {
          console.log(`No matching chat found for channel ID: ${channelId}`);
        }
        
        return channel;
      })
      .filter(Boolean);

    console.log('Found channels:', channels.length);

    if (!channels.length) {
      return res.status(404).json({ 
        error: 'No channels found',
        dialogsReceived: true,
        totalDialogs: dialogs.dialogs.length,
        totalChats: dialogs.chats?.length || 0,
        channelDialogsFound: channelDialogs.length
      });
    }

    // Process channels in batches
    const batchSize = 10;
    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      await Promise.all(batch.map(async (channel) => {
        try {
          // Get channel full info
          const channelFull = await callTelegramWithCache(phone_number, 'channels.getFullChannel', {
            channel_id: channel.id.toString(),
            access_hash: channel.accessHash.toString()
          });

          console.log(channelFull)

          const fullChat = channelFull.fullChat;

          console.log(fullChat)

          // Extract photo data if it exists, with null checks
          let photoData = null;
          if (channel.photo && 
              channel.photo._ !== 'chatPhotoEmpty' && 
              channel.photo.stripped_thumb) {
            photoData = {
              photoId: channel.photo.photo_id,
              photoDcId: channel.photo.dc_id,
              photoStrippedThumb: Buffer.from(channel.photo.stripped_thumb || []),
              photoSmall: {
                url: `https://t.me/c/${channel.id}/${channel.photo.photo_id}/small`,
                width: channel.photo.sizes?.[0]?.w,
                height: channel.photo.sizes?.[0]?.h,
                size: channel.photo.sizes?.[0]?.size
              },
              photoBig: {
                url: `https://t.me/c/${channel.id}/${channel.photo.photo_id}/big`,
                width: channel.photo.sizes?.[1]?.w,
                height: channel.photo.sizes?.[1]?.h,
                size: channel.photo.sizes?.[1]?.size
              },
              lastUpdated: new Date()
            };
          }

          // Prepare voice chat data
          // First try to find the existing channel
          const existingChannel = await UserChannel.findOne({ channelId: channel.id });

          console.log(existingChannel)

          console.log(fullChat)

          console.log(channel, channel.accessHash)

          const updateData = {
            $set: {
              channelId: channel.id,
              accessHash: channel.accessHash,
              title: channel.title,
              username: channel.username,

              // Statistics
              totalMembers: fullChat.participantsCount || 0,
              totalMessages: fullChat.pts || 0,
              unreadCount: fullChat.unreadCount || 0,
              adminsCount: fullChat.adminsCount || 0,
              kickedCount: fullChat.kickedCount || 0,
              bannedCount: fullChat.bannedCount || 0,
              onlineCount: fullChat.onlineCount || 0,

              // Channel settings
              about: fullChat.about || '',
              slowmodeSeconds: fullChat.slowmodeSeconds || 0,
              slowmodeNextSendDate: fullChat.slowmodeNextSendDate || 0,
              hiddenPrehistory: fullChat.hiddenPrehistory || false,

              // Permissions
              isAdmin: channel.admin_rights ? true : false,
              canViewParticipants: fullChat.canViewParticipants || false,
              canSetUsername: fullChat.canSetUsername || false,
              canSetStickers: fullChat.canSetStickers || false,
              canViewStats: fullChat.canViewStats || false,
              canSetLocation: fullChat.canSetLocation || false,

              // Related chats
              linkedChatId: fullChat.linkedChatId || null,

              // Photo information
              photo: photoData,

              // System fields
              lastFetched: new Date(),
              statsDcId: fullChat.statsDcId || null,
            }
          };

          // Only add the user if they don't already exist
          if (!existingChannel || !existingChannel.users.some(user => user.userId === phone_number)) {
            updateData.$addToSet = {
              users: {
                userId: phone_number,
                isActive: false,
                lastScanned: null
              }
            };
          }

          await UserChannel.findOneAndUpdate(
            { channelId: channel.id },
            updateData,
            {
              upsert: true,
              new: true,
              runValidators: true
            }
          );

        } catch (error) {
          console.error(`Error processing channel ${channel.id}:`, error);
        }
      }));

      await sleep(5000);
    }

    // Fetch the updated channels to return in response
    const updatedChannels = await UserChannel.find({
      'users.userId': phone_number
    }).select('channelId title username photo totalMembers');

    res.json({ channels: updatedChannels });

  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// Toggle channel activity
router.post('/toggle-channel', verifyToken, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { phone_number } = req.user;
  const { channelId, isActive } = req.body;

  try {
    // If trying to activate channel, check current active channels count
    if (isActive) {
      const activeChannelsCount = await UserChannel.countDocuments({
        'users': {
          $elemMatch: {
            userId: phone_number,
            isActive: true
          }
        }
      });

      if (activeChannelsCount >= 4) {
        return res.status(400).json({
          error: 'Maximum limit reached',
          message: 'You can only have 3 active channels at a time',
          currentActiveCount: activeChannelsCount
        });
      }
    }

    // Find and update the channel's active status for this user
    const result = await UserChannel.updateOne(
      {
        channelId,
        'users.userId': phone_number
      },
      {
        $set: { 'users.$.isActive': isActive }
      }
    );

    if (result.matchedCount === 0) {
      // If user doesn't exist in the channel's users array, add them
      await UserChannel.updateOne(
        { channelId },
        {
          $push: {
            users: {
              userId: phone_number,
              isActive: isActive,
              lastScanned: null
            }
          }
        },
        { upsert: true }
      );
    }

    // If channel is being activated, fetch last 200 messages
    if (isActive) {
      try {
        // Get channel details
        const channel = await UserChannel.findOne({ channelId });
        if (!channel) {
          throw new Error('Channel not found');
        }

        // Fetch messages using existing callTelegramWithCache function
        const messages = await callTelegramWithCache(phone_number, 'messages.getHistory', {
          channel_id: channel.channelId,
          access_hash: channel.accessHash,
          limit: 200
        });

        // Process messages in batches
        const messageBatchSize = 50;
        const messageDetails = [];

        for (let j = 0; j < messages.messages.length; j += messageBatchSize) {
          const messageBatch = messages.messages.slice(j, j + messageBatchSize);
          const batchDetails = messageBatch.map(msg => {
            const sentimentResult = sentiment.analyze(msg.message || '');

            // Extract user information from users array
            let username = 'Unknown';
            let firstName = '';
            let lastName = '';

            if (msg.fromId?.userId && messages.users) {
              const user = messages.users.find(u => u.id.toString() === msg.fromId.userId.toString());
              if (user) {
                username = user.username || 'Unknown';
                firstName = user.first_name || '';
                lastName = user.last_name || '';
              }
            }

            return {
              channelId: channel.channelId,
              messageId: msg.id,
              message: msg.message || '',
              username,
              firstName,
              lastName,
              timestamp: new Date(msg.date * 1000),
              sentiment: sentimentResult.score,
              positiveSentiment: sentimentResult.positive.length,
              negativeSentiment: sentimentResult.negative.length
            };
          });
          messageDetails.push(...batchDetails);
        }

        // Store messages in database
        await ChannelMessage.insertMany(messageDetails, { ordered: false })
          .catch(err => {
            // Log error but don't fail if some messages already exist
            console.warn('Some messages were not saved (might be duplicates):', err.message);
          });
      } catch (fetchError) {
        console.error('Error fetching initial messages:', fetchError);
        // Don't fail the whole request if message fetching fails
      }
    }

    // Get updated active channels count
    const newActiveCount = await UserChannel.countDocuments({
      'users': {
        $elemMatch: {
          userId: phone_number,
          isActive: true
        }
      }
    });

    res.json({
      message: `Channel ${channelId} is now ${isActive ? 'active' : 'inactive'} for scraping.`,
      isActive,
      activeChannelsCount: newActiveCount,
      initialMessagesFetched: isActive ? true : undefined
    });
  } catch (error) {
    console.error('Error toggling channel:', error);
    res.status(500).json({ error: 'Failed to toggle channel activity' });
  }
});


// Step 4: Cron job for active channels with sentiment analysis
cron.schedule('*/60 * * * *', async () => {
  console.log('Cron job started');

  try {
    // Find all active channels with users who need scanning
    const activeChannels = await UserChannel.find({
      'users.isActive': true
    }).lean(); // Use lean() for better performance

    const currentTime = new Date();
    const scanInterval = 30 * 60 * 1000; // 30 minutes in milliseconds

    // First filter channels that need scanning more efficiently
    const channelsToScan = activeChannels.filter(channel => {
      const lastFetchTime = channel.lastFetched ? new Date(channel.lastFetched) : null;
      return !lastFetchTime || (currentTime - lastFetchTime) >= scanInterval;
    });

    // Group channels by user more efficiently
    const channelsByUser = {};
    for (const channel of channelsToScan) {
      const activeUsers = channel.users.filter(u => u.isActive);
      for (const user of activeUsers) {
        if (!channelsByUser[user.userId]) {
          channelsByUser[user.userId] = [];
        }
        channelsByUser[user.userId].push(channel);
      }
    }

    console.log({
      totalChannels: activeChannels.length,
      channelsNeedingScan: channelsToScan.length,
      usersToProcess: Object.keys(channelsByUser).length,
      timestamp: currentTime
    });

    console.log(JSON.stringify(channelsByUser, null, 2))

    // Process users in batches to avoid overwhelming the system
    const userBatchSize = 5;
    const userIds = Object.keys(channelsByUser);
    
    for (let i = 0; i < userIds.length; i += userBatchSize) {
      const userBatch = userIds.slice(i, i + userBatchSize);
      
      await Promise.all(userBatch.map(async (userId) => {
        try {
          const channels = channelsByUser[userId];
          console.log(channels)
          // Process channels sequentially for each user
          for (const channel of channels) {
            try {
              const messages = await callTelegramWithCache(userId, 'messages.getHistory', {
                channel_id: channel.channelId.toString(),
                access_hash: channel.accessHash.toString(),
                limit: 100
              });

              if (!messages?.messages?.length) {
                console.log(`No messages found for channel ${channel.channelId}`);
                continue;
              }

              // Process messages in batches
              const messageBatchSize = 50;
              const messageDetails = [];
              
              for (let j = 0; j < messages.messages.length; j += messageBatchSize) {
                const messageBatch = messages.messages.slice(j, j + messageBatchSize);
                const batchDetails = messageBatch.map(msg => {
                  const sentimentResult = sentiment.analyze(msg.message || '');

                  // Extract user information from users array
                  let username = 'Unknown';
                  let firstName = '';
                  let lastName = '';

                  if (msg.fromId?.userId && messages.users) {
                    const user = messages.users.find(u => u.id.toString() === msg.fromId.userId.toString());
                    if (user) {
                      username = user.username || 'Unknown';
                      firstName = user.firstName || '';
                      lastName = user.lastName || '';
                    }
                  }

                  return {
                    channelId: channel.channelId,
                    messageId: msg.id,
                    message: msg.message || '',
                    username,
                    firstName,
                    lastName,
                    timestamp: new Date(msg.date * 1000),
                    sentiment: sentimentResult.score,
                    positiveSentiment: sentimentResult.positive.length,
                    negativeSentiment: sentimentResult.negative.length
                  };
                });
                messageDetails.push(...batchDetails);
              }

              // Use bulkWrite for more efficient database operations
              if (messageDetails.length > 0) {
                await ChannelMessage.bulkWrite(
                  messageDetails.map(msg => ({
                    updateOne: {
                      filter: { 
                        channelId: msg.channelId,
                        messageId: msg.messageId 
                      },
                      update: { $set: msg },
                      upsert: true
                    }
                  }))
                );
              }

              // Update channel and user scan status
              await UserChannel.updateOne(
                { channelId: channel.channelId },
                { 
                  $set: { 
                    lastFetched: new Date(),
                    'users.$[user].lastScanned': new Date()
                  }
                },
                { 
                  arrayFilters: [{ 'user.userId': userId }]
                }
              );

              await sleep(2000); // Rate limiting between channels
            } catch (channelError) {
              console.error(`Error processing channel ${channel.channelId}:`, channelError);
            }
          }
        } catch (userError) {
          console.error(`Error processing user ${userId}:`, userError);
        }
      }));

      // Add delay between user batches
      await sleep(5000);
    }

  } catch (error) {
    console.error('Cron job error:', error);
  }

  console.log('Cron job completed');
});

// Analytics endpoints
router.get('/analytics', verifyToken, cacheMiddleware('analytics'), async (req, res) => {
  const { phone_number } = req.user;
  const { metric, channelId, timeRange = 7 } = req.query;

  try {
    // Check if user has access to this channel
    const userChannel = await UserChannel.findOne({
      channelId,
      'users.userId': phone_number,
      'users.isActive': true
    });

    console.log(userChannel);

    if (!userChannel) {
      return res.status(404).json({
        error: 'Channel not found or not actively monitored by user'
      });
    }

    const endDate = new Date();
    const startDate = new Date(endDate - timeRange * 24 * 60 * 60 * 1000);

    let result;
    switch (metric) {
      case 'sentiment_trend':
        // Get daily average sentiment
        result = await ChannelMessage.aggregate([
          {
            $match: {
              channelId,
              timestamp: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
              avgSentiment: { $avg: "$sentiment" },
              avgPositive: { $avg: "$positiveSentiment" },
              avgNegative: { $avg: "$negativeSentiment" }
            }
          },
          { $sort: { _id: 1 } }
        ]);
        break;

      case 'active_users':
        // Count unique users who posted messages
        result = await ChannelMessage.distinct('username', {
          channelId,
          timestamp: { $gte: startDate, $lte: endDate },
          username: { $ne: 'Unknown' }
        });
        result = { activeUsers: result.length };
        break;

      case 'message_volume':
        // Get message count per day
        result = await ChannelMessage.aggregate([
          {
            $match: {
              channelId,
              timestamp: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);
        break;

      case 'user_engagement':
        // Calculate user engagement metrics
        const totalMessages = await ChannelMessage.countDocuments({
          channelId,
          timestamp: { $gte: startDate, $lte: endDate }
        });

        const uniqueUsers = await ChannelMessage.distinct('username', {
          channelId,
          timestamp: { $gte: startDate, $lte: endDate }
        });

        const avgMessagesPerUser = totalMessages / uniqueUsers.length;

        result = {
          totalMessages,
          uniqueUsers: uniqueUsers.length,
          avgMessagesPerUser: avgMessagesPerUser.toFixed(2)
        };
        break;

      case 'churn_rate':
        // Calculate churn rate
        // First, get active users from previous time period
        const previousStartDate = new Date(startDate - timeRange * 24 * 60 * 60 * 1000);

        const previousActiveUsers = await ChannelMessage.distinct('username', {
          channelId,
          timestamp: { $gte: previousStartDate, $lte: startDate }
        });

        const currentActiveUsers = await ChannelMessage.distinct('username', {
          channelId,
          timestamp: { $gte: startDate, $lte: endDate }
        });

        // Find users who were active in previous period but not in current period
        const churnedUsers = previousActiveUsers.filter(user =>
          !currentActiveUsers.includes(user)
        );

        const churnRate = previousActiveUsers.length > 0
          ? (churnedUsers.length / previousActiveUsers.length) * 100
          : 0;

        result = {
          previousActiveUsers: previousActiveUsers.length,
          currentActiveUsers: currentActiveUsers.length,
          churnedUsers: churnedUsers.length,
          churnRate: churnRate.toFixed(2) + '%'
        };
        break;

      case 'sentiment_summary':
        // Get overall sentiment metrics
        result = await ChannelMessage.aggregate([
          {
            $match: {
              channelId,
              timestamp: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: null,
              avgSentiment: { $avg: "$sentiment" },
              avgPositive: { $avg: "$positiveSentiment" },
              avgNegative: { $avg: "$negativeSentiment" },
              totalMessages: { $sum: 1 },
              positiveMessages: {
                $sum: { $cond: [{ $gt: ["$sentiment", 0] }, 1, 0] }
              },
              negativeMessages: {
                $sum: { $cond: [{ $lt: ["$sentiment", 0] }, 1, 0] }
              },
              neutralMessages: {
                $sum: { $cond: [{ $eq: ["$sentiment", 0] }, 1, 0] }
            }
          }
        }
        ]);
        break;

      default:
        return res.status(400).json({ error: 'Invalid metric specified' });
    }

    res.json({
      metric,
      timeRange,
      data: result
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Fetch all channels for a user
router.get('/user-channels', verifyToken, async (req, res) => {
  try {
    const { phone_number } = req.user;

    const channels = await UserChannel.find({
      'users.userId': phone_number
    })
      .select([
        'channelId',
        'title',
        'username',
        'about',
        'totalMembers',
        'totalMessages',
        'unreadCount',
        'lastFetched',
        'isAdmin',
        'users',
        'photo'
      ]);

    // Add isActive status for the current user to each channel
    const channelsWithStatus = channels.map(channel => {
      const userStatus = channel.users.find(user => user.userId === phone_number);
      return {
        channelId: channel.channelId,
        title: channel.title,
        username: channel.username,
        about: channel.about,
        totalMembers: channel.totalMembers,
        totalMessages: channel.totalMessages,
        unreadCount: channel.unreadCount,
        lastFetched: channel.lastFetched,
        isAdmin: channel.isAdmin,
        isActive: userStatus?.isActive || false,
        photo: channel.photo || null
      };
    });

    res.json({ channels: channelsWithStatus });
  } catch (error) {
    console.error('Error fetching user channels:', error);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

router.get('/channel-messages', verifyToken, validateDateRange, cacheMiddleware('channel-messages'), async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { channelId, startDate, endDate, limit = 100 } = req.query;

  try {
    const { phone_number } = req.user;

    // Find channel info
    const channel = await UserChannel.findOne({
      userId: phone_number,
      channelId
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Convert dates to timestamps
    const startTimestamp = new Date(startDate);
    const endTimestamp = new Date(endDate);

    // First, check what data we have in the database
    const existingMessages = await ChannelMessage.find({
      channelId,
      timestamp: {
        $gte: startTimestamp,
        $lte: endTimestamp
      }
    }).sort({ timestamp: -1 });

    // If we have enough messages in the database, return them
    if (existingMessages.length >= limit) {
      return res.json({
        channelId,
        messageCount: existingMessages.length,
        messages: existingMessages.slice(0, limit),
        source: 'database'
      });
    }

    // If we have some messages but not enough, we'll fetch only the missing period
    let missingRanges = [];
    if (existingMessages.length > 0) {
      // Sort messages by timestamp to find gaps
      const sortedMessages = existingMessages.sort((a, b) => a.timestamp - b.timestamp);

      // Check for gap at the start
      if (sortedMessages[0].timestamp > startTimestamp) {
        missingRanges.push({
          start: startTimestamp,
          end: sortedMessages[0].timestamp
        });
      }

      // Check for gaps between messages
      for (let i = 0; i < sortedMessages.length - 1; i++) {
        const currentMsg = sortedMessages[i];
        const nextMsg = sortedMessages[i + 1];

        // If there's a gap of more than 1 hour between messages
        if ((nextMsg.timestamp - currentMsg.timestamp) > 3600000) {
          missingRanges.push({
            start: currentMsg.timestamp,
            end: nextMsg.timestamp
          });
        }
      }

      // Check for gap at the end
      if (sortedMessages[sortedMessages.length - 1].timestamp < endTimestamp) {
        missingRanges.push({
          start: sortedMessages[sortedMessages.length - 1].timestamp,
          end: endTimestamp
        });
      }
    } else {
      // If no messages exist, we need to fetch the entire range
      missingRanges.push({
        start: startTimestamp,
        end: endTimestamp
      });
    }

    // Fetch missing messages from Telegram
    const client = await createTelegramClient(phone_number);
    const newMessages = [];

    for (const range of missingRanges) {
      let offsetId = 0;
      let offsetDate = Math.floor(range.end.getTime() / 1000);
      const rangeStartTimestamp = Math.floor(range.start.getTime() / 1000);

      while (true) {
        const result = await callTelegramWithCache(client, 'messages.getHistory', {
          peer: {
            _: 'inputPeerChannel',
            channel_id: channel.channelId,
            access_hash: channel.accessHash
          },
          offset_id: offsetId,
          offset_date: offsetDate,
          add_offset: 0,
          limit: 100,
          max_id: 0,
          min_id: 0,
          hash: 0
        });

        if (!result.messages || result.messages.length === 0) {
          break;
        }

        const filteredMessages = result.messages
          .filter(msg => {
            const msgDate = msg.date;
            return msgDate >= rangeStartTimestamp && msgDate <= offsetDate;
          })
          .map(msg => {
            const sentimentResult = sentiment.analyze(msg.message || '');
            return {
              channelId: channel.channelId,
              messageId: msg.id,
              message: msg.message || '',
              username: msg.from?.username || msg.sender?.username || 'Unknown',
              firstName: msg.from?.firstName || msg.sender?.firstName || '',
              lastName: msg.from?.lastName || msg.sender?.lastName || '',
              timestamp: new Date(msg.date * 1000),
              sentiment: sentimentResult.score,
              positiveSentiment: sentimentResult.positive.length,
              negativeSentiment: sentimentResult.negative.length,
              views: msg.views || 0,
              forwards: msg.forwards || 0,
              replies: msg.replies?.replies || 0,
              mediaType: msg.media ? msg.media._ : null
            };
          });

        newMessages.push(...filteredMessages);

        // Update offset for next iteration
        const lastMessage = result.messages[result.messages.length - 1];
        offsetId = lastMessage.id;
        offsetDate = lastMessage.date;

        if (lastMessage.date < rangeStartTimestamp || newMessages.length >= limit) {
          break;
        }

        await sleep(2000);
      }
    }

    // Save new messages to database
    if (newMessages.length > 0) {
      await ChannelMessage.insertMany(newMessages, { ordered: false })
        .catch(err => console.error('Some messages were not saved:', err));
    }

    // Combine existing and new messages
    const allMessages = [...existingMessages, ...newMessages]
      .sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
      .slice(0, limit);

    res.json({
      channelId,
      messageCount: allMessages.length,
      messages: allMessages,
      source: newMessages.length > 0 ? 'mixed' : 'database',
      newMessagesFetched: newMessages.length
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Add cache clear endpoint for admin/debugging
router.post('/clear-cache', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  try {
    const { phone_number } = jwt.verify(token, JWT_SECRET);

    // Optional: Add admin check here
    // const user = await User.findOne({ userId: phone_number });
    // if (!user.isAdmin) throw new Error('Unauthorized');

    const stats = cache.getStats();
    cache.flushAll();

    res.json({
      message: 'Cache cleared successfully',
      previousStats: stats
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(403).json({ error: 'Unauthorized to clear cache' });
  }
});

// Add cache stats endpoint for monitoring
router.get('/cache-stats', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  try {
    const { phone_number } = jwt.verify(token, JWT_SECRET);

    // Optional: Add admin check here

    const stats = cache.getStats();
    const keys = cache.keys();

    res.json({
      stats,
      totalKeys: keys.length,
      // Only send first 10 keys as example
      sampleKeys: keys.slice(0, 10)
    });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(403).json({ error: 'Unauthorized to view cache stats' });
  }
});

// Add new schema for bot management
const BotSchema = new mongoose.Schema({
  userId: String,
  botToken: String,
  botUsername: String,
  botName: String,
  description: String,
  commands: [{
    command: String,
    description: String
  }],
  telegramId: Number,        // Added field
  accessHash: String,        // Added field
  lastUpdated: { type: Date, default: Date.now }
});

const Bot = mongoose.model('Bot', BotSchema);

// Helper function to make Telegram Bot API calls
const callBotAPI = async (token, method, params = {}) => {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/${method}`,
      params
    );
    return response.data;
  } catch (error) {
    console.error(`Bot API Error: ${error.message}`);
    throw error;
  }
};

// Add a bot using MTProto
router.post('/bots', verifyToken, cacheMiddleware('add-bot'), async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { botToken } = req.body;

  try {
    const { phone_number } = req.user;
    const client = await createTelegramClient(phone_number);

    // Check if bot already exists
    const existingBot = await Bot.findOne({
      userId: phone_number,
      botToken
    });

    if (existingBot) {
      return res.status(400).json({ error: 'Bot already registered' });
    }

    // First verify bot token using Bot API
    const botInfo = await callBotAPI(botToken, 'getMe');

    if (!botInfo.ok) {
      return res.status(400).json({ error: 'Invalid bot token' });
    }

    // Import bot using MTProto
    try {
      const result = await callTelegramWithCache(client, 'contacts.resolveUsername', {
        username: botInfo.result.username
      });

      if (!result.users?.[0]) {
        return res.status(404).json({ error: 'Bot not found on Telegram' });
      }

      const botUser = result.users[0];

      // Add bot to user's contacts
      await callTelegramWithCache(client, 'contacts.addContact', {
        id: {
          _: 'inputUser',
          user_id: botUser.id,
          access_hash: botUser.access_hash
        },
        first_name: botInfo.result.first_name || '',
        last_name: botInfo.result.last_name || '',
        phone: '',
        add_phone_privacy_exception: false
      });

      // Create new bot entry
      const newBot = await Bot.create({
        userId: phone_number,
        botToken,
        botUsername: botInfo.result.username,
        botName: botInfo.result.first_name,
        description: '',
        commands: [],
        telegramId: botUser.id,
        accessHash: botUser.access_hash
      });

      res.json({
        message: 'Bot added successfully',
        bot: {
          ...newBot.toObject(),
          botToken: undefined // Don't send token back
        }
      });

    } catch (error) {
      if (error.error_message === 'BOT_METHOD_INVALID') {
        return res.status(400).json({
          error: 'Cannot add bot using MTProto directly',
          message: 'Please add the bot manually to your channels'
        });
      }
      throw error;
    }

  } catch (error) {
    console.error('Error adding bot:', error);
    res.status(500).json({ error: 'Failed to add bot' });
  }
});

// Add bot to channel using MTProto
router.post('/bots/:botId/add-to-channel', verifyToken, cacheMiddleware('add-bot-to-channel'), async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { botId } = req.params;
  const { channelUsername } = req.body;

  try {
    const { phone_number } = req.user;
    const client = await createTelegramClient(phone_number);

    // Find bot
    const bot = await Bot.findOne({
      userId: phone_number,
      _id: botId
    });

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    try {
      // Resolve channel username
      const channelResult = await callTelegramWithCache(client, 'contacts.resolveUsername', {
        username: channelUsername.replace('@', '')
      });

      if (!channelResult.chats?.[0]) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const channel = channelResult.chats[0];

      // Try to add bot as admin
      try {
        await callTelegramWithCache(client, 'channels.editAdmin', {
          channel: {
            _: 'inputChannel',
            channel_id: channel.id,
            access_hash: channel.access_hash
          },
          user_id: {
            _: 'inputUser',
            user_id: bot.telegramId,
            access_hash: bot.accessHash
          },
          admin_rights: {
            _: 'chatAdminRights',
            post_messages: true,
            edit_messages: true,
            delete_messages: true,
            invite_users: false,
            pin_messages: false,
            add_admins: false,
            anonymous: false,
            manage_call: false,
            other: false
          },
          rank: 'Bot'
        });

        res.json({
          success: true,
          message: 'Bot added to channel successfully',
          channelInfo: {
            id: channel.id,
            title: channel.title,
            username: channel.username
          }
        });

      } catch (adminError) {
        // If we can't add as admin, try to add as member
        await callTelegramWithCache(client, 'channels.inviteToChannel', {
          channel: {
            _: 'inputChannel',
            channel_id: channel.id,
            access_hash: channel.access_hash
          },
          users: [{
            _: 'inputUser',
            user_id: bot.telegramId,
            access_hash: bot.accessHash
          }]
        });

        res.json({
          success: true,
          message: 'Bot added to channel as member (not admin)',
          warning: 'Bot needs admin rights to function properly',
          channelInfo: {
            id: channel.id,
            title: channel.title,
            username: channel.username
          }
        });
      }

    } catch (error) {
      if (error.error_message?.includes('USER_NOT_MUTUAL_CONTACT')) {
        return res.status(400).json({
          error: 'Cannot add bot directly',
          message: 'Please add the bot manually using channel settings'
        });
      }
      throw error;
    }

  } catch (error) {
    console.error('Error adding bot to channel:', error);
    res.status(500).json({
      error: 'Failed to add bot to channel',
      details: error.error_message || error.message
    });
  }
});

// Update bot information
router.put('/bots/:botId', verifyToken, cacheMiddleware('update-bot'), async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { name, description, commands } = req.body;
  const { botId } = req.params;

  try {
    const { phone_number } = req.user;
    const client = await createTelegramClient(phone_number);

    // Find bot
    const bot = await Bot.findOne({
      userId: phone_number,
      _id: botId
    });

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Update bot name and description on Telegram
    if (name || description) {
      await callBotAPI(bot.botToken, 'setMyName', {
        name: name || bot.botName
      });

      if (description) {
        await callBotAPI(bot.botToken, 'setMyDescription', {
          description
        });
      }
    }

    // Update commands if provided
    if (commands && commands.length > 0) {
      await callBotAPI(bot.botToken, 'setMyCommands', {
        commands: commands.map(cmd => ({
          command: cmd.command,
          description: cmd.description
        }))
      });
    }

    // Update bot in database
    const updatedBot = await Bot.findOneAndUpdate(
      { _id: botId, userId: phone_number },
      {
        botName: name || bot.botName,
        description: description || bot.description,
        commands: commands || bot.commands,
        lastUpdated: new Date()
      },
      { new: true }
    );

    res.json({
      message: 'Bot updated successfully',
      bot: {
        ...updatedBot.toObject(),
        botToken: undefined
      }
    });
  } catch (error) {
    console.error('Error updating bot:', error);
    res.status(500).json({ error: 'Failed to update bot' });
  }
});

// Check if bot is in a channel by channel username
router.get('/bots/:botId/check-channel/:channelName', verifyToken, cacheMiddleware('check-bot-channel'), async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { botId, channelName } = req.params;

  try {
    const { phone_number } = req.user;
    const client = await createTelegramClient(phone_number);

    // Find bot
    const bot = await Bot.findOne({
      userId: phone_number,
      _id: botId
    });

    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Format channel name (add @ if not present)
    const formattedChannelName = channelName.startsWith('@') ?
      channelName :
      `@${channelName}`;

    // First, get channel info
    try {
      // Get chat information
      const chatInfo = await callBotAPI(bot.botToken, 'getChat', {
        chat_id: formattedChannelName
      });

      if (!chatInfo.ok) {
        return res.json({
          isInChannel: false,
          status: 'channel_not_found',
          canPostMessages: false,
          error: 'Channel not found'
        });
      }

      // Check bot's status in channel
      const chatMember = await callBotAPI(bot.botToken, 'getChatMember', {
        chat_id: formattedChannelName,
        user_id: chatInfo.result.id
      });

      const isInChannel = chatMember.ok &&
        ['administrator', 'member'].includes(chatMember.result.status);

      res.json({
        isInChannel,
        status: chatMember.result.status,
        canPostMessages: chatMember.result.can_post_messages || false,
        channelInfo: {
          id: chatInfo.result.id,
          title: chatInfo.result.title,
          username: chatInfo.result.username,
          type: chatInfo.result.type,
          memberCount: chatInfo.result.member_count,
          isVerified: chatInfo.result.is_verified || false,
          hasProtectedContent: chatInfo.result.has_protected_content || false
        }
      });
    } catch (error) {
      // If bot can't access channel or channel doesn't exist
      res.json({
        isInChannel: false,
        status: 'not_accessible',
        canPostMessages: false,
        error: error.response?.data?.description || 'Cannot access channel'
      });
    }
  } catch (error) {
    console.error('Error checking bot channel status:', error);
    res.status(500).json({ error: 'Failed to check bot status' });
  }
});

// Get user's bots
router.get('/bots', verifyToken, cacheMiddleware('get-bots'), async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  try {
    const { phone_number } = req.user;
    const client = await createTelegramClient(phone_number);

    const bots = await Bot.find({ userId: phone_number })
      .select('-botToken'); // Exclude token from response

    res.json({ bots });
  } catch (error) {
    console.error('Error fetching bots:', error);
    res.status(500).json({ error: 'Failed to fetch bots' });
  }
});

// Delete a bot
router.delete('/bots/:botId', verifyToken, cacheMiddleware('delete-bot'), async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  const { botId } = req.params;

  try {
    const { phone_number } = req.user;
    const client = await createTelegramClient(phone_number);

    const result = await Bot.deleteOne({
      _id: botId,
      userId: phone_number
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    res.json({ message: 'Bot deleted successfully' });
  } catch (error) {
    console.error('Error deleting bot:', error);
    res.status(500).json({ error: 'Failed to delete bot' });
  }
});

// Dashboard data endpoint
router.get('/dashboard-data', verifyToken, async (req, res) => {
  const { phone_number } = req.user;
  const { channelId, timeRange = 7 } = req.query;

  try {
    // Validate channel access
    const userChannel = await UserChannel.findOne({
      channelId,
      'users.userId': phone_number,
      'users.isActive': true
    });

    if (!userChannel) {
      return res.status(404).json({
        error: 'Channel not found or not actively monitored by user'
      });
    }

    const endDate = new Date();
    const startDate = new Date(endDate - timeRange * 24 * 60 * 60 * 1000);

    // Get all metrics in parallel for better performance
    const [
      messageVolume,
      sentimentData,
      userEngagement,
      churnAnalysis,
      channelStats
    ] = await Promise.all([
      // 1. Message Volume Analysis
      ChannelMessage.aggregate([
        {
          $match: {
            channelId,
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$timestamp"
              }
            },
            count: { $sum: 1 },
            avgSentiment: { $avg: "$sentiment" }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // 2. Sentiment Analysis
      ChannelMessage.aggregate([
        {
          $match: {
            channelId,
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            avgSentiment: { $avg: "$sentiment" },
            positiveMsgs: {
              $sum: { $cond: [{ $gt: ["$sentiment", 0] }, 1, 0] }
            },
            negativeMsgs: {
              $sum: { $cond: [{ $lt: ["$sentiment", 0] }, 1, 0] }
            },
            neutralMsgs: {
              $sum: { $cond: [{ $eq: ["$sentiment", 0] }, 1, 0] }
            }
          }
        }
      ]),

      // 3. User Engagement
      ChannelMessage.aggregate([
        {
          $match: {
            channelId,
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            uniqueUsers: { $addToSet: "$username" },
          }
        }
      ]),

      // 4. Churn Analysis
      (async () => {
        const previousStartDate = new Date(startDate - timeRange * 24 * 60 * 60 * 1000);

        const [previousPeriod, currentPeriod] = await Promise.all([
          ChannelMessage.distinct('username', {
            channelId,
            timestamp: {
              $gte: previousStartDate,
              $lte: startDate
            }
          }),
          ChannelMessage.distinct('username', {
            channelId,
            timestamp: {
              $gte: startDate,
              $lte: endDate
            }
          })
        ]);

        const churnedUsers = previousPeriod.filter(user =>
          !currentPeriod.includes(user)
        );

        return {
          previousActiveUsers: previousPeriod.length,
          currentActiveUsers: currentPeriod.length,
          churnedUsers: churnedUsers.length,
          churnRate: previousPeriod.length ?
            (churnedUsers.length / previousPeriod.length) * 100
            : 0
        };
      })(),

      // 5. Channel Statistics
      UserChannel.findOne(
        { channelId },
        {
          title: 1,
          totalMembers: 1,
          onlineCount: 1,
          lastFetched: 1
        }
      )
    ]);

    // Calculate health score (0-100)
    const calculateHealthScore = () => {
      const metrics = {
        memberGrowth: channelStats.totalMembers > 0 ? 100 : 0,
        engagement: Math.min((userEngagement[0]?.totalMessages || 0) / timeRange / 10, 100),
        sentiment: ((sentimentData[0]?.avgSentiment || 0) + 1) * 50,
        churnRate: Math.max(0, 100 - churnAnalysis.churnRate),
        messageVolume: Math.min((messageVolume.length / timeRange) * 20, 100)
      };

      return Math.round(
        Object.values(metrics).reduce((a, b) => a + b, 0) / Object.keys(metrics).length
      );
    };

    // Prepare response
    const dashboardData = {
      channelInfo: {
        title: channelStats.title,
        totalMembers: channelStats.totalMembers,
        onlineCount: channelStats.onlineCount,
        lastUpdated: channelStats.lastFetched,
        healthScore: calculateHealthScore()
      },

      messageActivity: {
        timeSeriesData: messageVolume.map(day => ({
          date: day._id,
          messageCount: day.count,
          sentiment: day.avgSentiment
        })),
        total: messageVolume.reduce((sum, day) => sum + day.count, 0)
      },

      sentimentAnalysis: {
        distribution: {
          positive: sentimentData[0]?.positiveMsgs || 0,
          negative: sentimentData[0]?.negativeMsgs || 0,
          neutral: sentimentData[0]?.neutralMsgs || 0
        },
        average: sentimentData[0]?.avgSentiment || 0
      },

      userEngagement: {
        totalMessages: userEngagement[0]?.totalMessages || 0,
        uniqueUsers: userEngagement[0]?.uniqueUsers?.length || 0,
        avgMessagesPerUser: userEngagement[0]?.totalMessages
          ? (userEngagement[0].totalMessages / userEngagement[0].uniqueUsers.length).toFixed(2)
          : 0
      },

      userRetention: {
        previousActiveUsers: churnAnalysis.previousActiveUsers,
        currentActiveUsers: churnAnalysis.currentActiveUsers,
        churnedUsers: churnAnalysis.churnedUsers,
        churnRate: churnAnalysis.churnRate.toFixed(2)
      },

      timeRange: {
        start: startDate,
        end: endDate,
        days: timeRange
      }
    };

    res.json(dashboardData);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      details: error.message
    });
  }
});

// Middleware to check API usage limits
const checkApiLimit = async (req, res, next) => {
  try {
    const { phone_number } = req.user;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get or create today's usage record
    let usage = await ApiUsage.findOne({
      userId: phone_number,
      date: { $gte: today }
    });

    if (!usage) {
      usage = new ApiUsage({
        userId: phone_number,
        date: today,
        count: 0
      });
    }

    if (usage.count >= 5) {
      return res.status(429).json({
        error: 'Daily limit exceeded',
        message: 'You can only use this API 5 times per day',
        nextReset: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      });
    }

    // Increment usage count
    usage.count += 1;
    await usage.save();

    next();
  } catch (error) {
    console.error('Error checking API limit:', error);
    res.status(500).json({ error: 'Failed to check API limit' });
  }
};

// Configure OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper function to chunk text
function chunkText(text, maxTokens = 15000) {
  const chunkSize = maxTokens * 4;
  const chunks = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  return chunks;
}

// Modified API call with TechSense personality
async function generateInsights(text) {
  try {
    const chunks = chunkText(text);
    const results = [];

    const systemPrompt = `You are TechSense, an AI community analyst specializing in technology and online communities. 
Your analysis style is:
- Professional yet approachable
- Data-driven but easy to understand
- Focused on actionable insights
- Tech-savvy and current with digital trends
When analyzing community data, you:
1. Identify key patterns and trends
2. Highlight engagement metrics
3. Suggest practical improvements
4. Consider technical context`;

    for (const chunk of chunks) {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Please analyze this community data and provide insights:\n\n${chunk}` }
        ],
        max_tokens: 1000,
        temperature: 0.7 // Balanced between creativity and consistency
      });

      results.push(response.choices[0].message.content);
    }

    // Combine results with a summary header
    return `🤖 TechSense Community Analysis\n\n${results.join('\n\n')}`;
  } catch (error) {
    console.error('Error generating TechSense insights:', error);
    throw error;
  }
}

// Get channel insights using AI
router.post('/channel-insights', verifyToken, checkApiLimit, async (req, res) => {
  const { channelId, prompt } = req.body;
  const { phone_number } = req.user;

  try {
    // Validate channel access
    const channel = await UserChannel.findOne({
      channelId,
      'users.userId': phone_number
    });

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Get recent messages (last 24 hours)
    const messages = await ChannelMessage.find({
      channelId,
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
      .sort({ timestamp: -1 })
      .limit(100); // Limit to most recent 100 messages to manage token count

    if (messages.length === 0) {
      return res.status(404).json({ error: 'No recent messages found' });
    }

    // Prepare messages for AI analysis - with minimal data
    const messageContext = messages.map(msg => ({
      text: msg.message?.substring(0, 500), // Limit message length
      sentiment: msg.sentiment
    }));

    // Create summary statistics instead of sending all messages
    const stats = {
      totalMessages: messages.length,
      averageSentiment: messages.reduce((acc, msg) => acc + (msg.sentiment || 0), 0) / messages.length,
      uniqueUsers: new Set(messages.map(m => m.username)).size,
      timeRange: {
        start: messages[messages.length - 1].timestamp,
        end: messages[0].timestamp
      }
    };

    // Create AI prompt with summarized data
    const aiPrompt = `Analyze this Telegram channel data and ${prompt}\n\nChannel context:
    - Name: ${channel.title}
    - Total members: ${channel.totalMembers}
    - Messages analyzed: ${stats.totalMessages}
    - Unique users: ${stats.uniqueUsers}
    - Average sentiment: ${stats.averageSentiment.toFixed(2)}
    
    Sample of recent messages (showing ${Math.min(10, messageContext.length)} of ${messageContext.length}):
    ${JSON.stringify(messageContext.slice(0, 10), null, 2)}
    
    Overall statistics:
    ${JSON.stringify(stats, null, 2)}`;

    // Get AI insights with chunked processing
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert community analyst. Provide concise, actionable insights based on the channel data."
        },
        {
          role: "user",
          content: aiPrompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const insight = response.choices[0].message.content;

    // Save to history
    await InsightHistory.create({
      userId: phone_number,
      channelId,
      prompt,
      result: insight
    });

    res.json({
      channelId,
      prompt,
      insight,
      messageCount: messages.length,
      timestamp: new Date(),
      stats // Include summary statistics in response
    });

  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({
      error: 'Failed to generate insights',
      details: error.message
    });
  }
});

// Get insight history
router.get('/insight-history', verifyToken, async (req, res) => {
  const { phone_number } = req.user;
  const { limit = 10, offset = 0 } = req.query;

  try {
    const history = await InsightHistory.find({ userId: phone_number })
      .sort({ timestamp: -1 })
      .skip(Number(offset))
      .limit(Number(limit));

    const total = await InsightHistory.countDocuments({ userId: phone_number });

    // Get today's remaining API calls
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const usage = await ApiUsage.findOne({
      userId: phone_number,
      date: { $gte: today }
    });

    res.json({
      history,
      pagination: {
        total,
        offset: Number(offset),
        limit: Number(limit)
      },
      apiUsage: {
        todayCount: usage?.count || 0,
        remaining: 5 - (usage?.count || 0),
        resetAt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    console.error('Error fetching insight history:', error);
    res.status(500).json({ error: 'Failed to fetch insight history' });
  }
});

function chunkMessages(messages, maxTokens = 16000) {
  const chunks = [];
  let currentChunk = [];
  let currentTokenCount = 0;

  for (const message of messages) {
    // Rough estimation of tokens (actual token count may vary)
    const estimatedTokens = JSON.stringify(message).length / 4;

    if (currentTokenCount + estimatedTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [message];
      currentTokenCount = estimatedTokens;
    } else {
      currentChunk.push(message);
      currentTokenCount += estimatedTokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Create an async function to process chunks
async function processMessageChunks(messages, openaiClient) {
  const messageChunks = chunkMessages(messages);
  const results = [];

  for (const chunk of messageChunks) {
    const response = await openaiClient.chat.completions.create({
      messages: chunk,
      model: "gpt-3.5-turbo",
      // ... other options
    });
    results.push(response);
  }

  return results;
}

module.exports = router;
