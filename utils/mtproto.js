const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { Api } = require('telegram');

dotenv.config();

// Ensure directory exists for storing session data
const ensureSessionDir = (sessionDir) => {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
};

// Add new proxy-related functions
const getRandomProxy = (proxyList) => {
  const randomIndex = Math.floor(Math.random() * proxyList.length);
  const proxyString = proxyList[randomIndex];
  const [host, port, username, password] = proxyString.split(':');
  
  return {
    socksType: 5, // Explicitly set SOCKS5
    ip: host,     // Use ip instead of host
    port: parseInt(port),
    username,
    password
  };
};

// Function to create a new Telegram client instance with a unique session for each user
const createTelegramClient = async (userId) => {
  // Check if there's an active client instance first
  if (global.telegramClients && global.telegramClients[userId] && global.telegramClients[userId].connected) {
    return global.telegramClients[userId];
  }

  const sessionDir = path.resolve(__dirname, '../mtproto_data');
  ensureSessionDir(sessionDir);
  console.log(userId)
  const sessionFilePath = path.resolve(sessionDir, `${userId}_session.json`);
  
  let sessionString = '';
  if (fs.existsSync(sessionFilePath)) {
    sessionString = fs.readFileSync(sessionFilePath, 'utf8');
  }

  const stringSession = new StringSession(sessionString);
  const proxy = getRandomProxy([
    '216.98.255.236:6858:koyjnkmi:cwj703oom728',
    '193.160.82.27:5999:koyjnkmi:cwj703oom728',
    '72.46.139.8:6568:koyjnkmi:cwj703oom728',
    '193.160.83.30:6351:koyjnkmi:cwj703oom728',
    '72.46.138.66:6292:koyjnkmi:cwj703oom728',
    '103.210.12.15:5943:koyjnkmi:cwj703oom728',
    '216.98.254.178:6488:koyjnkmi:cwj703oom728',
    '45.58.244.250:6663:koyjnkmi:cwj703oom728',
    '192.53.140.8:5104:koyjnkmi:cwj703oom728',
    '103.210.12.245:6173:koyjnkmi:cwj703oom728',
    '194.113.80.135:6418:koyjnkmi:cwj703oom728',
    '72.46.138.163:6389:koyjnkmi:cwj703oom728',
    '192.46.185.174:5864:koyjnkmi:cwj703oom728',
    '192.46.200.172:5842:koyjnkmi:cwj703oom728',
    '63.141.58.163:6479:koyjnkmi:cwj703oom728',
    '192.53.140.243:5339:koyjnkmi:cwj703oom728',
    '194.113.80.97:6380:koyjnkmi:cwj703oom728',
    '45.196.41.244:6618:koyjnkmi:cwj703oom728',
    '194.113.81.107:6701:koyjnkmi:cwj703oom728',
    '216.170.122.156:6194:koyjnkmi:cwj703oom728',
    '216.98.230.19:6472:koyjnkmi:cwj703oom728',
    '63.246.130.83:6284:koyjnkmi:cwj703oom728',
    '192.46.189.193:6186:koyjnkmi:cwj703oom728',
    '194.113.80.112:6395:koyjnkmi:cwj703oom728',
    '192.53.69.241:6879:koyjnkmi:cwj703oom728',
    '130.185.126.97:6712:koyjnkmi:cwj703oom728',
    '192.53.70.151:5865:koyjnkmi:cwj703oom728',
    '192.46.190.61:6654:koyjnkmi:cwj703oom728',
    '69.91.142.38:7530:koyjnkmi:cwj703oom728',
    '216.170.122.30:6068:koyjnkmi:cwj703oom728',
    '192.53.137.174:6462:koyjnkmi:cwj703oom728',
    '63.246.137.50:5679:koyjnkmi:cwj703oom728',
    '192.53.140.113:5209:koyjnkmi:cwj703oom728',
    '45.196.63.231:6865:koyjnkmi:cwj703oom728',
    '194.113.81.178:6772:koyjnkmi:cwj703oom728',
    '192.53.70.202:5916:koyjnkmi:cwj703oom728',
    '192.53.140.58:5154:koyjnkmi:cwj703oom728',
    '45.58.244.253:6666:koyjnkmi:cwj703oom728',
    '208.66.76.190:6114:koyjnkmi:cwj703oom728',
    '45.196.51.48:5744:koyjnkmi:cwj703oom728',
    '216.170.122.126:6164:koyjnkmi:cwj703oom728',
    '216.98.255.181:6803:koyjnkmi:cwj703oom728',
    '192.53.69.216:6854:koyjnkmi:cwj703oom728',
    '130.185.126.187:6802:koyjnkmi:cwj703oom728',
    '192.53.70.111:5825:koyjnkmi:cwj703oom728',
    '192.53.138.76:6014:koyjnkmi:cwj703oom728',
    '63.246.137.202:5831:koyjnkmi:cwj703oom728',
    '192.46.187.158:6736:koyjnkmi:cwj703oom728',
    '193.160.83.240:6561:koyjnkmi:cwj703oom728',
    '193.160.80.38:6306:koyjnkmi:cwj703oom728',
    '45.196.60.207:6547:koyjnkmi:cwj703oom728',
    '45.248.55.120:6706:koyjnkmi:cwj703oom728',
    '72.46.138.143:6369:koyjnkmi:cwj703oom728',
    '192.46.189.215:6208:koyjnkmi:cwj703oom728',
    '192.46.187.224:6802:koyjnkmi:cwj703oom728',
    '198.145.103.6:6263:koyjnkmi:cwj703oom728',
    '69.91.142.57:7549:koyjnkmi:cwj703oom728',
    '192.53.69.230:6868:koyjnkmi:cwj703oom728',
    '192.53.140.241:5337:koyjnkmi:cwj703oom728',
    '193.160.80.39:6307:koyjnkmi:cwj703oom728',
    '192.46.189.225:6218:koyjnkmi:cwj703oom728',
    '156.238.176.219:6901:koyjnkmi:cwj703oom728',
    '216.98.254.169:6479:koyjnkmi:cwj703oom728',
    '103.210.12.133:6061:koyjnkmi:cwj703oom728',
    '192.46.185.90:5780:koyjnkmi:cwj703oom728',
    '192.46.185.23:5713:koyjnkmi:cwj703oom728',
    '72.46.138.35:6261:koyjnkmi:cwj703oom728',
    '216.98.249.130:7111:koyjnkmi:cwj703oom728',
    '45.248.55.196:6782:koyjnkmi:cwj703oom728',
    '192.46.203.177:6143:koyjnkmi:cwj703oom728',
    '63.141.62.54:6347:koyjnkmi:cwj703oom728',
    '103.130.178.158:5822:koyjnkmi:cwj703oom728',
    '63.141.62.164:6457:koyjnkmi:cwj703oom728',
    '185.253.122.171:5980:koyjnkmi:cwj703oom728',
    '194.113.81.200:6794:koyjnkmi:cwj703oom728',
    '192.46.188.195:5854:koyjnkmi:cwj703oom728',
    '194.113.81.50:6644:koyjnkmi:cwj703oom728',
    '194.113.80.54:6337:koyjnkmi:cwj703oom728',
    '72.46.139.225:6785:koyjnkmi:cwj703oom728',
    '192.46.203.169:6135:koyjnkmi:cwj703oom728',
    '193.160.80.152:6420:koyjnkmi:cwj703oom728',
    '192.145.71.218:6855:koyjnkmi:cwj703oom728',
    '45.248.55.232:6818:koyjnkmi:cwj703oom728',
    '159.148.236.8:6214:koyjnkmi:cwj703oom728',
    '63.141.58.148:6464:koyjnkmi:cwj703oom728',
    '198.145.103.235:6492:koyjnkmi:cwj703oom728',
    '194.113.81.248:6842:koyjnkmi:cwj703oom728',
    '194.113.80.231:6514:koyjnkmi:cwj703oom728',
    '156.238.176.39:6721:koyjnkmi:cwj703oom728',
    '150.241.110.30:7034:koyjnkmi:cwj703oom728',
    '103.210.12.162:6090:koyjnkmi:cwj703oom728',
    '166.0.36.20:6029:koyjnkmi:cwj703oom728',
    '192.53.70.209:5923:koyjnkmi:cwj703oom728',
    '45.196.52.128:6143:koyjnkmi:cwj703oom728',
    '46.203.56.246:5733:koyjnkmi:cwj703oom728',
    '46.203.41.220:5721:koyjnkmi:cwj703oom728',
    '192.53.66.101:6207:koyjnkmi:cwj703oom728',
    '179.61.172.169:6720:koyjnkmi:cwj703oom728',
    '46.203.29.84:6571:koyjnkmi:cwj703oom728',
    '193.160.80.131:6399:koyjnkmi:cwj703oom728'
  ]);

  const client = new TelegramClient(
    stringSession,
    parseInt(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH,
    {
      connectionRetries: 5,
      proxy: {
        ip: proxy.ip,
        port: proxy.port,
        socksType: proxy.socksType,
        username: proxy.username,
        password: proxy.password
      },
      useWSS: false
    }
  );

  try {
    await client.connect();
    
    // Check if we need to move to a different DC
    if (!client.connected) {
      // Try to reconnect with the last known DC
      const dcId = client.session.dcId;
      if (dcId) {
        console.log(`Attempting to connect to DC ${dcId}`);
        await client.session.setDC(dcId, client.session.serverAddress, client.session.port);
        await client.connect();
      }
    }

    // Save the session after successful connection
    if (client.connected) {
      fs.writeFileSync(sessionFilePath, client.session.save());
    } else {
      throw new Error('Failed to establish connection');
    }

    return client;
  } catch (error) {
    console.error('Connection error:', error);
    throw error;
  }
};

const loginWithPhone = async (userId) => {
  // Check for existing active client first
  if (global.telegramClients && global.telegramClients[userId] && global.telegramClients[userId].connected) {
    return {
      success: true,
      message: 'Already logged in with an active session'
    };
  }

  const sessionDir = path.resolve(__dirname, '../mtproto_data');
  const sessionFilePath = path.resolve(sessionDir, `${userId}_session.json`);
  
  // Delete existing session file if it exists
  if (fs.existsSync(sessionFilePath)) {
    fs.unlinkSync(sessionFilePath);
  }

  const client = await createTelegramClient(userId);
  try {
    console.log(`[${new Date().toISOString()}] Starting login process for ${userId}`);
    
    if (!client.connected) {
      await client.connect();
    }
    
    const result = await client.invoke(new Api.auth.SendCode({
      phoneNumber: userId,
      settings: new Api.CodeSettings({
        allowFlashcall: false,
        currentNumber: true,
        allowAppHash: true,
      }),
      apiId: parseInt(process.env.TELEGRAM_API_ID),
      apiHash: process.env.TELEGRAM_API_HASH,
    }));
    
    const codeTimestamp = Date.now();
    const timestampData = { 
      timestamp: codeTimestamp, 
      phoneCodeHash: result.phoneCodeHash,
      client: client // Store the client instance
    };
    
    // Store the client instance in global scope or a cache
    global.telegramClients = global.telegramClients || {};
    global.telegramClients[userId] = client;
    
    
    return { 
      success: true, 
      phoneCodeHash: result.phoneCodeHash,
      message: 'Verification code sent successfully',
      timestamp: codeTimestamp
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Login error:`, error);
    throw error;
  }
};

const verifyCode = async (userId, phoneCodeHash, verificationCode) => {
  console.log(`[${new Date().toISOString()}] Starting verification for ${userId}`);
  
  const client = global.telegramClients[userId];
  if (!client) {
    throw new Error('No active session found. Please restart the login process.');
  }
  
  try {
    if (!client.connected) {
      await client.connect();
    }

    console.log(`[${new Date().toISOString()}] Attempting to sign in with code`);
    
    const result = await client.invoke(new Api.auth.SignIn({
      phoneNumber: userId,
      phoneCodeHash: phoneCodeHash,
      phoneCode: verificationCode.toString().trim()
    }));

    // Save the session after successful sign in
    const sessionDir = path.resolve(__dirname, '../mtproto_data');
    const sessionFilePath = path.resolve(sessionDir, `${userId}_session.json`);
    fs.writeFileSync(sessionFilePath, client.session.save());

    console.log(`[${new Date().toISOString()}] SignIn successful:`, result);
    
    // Clean up the stored client after successful verification
    delete global.telegramClients[userId];

    return { 
      success: true, 
      message: 'Successfully logged in' 
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Verification error:`, error);
    
    // Clean up the stored client on error
    delete global.telegramClients[userId];
    
    if (error.message.includes('PHONE_CODE_INVALID')) {
      throw new Error('Invalid verification code. Please check and try again.');
    }
    
    throw error;
  }
};

module.exports = {
  createTelegramClient,
  loginWithPhone,
  verifyCode,
};
