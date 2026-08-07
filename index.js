const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ================= KONFIGURASI BOT & API =================
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const AM_API = 'https://restapidhan.vercel.app';
const AM_APIKEY = 'freeapikeydhan26';

// Konfigurasi Payment Gateway Tokoshopp (Artan Shop)
const PG_API = 'https://tokoshopp.web.id';
const PG_APIKEY = 'artan_4a8fb9cd50ade6cea5fed941bdfedfb2aed2c663';

// 👑 MASUKKAN ID TELEGRAM KAMU DI SINI (ANGKA)
const OWNER_ID = '6161191871'; 

// ================= DAFTAR PRODUK PERMANEN =================
let memoryDb = {
    users: [],
    income: [], 
    products: {
        'am': { 
            id: 'am', 
            name: 'Alight Motion Premium', 
            price: 10000, 
            discount: 0, 
            type: 'magic_link' 
        },
        'canva': { 
            id: 'canva', 
            name: 'Canva Pro 1 Tahun', 
            price: 15000, 
            discount: 0, 
            type: 'login_link', 
            link: 'https://www.canva.com/brand/join?token=CONTOH_LINK_KAMU' 
        },
        'netflix': { 
            id: 'netflix', 
            name: 'Netflix Sharing 1 Bulan', 
            price: 25000, 
            discount: 5000, 
            type: 'login_link', 
            link: 'https://netflix.com/?nftoken=Bgj8vOvcAxL/AUSX4TyiDz+ltMOsy+kdng9fntxmd9ftfWPbxN2OC5FLvpJEmsWROJQjadH1m+QL1gnT3hdJ5tn+dw9ZKw0YLRIm3wIyh+IRuJf7Mepy4sIZIzm8jZQwnsYeSzoMQvbxW9CQyroB9GKbPfv+3GJ+7nOfpxSHYHp4fShq4frNbKgpUKHZU39li9W1guhOzEmd6+qPZcnVfbvH3d+/RZHUrnQ6fq7hv2GlHrqjcDm9QYTSNpsHZ5arwrAuqfZ9ihaYwKKBAzNkEtH2bNME84rbUAVtvVjY4oXgCrN65wuinL8aunH1YQ7JPH/0q5VhodhoGQGtq3J7dWn2Kb59tJJiphgGIg4KDKW332CYT0H1hh9eew==' 
        }
    }
};

// ================= SISTEM SESI =================
const userSessions = {};
const adminSessions = {};

function resetSession(chatId) { delete userSessions[chatId]; }
function resetAdminSession(chatId) { delete adminSessions[chatId]; }

function getTodayDate() { return new Date().toISOString().split('T')[0]; }
function getThisMonth() { return new Date().toISOString().slice(0, 7); }

// ================= FITUR USER =================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (!memoryDb.users.includes(chatId)) {
        memoryDb.users.push(chatId);
    }

    // Tombol menu utama beserta tombol Hubungi Admin
    const keyboard = {
        inline_keyboard: [
            [{ text: "🛒 Beli Produk (/order)", callback_data: "menu_order" }],
            [{ text: "💬 Hubungi Admin", url: "https://t.me/RULZZKENTOD" }]
        ]
    };

    bot.sendMessage(chatId, "👋 Halo! Selamat datang di Bot Auto Order.\n\nSilakan klik tombol di bawah untuk melihat produk atau menghubungi admin jika ada kendala.", {
        reply_markup: keyboard
    });
});

bot.onText(/\/cancel/, (msg) => {
    resetSession(msg.chat.id);
    resetAdminSession(msg.chat.id);
    bot.sendMessage(msg.chat.id, "✅ Perintah berhasil dibatalkan.");
});

bot.onText(/\/order/, (msg) => {
    kirimKatalogProduk(msg.chat.id);
});

// Fungsi untuk menampilkan daftar produk
function kirimKatalogProduk(chatId) {
    const products = Object.values(memoryDb.products);

    if (products.length === 0) return bot.sendMessage(chatId, "Mohon maaf, saat ini tidak ada produk yang tersedia.");

    const keyboard = products.map(p => {
        const finalPrice = p.price - p.discount;
        let textBtn = `${p.name} - Rp ${finalPrice}`;
        if (p.discount > 0) textBtn += ` (Diskon Rp ${p.discount})`;
        return [{ text: textBtn, callback_data: `buy_${p.id}` }];
    });

    // Tambahkan tombol Hubungi Admin di bawah katalog produk juga
    keyboard.push([{ text: "💬 Hubungi Admin", url: "https://t.me/RULZZMBUT" }]);

    bot.sendMessage(chatId, "🛒 *Pilih Produk yang ingin dibeli:*", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
    });
}

// ================= FITUR OWNER (ADMIN) =================

bot.onText(/\/owner/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== OWNER_ID) return bot.sendMessage(chatId, "⛔ Kamu bukan Owner bot ini.");

    const today = getTodayDate();
    const month = getThisMonth();
    
    let dailyIncome = 0;
    let monthlyIncome = 0;
    
    memoryDb.income.forEach(trx => {
        if (trx.date === today) dailyIncome += trx.amount;
        if (trx.date.startsWith(month)) monthlyIncome += trx.amount;
    });

    const caption = `👑 *DASHBOARD OWNER*\n\n` +
                    `👥 Total Pengguna: *${memoryDb.users.length}*\n` +
                    `💰 Pendapatan Hari Ini: *Rp ${dailyIncome}*\n` +
                    `💳 Pendapatan Bulan Ini: *Rp ${monthlyIncome}*\n\n` +
                    `Pilih menu di bawah:`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "✏️ Ubah Harga", callback_data: `admin_edit_price` }, 
                { text: "✂️ Atur Diskon", callback_data: `admin_edit_discount` }
            ],
            [
                { text: "📢 Broadcast Pesan", callback_data: `admin_broadcast` }
            ]
        ]
    };

    bot.sendMessage(chatId, caption, { parse_mode: "Markdown", reply_markup: keyboard });
});

// ================= HANDLER CALLBACK =================

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    bot.answerCallbackQuery(query.id);

    // Menangani tombol menu order dari pesan /start
    if (data === 'menu_order') {
        kirimKatalogProduk(chatId);
    }

    // --- LOGIKA USER MEMBELI ---
    else if (data.startsWith('buy_')) {
        const productId = data.split('_')[1];
        const product = memoryDb.products[productId];

        if (!product) return bot.sendMessage(chatId, "⚠️ Produk tidak ditemukan. Ketik /order untuk memperbarui daftar.");

        userSessions[chatId] = { productId: product.id };

        if (product.id === 'am') {
            userSessions[chatId].step = 'WAITING_EMAIL';
            bot.sendMessage(chatId, `Membeli: *${product.name}*\n\n✉️ *Silakan kirimkan alamat Email kamu* yang akan dijadikan Premium:`, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, `⏳ Memproses tagihan untuk *${product.name}*...`, { parse_mode: "Markdown" });
            buatTagihanQRIS(chatId, product);
        }
    }

    // --- LOGIKA USER CEK PEMBAYARAN ---
    else if (data.startsWith('check_')) {
        const transactionId = data.replace('check_', '');
        const session = userSessions[chatId];

        if (!session || session.transactionId !== transactionId) return bot.sendMessage(chatId, "⚠️ Sesi kadaluarsa. Ketik /order ulang.");
        if (session.step !== 'WAITING_PAYMENT') return;

        try {
            const responseCheck = await axios.post(`${PG_API}/api/payment/status`, {
                transaction_id: transactionId
            }, { 
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': PG_APIKEY 
                } 
            });
            
            if (responseCheck.data && responseCheck.data.success) {
                const status = responseCheck.data.status; 
                if (status === 'paid' || status === 'success') {
                    const product = memoryDb.products[session.productId];
                    
                    memoryDb.income.push({ date: getTodayDate(), amount: session.finalPrice });

                    bot.sendMessage(OWNER_ID, `💸 *PEMBAYARAN MASUK!*\nProduk: ${product.name}\nHarga: Rp ${session.finalPrice}`, { parse_mode: "Markdown" });

                    if (product.id === 'am') {
                        session.step = 'WAITING_MAGIC_LINK';
                        bot.sendMessage(chatId, `✅ *Pembayaran Lunas!*\n\nSilakan buka email kamu (\`${session.email}\`), Copy *Magic Link* dari Alight Motion, lalu *Kirimkan ke sini*.`, { parse_mode: "Markdown" });
                    } else {
                        const pesanSukses = `🎉 *Pembayaran Lunas & Berhasil!*\n\nTerima kasih telah membeli *${product.name}*.\n\nBerikut adalah *Link Akses / Login* kamu:\n${product.link}\n\nSelamat menggunakan!`;
                        bot.sendMessage(chatId, pesanSukses, { parse_mode: "Markdown" });
                        resetSession(chatId); 
                    }
                } else if (status === 'pending') {
                    bot.sendMessage(chatId, "⏳ Belum dibayar, jika sudah transfer mohon tunggu sebentar lalu klik lagi.");
                } else {
                    bot.sendMessage(chatId, `❌ Status transaksi: ${status}`);
                    resetSession(chatId);
                }
            }
        } catch (err) {
            console.error("Check Error:", err.response ? err.response.data : err.message);
            bot.sendMessage(chatId, "⚠️ Gagal mengecek status ke server pembayaran.");
        }
    }

    // --- LOGIKA ADMIN ---
    else if (chatId.toString() === OWNER_ID) {
        if (data === 'admin_broadcast') {
            adminSessions[chatId] = { action: 'WAITING_BROADCAST_MSG' };
            bot.sendMessage(chatId, "📢 Kirimkan pesan yang ingin di-broadcast ke seluruh pengguna bot (Bisa teks/foto):");
        }
        else if (data === 'admin_edit_price' || data === 'admin_edit_discount') {
            const isPrice = data === 'admin_edit_price';
            const actionType = isPrice ? 'WAITING_SELECT_PRICE' : 'WAITING_SELECT_DISCOUNT';
            adminSessions[chatId] = { action: actionType };

            const keyboard = Object.values(memoryDb.products).map(p => [{ text: p.name, callback_data: `editprod_${p.id}` }]);
            bot.sendMessage(chatId, `Pilih produk yang ingin diubah ${isPrice ? 'Harganya' : 'Diskonnya'}:`, { reply_markup: { inline_keyboard: keyboard } });
        }
        else if (data.startsWith('editprod_')) {
            const prodId = data.split('_')[1];
            const adminAct = adminSessions[chatId]?.action;

            if (adminAct === 'WAITING_SELECT_PRICE') {
                adminSessions[chatId] = { action: 'WAITING_NEW_PRICE', prodId: prodId };
                bot.sendMessage(chatId, `Kirimkan harga baru (Angka saja) untuk produk: ${memoryDb.products[prodId].name}`);
            } else if (adminAct === 'WAITING_SELECT_DISCOUNT') {
                adminSessions[chatId] = { action: 'WAITING_NEW_DISCOUNT', prodId: prodId };
                bot.sendMessage(chatId, `Kirimkan jumlah diskon (Angka saja) untuk produk: ${memoryDb.products[prodId].name}`);
            }
        }
    }
});

// ================= FUNGSI BUAT QRIS =================
async function buatTagihanQRIS(chatId, product) {
    const finalPrice = product.price - product.discount;
    const session = userSessions[chatId];
    session.finalPrice = finalPrice;
    const orderId = `INV-${Date.now()}`;

    try {
        const responsePG = await axios.post(`${PG_API}/api/payment/create`, { 
            amount: finalPrice, 
            order_id: orderId 
        }, {
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': PG_APIKEY 
            }
        });

        if (responsePG.data && responsePG.data.success) {
            const transactionId = responsePG.data.transaction_id;
            const qrImageBase64 = responsePG.data.qr_image; 
            
            session.transactionId = transactionId;
            session.step = 'WAITING_PAYMENT';

            const base64Data = qrImageBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');

            // Menyertakan tombol Cek Pembayaran dan Hubungi Admin pada pesan tagihan QRIS
            const keyboard = { 
                inline_keyboard: [
                    [{ text: "🔄 Cek Pembayaran", callback_data: `check_${transactionId}` }],
                    [{ text: "💬 Hubungi Admin", url: "https://t.me/RULZZKENTOD" }]
                ] 
            };
            
            let infoText = `✅ *Tagihan Dibuat!*\n\nProduk: ${product.name}\n`;
            if (session.email) infoText += `Email: \`${session.email}\`\n`;
            infoText += `ID Transaksi: \`${transactionId}\`\n`;
            infoText += `Total Bayar: *Rp ${finalPrice}*\n\nSilakan scan QRIS di atas, lalu klik tombol cek pembayaran.`;

            bot.sendPhoto(chatId, buffer, { caption: infoText, parse_mode: "Markdown", reply_markup: keyboard });
        } else {
            bot.sendMessage(chatId, "❌ Gagal membuat tagihan QRIS dari server.");
            resetSession(chatId);
        }
    } catch (error) {
        console.error("PG Create Error:", error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, "⚠️ Server pembayaran gangguan atau API Key salah.");
        resetSession(chatId);
    }
}

// ================= HANDLER PESAN TEKS =================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (text && text.startsWith('/')) return;

    // ----- LOGIKA INPUT ADMIN -----
    if (adminSessions[chatId]) {
        const adminAct = adminSessions[chatId];
        
        if (adminAct.action === 'WAITING_BROADCAST_MSG') {
            bot.sendMessage(chatId, "📢 Mengirim broadcast...");
            let count = 0;
            for (let userId of memoryDb.users) {
                try { await bot.copyMessage(userId, chatId, msg.message_id); count++; } catch (e) {} 
            }
            bot.sendMessage(chatId, `✅ Broadcast selesai terkirim ke ${count} pengguna.`);
            resetAdminSession(chatId);
            return;
        }

        else if (adminAct.action === 'WAITING_NEW_PRICE' || adminAct.action === 'WAITING_NEW_DISCOUNT') {
            const amount = parseInt(text);
            if (isNaN(amount)) return bot.sendMessage(chatId, "Harap masukkan angka saja.");
            
            const prodId = adminAct.prodId;
            if (adminAct.action === 'WAITING_NEW_PRICE') {
                memoryDb.products[prodId].price = amount;
                bot.sendMessage(chatId, `✅ Harga ${memoryDb.products[prodId].name} berhasil diubah menjadi Rp ${amount}`);
            } else {
                memoryDb.products[prodId].discount = amount;
                bot.sendMessage(chatId, `✅ Diskon ${memoryDb.products[prodId].name} berhasil diset menjadi Rp ${amount}`);
            }
            resetAdminSession(chatId);
            return;
        }
    }

    // ----- LOGIKA INPUT USER -----
    const session = userSessions[chatId];
    if (!session || !text) return;

    if (session.step === 'WAITING_EMAIL') {
        if (!text.includes('@') || !text.includes('.')) return bot.sendMessage(chatId, "⚠️ Format email salah.");
        session.email = text;
        
        const product = memoryDb.products[session.productId];
        bot.sendMessage(chatId, "⏳ Sedang membuat kode QRIS...");
        buatTagihanQRIS(chatId, product);
    }

    else if (session.step === 'WAITING_MAGIC_LINK') {
        if (!text.includes('http')) return bot.sendMessage(chatId, "⚠️ Harap masukkan URL (Link) yang valid.");
        bot.sendMessage(chatId, "⏳ Memproses Magic Link ke server...");

        try {
            const endpointVerify = `${AM_API}/api/alightmotion?apikey=${AM_APIKEY}&url=${encodeURIComponent(text)}`;
            const responseAM = await axios.get(endpointVerify);
            
            if (responseAM.data && responseAM.data.status) {
                bot.sendMessage(chatId, `🎉 *Sukses!* Email \`${session.email}\` sekarang sudah Premium.\nSelamat berkreasi!`, { parse_mode: "Markdown" });
                resetSession(chatId); 
            } else {
                bot.sendMessage(chatId, "❌ Gagal memverifikasi Magic Link. Hubungi Admin.");
            }
        } catch (error) {
            bot.sendMessage(chatId, "⚠️ Kesalahan saat memproses Magic Link.");
        }
    }
});

console.log("🤖 Bot berjalan stabil dengan fitur Hubungi Admin...");
