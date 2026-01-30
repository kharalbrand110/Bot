const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'bot.db'));

// Initialize database
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE,
            pairing_code TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            paired_at DATETIME
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_phone TEXT,
            platform TEXT,
            url TEXT,
            status TEXT DEFAULT 'pending',
            file_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS admin_stats (
            id INTEGER PRIMARY KEY,
            total_pairings INTEGER DEFAULT 0,
            total_downloads INTEGER DEFAULT 0,
            youtube_downloads INTEGER DEFAULT 0,
            instagram_downloads INTEGER DEFAULT 0
        )
    `);
});

// WhatsApp Client
let whatsappClient = null;
let qrCodeData = null;

// Initialize WhatsApp
function initWhatsApp() {
    try {
        whatsappClient = new Client({
            authStrategy: new LocalAuth({ 
                clientId: "whatsapp-downloader-bot",
                dataPath: path.join(__dirname, '.wwebjs_auth')
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        // QR Code Event
        whatsappClient.on('qr', async (qr) => {
            console.log('QR Code received, generating image...');
            qrCodeData = qr;
            try {
                await qrcode.toFile(path.join(__dirname, 'public', 'qrcode.png'), qr);
                console.log('QR Code saved as qrcode.png');
            } catch (error) {
                console.error('Error saving QR code:', error);
            }
        });

        // Ready Event
        whatsappClient.on('ready', () => {
            console.log('✅ WhatsApp client is ready!');
        });

        // Authenticated
        whatsappClient.on('authenticated', () => {
            console.log('🔐 WhatsApp authenticated successfully');
        });

        // Auth Failure
        whatsappClient.on('auth_failure', (msg) => {
            console.error('❌ WhatsApp authentication failed:', msg);
        });

        // Disconnected
        whatsappClient.on('disconnected', (reason) => {
            console.log('⚠️ WhatsApp disconnected:', reason);
            setTimeout(initWhatsApp, 5000);
        });

        // Message Event
        whatsappClient.on('message', handleMessage);

        whatsappClient.initialize();
    } catch (error) {
        console.error('Error initializing WhatsApp:', error);
        setTimeout(initWhatsApp, 10000);
    }
}

// Handle WhatsApp Messages
async function handleMessage(message) {
    try {
        const phone = message.from.replace('@c.us', '');
        const text = message.body.trim();
        
        console.log(`📱 Message from ${phone}: ${text}`);

        // Handle Pairing
        if (text.startsWith('PAIR ')) {
            await handlePairing(phone, text);
            return;
        }

        // Handle Help Command
        if (text === '!help' || text === '/help') {
            await sendHelpMessage(message);
            return;
        }

        // Check if user is paired
        const isPaired = await checkIfPaired(phone);
        if (!isPaired) {
            await message.reply('❌ *Device not paired!*\n\nPlease visit our website to pair your device first.\n\nWebsite: ' + (process.env.SITE_URL || 'http://localhost:3000'));
            return;
        }

        // Handle Download Commands
        if (text.startsWith('!')) {
            await handleDownloadCommand(message, text, phone);
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

// Handle Pairing
async function handlePairing(phone, text) {
    try {
        const code = text.split(' ')[1];
        
        db.get('SELECT * FROM users WHERE phone = ? AND pairing_code = ?', 
            [phone, code], 
            async (err, user) => {
                if (err || !user) {
                    await whatsappClient.sendMessage(`${phone}@c.us`, '❌ Invalid or expired pairing code.');
                    return;
                }

                // Update user status
                db.run('UPDATE users SET status = "paired", paired_at = CURRENT_TIMESTAMP WHERE phone = ?', 
                    [phone], 
                    async (err) => {
                        if (err) {
                            await whatsappClient.sendMessage(`${phone}@c.us`, '❌ Pairing failed. Please try again.');
                            return;
                        }

                        // Send success message
                        const welcomeMsg = `🎉 *Pairing Successful!*\n\n✅ Your WhatsApp is now connected to Downloader Bot.\n\n📥 *Available Commands:*\n\n• !yt [url] - YouTube Download\n• !insta [url] - Instagram Download\n• !fb [url] - Facebook Download\n• !tt [url] - TikTok Download\n• !tw [url] - Twitter Download\n• !help - Show all commands\n\n*Example:*\n!yt https://youtube.com/watch?v=xxxx\n\nHappy downloading! 🎬`;
                        
                        await whatsappClient.sendMessage(`${phone}@c.us`, welcomeMsg);
                        
                        // Update stats
                        db.run('UPDATE admin_stats SET total_pairings = total_pairings + 1 WHERE id = 1');
                    });
            });
    } catch (error) {
        console.error('Pairing error:', error);
    }
}

// Check if user is paired
function checkIfPaired(phone) {
    return new Promise((resolve) => {
        db.get('SELECT status FROM users WHERE phone = ?', [phone], (err, row) => {
            resolve(row && row.status === 'paired');
        });
    });
}

// Handle Download Commands
async function handleDownloadCommand(message, text, phone) {
    const args = text.split(' ');
    const command = args[0].toLowerCase();
    const url = args[1];

    if (!url) {
        await message.reply('⚠️ *Please provide URL!*\n\nExample: !yt https://youtube.com/watch?v=xxxx');
        return;
    }

    await message.reply('⏳ *Downloading...*\n\nPlease wait while we process your request.');

    try {
        let downloadResult;
        
        switch(command) {
            case '!yt':
                downloadResult = await downloadYouTube(url, phone);
                break;
            case '!insta':
                downloadResult = await downloadInstagram(url, phone);
                break;
            case '!fb':
                downloadResult = await downloadFacebook(url, phone);
                break;
            case '!tt':
                downloadResult = await downloadTikTok(url, phone);
                break;
            case '!tw':
                downloadResult = await downloadTwitter(url, phone);
                break;
            default:
                await message.reply('❌ *Invalid command!*\n\nType !help to see all available commands.');
                return;
        }

        if (downloadResult.success) {
            // Send video
            await whatsappClient.sendMessage(message.from, {
                document: { url: downloadResult.fileUrl },
                fileName: downloadResult.fileName,
                caption: `✅ *Download Complete!*\n\nPlatform: ${downloadResult.platform}\nSize: ${downloadResult.fileSize || 'Unknown'}`
            });

            // Update stats
            db.run(`UPDATE admin_stats SET total_downloads = total_downloads + 1, ${downloadResult.platform}_downloads = ${downloadResult.platform}_downloads + 1 WHERE id = 1`);
        } else {
            await message.reply(`❌ *Download Failed!*\n\nError: ${downloadResult.error}`);
        }
    } catch (error) {
        console.error('Download error:', error);
        await message.reply('❌ *An error occurred!*\n\nPlease try again later.');
    }
}

// Send Help Message
async function sendHelpMessage(message) {
    const helpText = `🤖 *WhatsApp Downloader Bot Help*\n\n📥 *Available Commands:*\n\n• !yt [url] - Download YouTube videos\n• !insta [url] - Download Instagram Reels/Posts\n• !fb [url] - Download Facebook videos\n• !tt [url] - Download TikTok videos\n• !tw [url] - Download Twitter/X videos\n• !help - Show this help message\n\n📝 *Examples:*\n!yt https://youtube.com/watch?v=xxxx\n!insta https://instagram.com/reel/xxxx\n\n⚠️ *Note:*\n• Max video size: 100MB\n• Supported formats: MP4, MP3\n\n🔗 *Website:* ${process.env.SITE_URL || 'http://localhost:3000'}`;
    
    await message.reply(helpText);
}

// Download Functions
async function downloadYouTube(url, phone) {
    return new Promise((resolve) => {
        const timestamp = Date.now();
        const fileName = `youtube_${timestamp}.mp4`;
        const filePath = path.join(__dirname, 'downloads', fileName);

        // Create downloads directory
        if (!fs.existsSync(path.join(__dirname, 'downloads'))) {
            fs.mkdirSync(path.join(__dirname, 'downloads'), { recursive: true });
        }

        const command = `yt-dlp -f "best[height<=720]" -o "${filePath}" "${url}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, error: stderr });
                return;
            }

            // Log download
            db.run('INSERT INTO downloads (user_phone, platform, url, status, file_path) VALUES (?, ?, ?, ?, ?)',
                [phone, 'youtube', url, 'completed', fileName]);

            resolve({
                success: true,
                platform: 'youtube',
                fileUrl: `/downloads/${fileName}`,
                fileName: fileName,
                fileSize: getFileSize(filePath)
            });
        });
    });
}

async function downloadInstagram(url, phone) {
    try {
        // Using API service (you need to get your own API key)
        const apiUrl = `https://api.instagram.com/v1/oembed?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);
        
        // For now, return a dummy response
        return {
            success: false,
            error: 'Instagram download coming soon. Currently testing YouTube only.'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Other download functions (similar structure)
async function downloadFacebook(url, phone) {
    return { success: false, error: 'Facebook download coming soon' };
}

async function downloadTikTok(url, phone) {
    return { success: false, error: 'TikTok download coming soon' };
}

async function downloadTwitter(url, phone) {
    return { success: false, error: 'Twitter download coming soon' };
}

// Utility function to get file size
function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;
        const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
        return `${fileSizeInMB} MB`;
    } catch (error) {
        return 'Unknown';
    }
}

// API Routes
app.get('/api/qrcode', (req, res) => {
    if (qrCodeData) {
        qrcode.toDataURL(qrCodeData, (err, url) => {
            if (err) {
                res.json({ success: false, error: err.message });
            } else {
                res.json({ success: true, qrcode: url });
            }
        });
    } else {
        res.json({ success: false, error: 'QR code not generated yet' });
    }
});

app.post('/api/pair', (req, res) => {
    const { phone } = req.body;
    
    if (!phone || phone.length !== 10) {
        return res.json({ success: false, error: 'Invalid phone number. Enter 10 digits without +92' });
    }

    const fullPhone = `+92${phone}`;
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();

    db.get('SELECT * FROM users WHERE phone = ?', [fullPhone], (err, user) => {
        if (err) {
            return res.json({ success: false, error: 'Database error' });
        }

        if (user && user.status === 'paired') {
            return res.json({ 
                success: true, 
                alreadyPaired: true,
                message: 'This number is already paired' 
            });
        }

        const query = user 
            ? 'UPDATE users SET pairing_code = ?, status = ? WHERE phone = ?'
            : 'INSERT INTO users (phone, pairing_code, status) VALUES (?, ?, ?)';
        
        const params = user 
            ? [pairingCode, 'pending', fullPhone]
            : [fullPhone, pairingCode, 'pending'];

        db.run(query, params, async (err) => {
            if (err) {
                return res.json({ success: false, error: 'Database error' });
            }

            // Send WhatsApp message
            if (whatsappClient) {
                const message = `🔐 *WhatsApp Downloader Bot Pairing*\n\nYour pairing code: *${pairingCode}*\n\nReply with: *PAIR ${pairingCode}*\n\nCode expires in 10 minutes.\n\nWebsite: ${req.headers.origin}`;
                
                try {
                    await whatsappClient.sendMessage(`${fullPhone}@c.us`, message);
                    res.json({ 
                        success: true, 
                        code: pairingCode,
                        message: `Pairing code sent to ${fullPhone}` 
                    });
                } catch (error) {
                    res.json({ 
                        success: false, 
                        error: 'Failed to send WhatsApp message. Make sure the number is registered on WhatsApp.' 
                    });
                }
            } else {
                res.json({ success: false, error: 'WhatsApp client not ready' });
            }
        });
    });
});

app.post('/api/check-pairing', (req, res) => {
    const { phone, code } = req.body;
    const fullPhone = `+92${phone}`;
    
    db.get('SELECT * FROM users WHERE phone = ? AND pairing_code = ?', 
        [fullPhone, code], 
        (err, user) => {
            if (err || !user) {
                return res.json({ paired: false });
            }
            
            res.json({ 
                paired: user.status === 'paired',
                status: user.status,
                pairedAt: user.paired_at 
            });
        });
});

app.get('/api/stats', (req, res) => {
    db.all(`
        SELECT 
            (SELECT COUNT(*) FROM users WHERE status = 'paired') as total_users,
            (SELECT COUNT(*) FROM downloads WHERE status = 'completed') as total_downloads,
            (SELECT COUNT(*) FROM downloads WHERE platform = 'youtube' AND status = 'completed') as youtube_downloads,
            (SELECT COUNT(*) FROM downloads WHERE platform = 'instagram' AND status = 'completed') as instagram_downloads,
            (SELECT COUNT(*) FROM downloads WHERE DATE(created_at) = DATE('now')) as today_downloads
    `, (err, rows) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json(rows[0] || {});
        }
    });
});

// Admin API
app.get('/api/admin/users', (req, res) => {
    db.all('SELECT phone, status, paired_at FROM users ORDER BY created_at DESC LIMIT 100', 
        (err, rows) => {
            if (err) {
                res.json({ error: err.message });
            } else {
                res.json(rows);
            }
        });
});

// Serve static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Website: http://localhost:${PORT}`);
    
    // Initialize WhatsApp
    initWhatsApp();
    
    // Initialize admin stats
    db.run('INSERT OR IGNORE INTO admin_stats (id) VALUES (1)');
});