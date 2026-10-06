const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const QRCode = require('qrcode');
const pino = require('pino');
const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3300;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const SESSION_DIR = path.join(__dirname, 'auth_info_baileys');

let sock = null;
let qrCodeData = null;
let qrCodeUrl = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
let connectedPhone = null;
let connectedName = null;
let lastDisconnectReason = null;

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

async function connectToWhatsApp() {
    connectionStatus = 'connecting';
    console.log('[WhatsApp Engine] Initializing WhatsApp connection...');

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307], isLatest: true }));

    console.log(`[WhatsApp Engine] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.macOS('School ERP Multi-Tenant'),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = qr;
            try {
                qrCodeUrl = await QRCode.toDataURL(qr, {
                    width: 320,
                    margin: 2,
                    color: {
                        dark: '#111827',
                        light: '#ffffff'
                    }
                });
                connectionStatus = 'qr_ready';
                console.log('[WhatsApp Engine] New QR Code generated, ready for scan.');
            } catch (err) {
                console.error('[WhatsApp Engine] Error rendering QR Code:', err);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            lastDisconnectReason = statusCode;
            console.log(`[WhatsApp Engine] Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);

            connectionStatus = 'disconnected';
            qrCodeData = null;
            qrCodeUrl = null;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('[WhatsApp Engine] Device logged out. Wiping session directory...');
                clearSessionFiles();
                setTimeout(connectToWhatsApp, 2000);
            } else if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCodeData = null;
            qrCodeUrl = null;

            // Extract connected phone and name
            const userJid = sock.user?.id || '';
            connectedPhone = userJid.split(':')[0] || userJid.split('@')[0];
            connectedName = sock.user?.name || 'School WhatsApp Number';

            console.log(`[WhatsApp Engine] Connected successfully as ${connectedName} (+${connectedPhone})!`);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

function clearSessionFiles() {
    try {
        if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            fs.mkdirSync(SESSION_DIR, { recursive: true });
        }
        connectedPhone = null;
        connectedName = null;
    } catch (e) {
        console.error('[WhatsApp Engine] Error clearing session:', e);
    }
}

function formatJid(phone) {
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.length === 11 && clean.startsWith('0')) {
        clean = '91' + clean.substring(1);
    } else if (clean.length === 10) {
        clean = '91' + clean;
    }
    return clean + '@s.whatsapp.net';
}

// Rate limiting & anti-spam dispatch lock
let lastDispatchTimestamp = 0;
const MIN_DISPATCH_GAP_MS = 2500; // Microservice guarantees minimum 2.5s physical gap between Baileys dispatches

async function enforceSafeDispatchGap() {
    const elapsed = Date.now() - lastDispatchTimestamp;
    if (elapsed < MIN_DISPATCH_GAP_MS) {
        const waitMs = MIN_DISPATCH_GAP_MS - elapsed;
        console.log(`[WhatsApp Engine] Enforcing safety rate limit gap: waiting ${waitMs}ms before dispatch...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    lastDispatchTimestamp = Date.now();
}

// ======================== API ROUTES ========================

// 1. Health & Status
app.get('/status', (req, res) => {
    res.json({
        success: true,
        online: true,
        status: connectionStatus,
        phone: connectedPhone,
        name: connectedName,
        qr: qrCodeUrl,
        lastDisconnect: lastDisconnectReason,
        timestamp: new Date().toISOString()
    });
});

// 2. Direct QR View (HTML or image)
app.get('/qr', (req, res) => {
    if (connectionStatus === 'connected') {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h3 style="color: #16a34a;">WhatsApp is Connected!</h3>
                <p>Authorized as <strong>+${connectedPhone}</strong> (${connectedName || 'School Phone'})</p>
            </div>
        `);
    }

    if (!qrCodeUrl) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h3>Generating QR Code...</h3>
                <p>Please wait 3-5 seconds and refresh.</p>
                <script>setTimeout(() => location.reload(), 3000);</script>
            </div>
        `);
    }

    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
            <h3>Scan WhatsApp QR Code</h3>
            <p>Open WhatsApp on School Phone &gt; Linked Devices &gt; Link a Device</p>
            <img src="${qrCodeUrl}" style="border: 2px solid #e5e7eb; border-radius: 12px; max-width: 300px;" alt="QR Code" />
            <p style="color: #6b7280; font-size: 13px;">Auto-refreshing status...</p>
            <script>
                setInterval(async () => {
                    const r = await fetch('/status').then(res => res.json()).catch(() => null);
                    if (r && r.status === 'connected') location.reload();
                }, 3000);
            </script>
        </div>
    `);
});

// 3. Send Text Message
app.post('/send-text', async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ success: false, error: 'Recipient "to" and "message" are required.' });
        }

        if (connectionStatus !== 'connected' || !sock) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp device is not connected. Please scan QR Code in School WhatsApp Settings.'
            });
        }

        const jid = formatJid(to);

        // Verify if recipient number exists on WhatsApp
        try {
            const waResults = await sock.onWhatsApp(jid);
            const onWa = Array.isArray(waResults) ? waResults[0] : null;

            if (!onWa || !onWa.exists) {
                console.log(`[WhatsApp Engine] Number ${to} (${jid}) is NOT registered on WhatsApp.`);
                return res.status(400).json({
                    success: false,
                    error: `Mobile number +${jid.replace('@s.whatsapp.net', '')} is NOT registered on WhatsApp. Please check the student's parent contact number.`
                });
            }

            const targetJid = onWa.jid;
            await enforceSafeDispatchGap();
            const result = await sock.sendMessage(targetJid, { text: String(message) });
            console.log(`[WhatsApp Engine] Message sent successfully to ${to} (${targetJid}). ID: ${result?.key?.id}`);

            return res.json({
                success: true,
                recipient: to,
                jid: targetJid,
                messageId: result?.key?.id,
                timestamp: new Date().toISOString()
            });
        } catch (waErr) {
            console.error('[WhatsApp Engine] Error in onWhatsApp check:', waErr);
            // Fallback: send directly to formatted jid
            await enforceSafeDispatchGap();
            const result = await sock.sendMessage(jid, { text: String(message) });
            console.log(`[WhatsApp Engine] (Fallback) Message sent to ${to} (${jid}). ID: ${result?.key?.id}`);
            return res.json({
                success: true,
                recipient: to,
                jid,
                messageId: result?.key?.id,
                timestamp: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('[WhatsApp Engine] send-text fatal error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Send Media (PDF / Image / Document)
app.post('/send-media', async (req, res) => {
    try {
        const { to, caption, file_path, file_url, filename, mimetype } = req.body;
        if (!to) {
            return res.status(400).json({ success: false, error: 'Recipient "to" is required.' });
        }

        if (connectionStatus !== 'connected' || !sock) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp device is not connected. Please scan QR Code in School WhatsApp Settings.'
            });
        }

        const jid = formatJid(to);
        let buffer = null;

        if (file_path && fs.existsSync(file_path)) {
            buffer = fs.readFileSync(file_path);
        } else if (file_url) {
            // Fetch buffer via http (native fetch in Node 18+ or node-fetch fallback)
            const resp = typeof fetch !== 'undefined' ? await fetch(file_url) : await (await import('node-fetch')).default(file_url);
            const arrayBuffer = await resp.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        }

        if (!buffer) {
            return res.status(400).json({ success: false, error: 'Valid file_path or file_url must be provided and accessible.' });
        }

        const safeFilename = filename || 'document.pdf';
        const isPdf = safeFilename.toLowerCase().endsWith('.pdf') || (mimetype && mimetype.includes('pdf'));
        const isImage = (mimetype && mimetype.startsWith('image/')) || /\.(jpe?g|png|webp)$/i.test(safeFilename);

        let messagePayload = {};
        if (isImage) {
            messagePayload = {
                image: buffer,
                caption: caption || ''
            };
        } else {
            messagePayload = {
                document: buffer,
                mimetype: mimetype || (isPdf ? 'application/pdf' : 'application/octet-stream'),
                fileName: safeFilename,
                caption: caption || ''
            };
        }

        await enforceSafeDispatchGap();
        const result = await sock.sendMessage(jid, messagePayload);

        res.json({
            success: true,
            recipient: to,
            jid,
            filename: safeFilename,
            messageId: result?.key?.id,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[WhatsApp Engine] send-media error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Logout & Disconnect
app.post('/logout', async (req, res) => {
    try {
        console.log('[WhatsApp Engine] Disconnecting and resetting session...');
        if (sock) {
            try {
                await sock.logout();
            } catch (e) {}
            sock.end(new Error('User requested logout'));
        }
        clearSessionFiles();
        connectionStatus = 'disconnected';
        qrCodeData = null;
        qrCodeUrl = null;

        setTimeout(connectToWhatsApp, 1500);

        res.json({
            success: true,
            message: 'Session cleared. Generating fresh QR code in a few seconds.'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Restart Connection
app.post('/restart', async (req, res) => {
    try {
        if (sock) {
            sock.end(new Error('Restart requested'));
        }
        setTimeout(connectToWhatsApp, 1000);
        res.json({ success: true, message: 'Reconnection triggered.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WhatsApp Engine] Microservice listening on port ${PORT}`);
    connectToWhatsApp();
});
