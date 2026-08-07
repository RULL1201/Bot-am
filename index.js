const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ================= KONFIGURASI BOT & API =================
// Token bot diambil dari Environment Variable di Railway
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Konfigurasi API Alight Motion
const AM_API = 'https://restapidhan.vercel.app';
const AM_APIKEY = 'freeapikeydhan26';

// Konfigurasi API Payment Gateway
const PG_API = 'https://sobat.aksespg.qzz.io';
const PG_APIKEY = 'ak_live_c0bd68a111514536b8918d8884decce10020c4fcf1';

// ================= DATABASE SEMENTARA (SESSIONS) =================
// Menyimpan sesi pembeli (state) agar bot ingat alur setiap user
const userSessions = {};

function resetSession(chatId) {
    delete userSessions[chatId];
}

// ================= ALUR PERINTAH BOT =================

// Perintah /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Halo! Selamat datang di Bot Auto Order Alight Motion Premium.\n\nKetik /order untuk mulai membeli.\nKetik /cancel untuk membatalkan pesanan.");
});

// Perintah /cancel
bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    if (userSessions[chatId]) {
        resetSession(chatId);
        bot.sendMessage(chatId, "✅ Pesanan berhasil dibatalkan.");
    } else {
        bot.sendMessage(chatId, "Tidak ada pesanan yang sedang berlangsung.");
    }
});

// TAHAP 1: Perintah /order (Minta Email)
bot.onText(/\/order/, (msg) => {
    const chatId = msg.chat.id;
    
    // Set status user menjadi menunggu email
    userSessions[chatId] = { step: 'WAITING_EMAIL' };
    
    bot.sendMessage(chatId, "✉️ *Silakan kirimkan alamat Email kamu* yang akan dijadikan Premium:\n\n_(Pastikan email aktif karena sistem mungkin akan mengirimkan Magic Link ke email tersebut)_", { parse_mode: "Markdown" });
});

// Menangani pesan teks biasa (Untuk Email & Magic Link)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Abaikan jika pesan tidak ada teks atau berupa command
    if (!text || text.startsWith('/')) return;

    const session = userSessions[chatId];
    if (!session) return; 

    // TAHAP 2: Menerima Email & Membuat Tagihan QRIS
    if (session.step === 'WAITING_EMAIL') {
        if (!text.includes('@') || !text.includes('.')) {
            bot.sendMessage(chatId, "⚠️ Format email salah. Silakan kirimkan alamat email yang valid:");
            return;
        }

        session.email = text;
        bot.sendMessage(chatId, "⏳ Sedang membuat kode QRIS pembayaran...");

        try {
            const harga = 10000; // Harga produk
            const responsePG = await axios.post(`${PG_API}/v1/deposit/create`, {
                amount: harga,
                method: "qris"
            }, {
                headers: {
                    'X-API-Key': PG_APIKEY,
                    'Content-Type': 'application/json'
                }
            });

            if (responsePG.data && responsePG.data.success) {
                const depositId = responsePG.data.data.depositId;
                const qrString = responsePG.data.data.qrString;
                
                // Simpan ID Deposit dan ubah status menjadi nunggu bayar
                session.depositId = depositId;
                session.step = 'WAITING_PAYMENT';

                // Mengubah kode mentah QRIS menjadi Gambar menggunakan layanan QR Server
                const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrString)}`;
                
                const keyboard = {
                    inline_keyboard: [[{ text: "🔄 Cek Pembayaran", callback_data: `check_${depositId}` }]]
                };

                const caption = `✅ *Tagihan QRIS Berhasil Dibuat!*\n\n` +
                                `Email Tujuan: \`${session.email}\`\n` +
                                `ID Transaksi: \`${depositId}\`\n` +
                                `Total Bayar: *Rp ${harga}*\n\n` +
                                `Silakan *Simpan Gambar ini* dan scan menggunakan aplikasi e-Wallet (DANA, GoPay, OVO) atau M-Banking kamu.\n\n` +
                                `Jika sudah transfer, klik tombol *Cek Pembayaran*.`;
                
                bot.sendPhoto(chatId, qrImageUrl, { caption: caption, parse_mode: "Markdown", reply_markup: keyboard });
            } else {
                bot.sendMessage(chatId, "❌ Gagal membuat tagihan QRIS dari server pembayaran.");
                resetSession(chatId);
            }
        } catch (error) {
            console.error("Create QRIS Error:", error.message);
            bot.sendMessage(chatId, "⚠️ Server pembayaran sedang gangguan. Silakan coba lagi nanti.");
            resetSession(chatId);
        }
    }

    // TAHAP 4: Menerima Magic Link & Eksekusi API Alight Motion
    else if (session.step === 'WAITING_MAGIC_LINK') {
        if (!text.includes('http')) {
            bot.sendMessage(chatId, "⚠️ Itu tidak terlihat seperti link. Silakan *Copy & Paste* Magic Link dari email kamu ke sini:");
            return;
        }

        bot.sendMessage(chatId, "⏳ Sedang memproses Magic Link kamu ke server, mohon tunggu...");

        try {
            // Catatan: Jika API Dhan menggunakan nama parameter yang berbeda untuk Magic Link, 
            // silakan ganti '?url=' menjadi parameter yang benar (contoh: '?link=' atau '?magiclink=')
            const endpointVerify = `${AM_API}/api/alightmotion?apikey=${AM_APIKEY}&url=${encodeURIComponent(text)}`;
            
            const responseAM = await axios.get(endpointVerify);
            
            // Asumsi API Dhan mengembalikan data.status = true jika sukses
            if (responseAM.data && responseAM.data.status) {
                bot.sendMessage(chatId, `🎉 *Verifikasi Berhasil!*\n\nEmail \`${session.email}\` sekarang sudah aktif menjadi Alight Motion Premium.\n\nSelamat berkreasi!`, { parse_mode: "Markdown" });
                resetSession(chatId); 
            } else {
                bot.sendMessage(chatId, "❌ Gagal memverifikasi Magic Link. Pastikan link belum kadaluarsa atau API sedang gangguan. Hubungi admin.");
            }
        } catch (error) {
            console.error("API Dhan Error:", error.message);
            bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat memproses Magic Link ke server API.");
        }
    }
});

// TAHAP 3: Tombol Cek Pembayaran (Callback Query)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('check_')) {
        const depositId = data.replace('check_', '');
        const session = userSessions[chatId];

        bot.answerCallbackQuery(query.id, { text: "Mengecek status pembayaran ke server..." });

        if (!session || session.depositId !== depositId) {
            bot.sendMessage(chatId, "⚠️ Sesi pembayaran tidak ditemukan atau sudah kadaluarsa. Ketik /order untuk mengulang dari awal.");
            return;
        }

        if (session.step !== 'WAITING_PAYMENT') {
            bot.sendMessage(chatId, "⚠️ Transaksi ini sudah diproses ke tahap selanjutnya.");
            return;
        }

        try {
            const responseCheck = await axios.get(`${PG_API}/v1/deposit/status/${depositId}`, {
                headers: { 'X-API-Key': PG_APIKEY }
            });

            if (responseCheck.data && responseCheck.data.success) {
                const status = responseCheck.data.data.status; 

                if (status === 'success') {
                    // Pembayaran lunas, lanjut ke tahap Magic Link
                    session.step = 'WAITING_MAGIC_LINK';
                    
                    bot.sendMessage(chatId, `✅ *Pembayaran Berhasil Diterima!*\n\nSebuah *Magic Link* untuk login/verifikasi telah dikirimkan ke email kamu (\`${session.email}\`).\n\nSilakan buka kotak masuk email kamu, *Copy (Salin) Magic Link* tersebut, dan *Paste (Tempel)* ke chat ini sekarang.`, { parse_mode: "Markdown" });
                } else if (status === 'pending') {
                    bot.sendMessage(chatId, "⏳ *Status: BELUM DIBAYAR*\nSistem belum mendeteksi dana masuk. Jika kamu sudah bayar, tunggu 1-2 menit lalu klik cek lagi.");
                } else {
                    bot.sendMessage(chatId, `❌ Transaksi dibatalkan atau kadaluarsa (Status: ${status}).`);
                    resetSession(chatId);
                }
            } else {
                bot.sendMessage(chatId, "⚠️ Gagal mengecek status pembayaran ke server.");
            }
        } catch (error) {
            console.error("Check Payment Error:", error.message);
            bot.sendMessage(chatId, "⚠️ Terjadi kesalahan jaringan saat mengecek pembayaran.");
        }
    }
});

console.log("🤖 Bot Alight Motion Premium sedang berjalan...");