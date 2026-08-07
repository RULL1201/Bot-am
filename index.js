const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// ================= KONFIGURASI BOT & API =================
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const AM_API = 'https://restapidhan.vercel.app';
const AM_APIKEY = 'freeapikeydhan26';

const PG_API = 'https://sobat.aksespg.qzz.io';
const PG_APIKEY = 'ak_live_c0bd68a111514536b8918d8884decce10020c4fcf1';

// 👑 GANTI DENGAN ID TELEGRAM KAMU (ANGKA)
const OWNER_ID = '6161191871'; 

// ================= SISTEM DATABASE LOKAL =================
const DB_FILE = 'database.json';
let db = {
    users: [],
    income: [], 
    products: {
        'am': { id: 'am', name: 'Alight Motion Premium', price: 10000, discount: 0, type: 'magic_link' }
    }
};

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
}
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
loadDB(); 

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
    if (!db.users.includes(chatId)) {
        db.users.push(chatId);
        saveDB();
    }
    bot.sendMessage(chatId, "👋 Halo! Selamat datang di Bot Auto Order.\n\nKetik /order untuk melihat daftar produk.\nKetik /cancel untuk membatalkan pesanan.");
});

bot.onText(/\/cancel/, (msg) => {
    resetSession(msg.chat.id);
    resetAdminSession(msg.chat.id);
    bot.sendMessage(msg.chat.id, "✅ Perintah berhasil dibatalkan.");
});

bot.onText(/\/order/, (msg) => {
    const chatId = msg.chat.id;
    const products = Object.values(db.products);

    if (products.length === 0) return bot.sendMessage(chatId, "Mohon maaf, saat ini tidak ada produk yang tersedia.");

    const keyboard = products.map(p => {
        const finalPrice = p.price - p.discount;
        let textBtn = `${p.name} - Rp ${finalPrice}`;
        if (p.discount > 0) textBtn += ` (Diskon Rp ${p.discount})`;
        return [{ text: textBtn, callback_data: `buy_${p.id}` }];
    });

    bot.sendMessage(chatId, "🛒 *Pilih Produk yang ingin dibeli:*", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ================= FITUR OWNER (ADMIN) =================

bot.onText(/\/owner/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== OWNER_ID) return bot.sendMessage(chatId, "⛔ Kamu bukan Owner bot ini.");

    const today = getTodayDate();
    const month = getThisMonth();
    
    let dailyIncome = 0;
    let monthlyIncome = 0;
    
    db.income.forEach(trx => {
        if (trx.date === today) dailyIncome += trx.amount;
        if (trx.date.startsWith(month)) monthlyIncome += trx.amount;
    });

    const caption = `👑 *DASHBOARD OWNER*\n\n` +
                    `👥 Total Pengguna: *${db.users.length}*\n` +
                    `💰 Pendapatan Hari Ini: *Rp ${dailyIncome}*\n` +
                    `💳 Pendapatan Bulan Ini: *Rp ${monthlyIncome}*\n\n` +
                    `Pilih menu di bawah:`;

    const keyboard = {
        inline_keyboard: [
            [{ text: "➕ Tambah Produk Baru", callback_data: `admin_add_product` }],
            [{ text: "✏️ Ubah Harga", callback_data: `admin_edit_price` }, { text: "✂️ Atur Diskon", callback_data: `admin_edit_discount` }],
            [{ text: "📢 Broadcast Pesan", callback_data: `admin_broadcast` }]
        ]
    };

    bot.sendMessage(chatId, caption, { parse_mode: "Markdown", reply_markup: keyboard });
});

// ================= HANDLER CALLBACK =================

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    bot.answerCallbackQuery(query.id);

    // --- LOGIKA USER MEMBELI ---
    if (data.startsWith('buy_')) {
        const productId = data.split('_')[1];
        const product = db.products[productId];

        if (!product) return bot.sendMessage(chatId, "Produk tidak ditemukan.");

        userSessions[chatId] = { step: 'WAITING_EMAIL', productId: product.id };
        bot.sendMessage(chatId, `Membeli: *${product.name}*\n\n✉️ *Silakan kirimkan alamat Email kamu:*`, { parse_mode: "Markdown" });
    }

    // --- LOGIKA USER CEK PEMBAYARAN ---
    else if (data.startsWith('check_')) {
        const depositId = data.replace('check_', '');
        const session = userSessions[chatId];

        if (!session || session.depositId !== depositId) return bot.sendMessage(chatId, "⚠️ Sesi kadaluarsa. Ketik /order ulang.");
        if (session.step !== 'WAITING_PAYMENT') return;

        try {
            const responseCheck = await axios.get(`${PG_API}/v1/deposit/status/${depositId}`, { headers: { 'X-API-Key': PG_APIKEY } });
            
            if (responseCheck.data && responseCheck.data.success) {
                const status = responseCheck.data.data.status; 
                if (status === 'success') {
                    const product = db.products[session.productId];
                    
                    db.income.push({ date: getTodayDate(), amount: session.finalPrice });
                    saveDB();

                    bot.sendMessage(OWNER_ID, `💸 *PEMBAYARAN MASUK!*\nProduk: ${product.name}\nHarga: Rp ${session.finalPrice}\nEmail: ${session.email}`, { parse_mode: "Markdown" });

                    if (product.type === 'magic_link') {
                        // Khusus Alight Motion
                        session.step = 'WAITING_MAGIC_LINK';
                        bot.sendMessage(chatId, `✅ *Pembayaran Lunas!*\n\nSilakan buka email kamu (\`${session.email}\`), Copy *Magic Link* dari Alight Motion, lalu *Kirimkan ke sini*.`, { parse_mode: "Markdown" });
                    } else {
                        // Khusus Produk Baru (Langsung kirim Link Login ke Pembeli)
                        const pesanSukses = `✅ *Pembayaran Lunas!*\n\nTerima kasih telah membeli *${product.name}*.\n\nBerikut adalah *Link Akses / Login* kamu:\n${product.link}\n\nSelamat menggunakan!`;
                        bot.sendMessage(chatId, pesanSukses, { parse_mode: "Markdown" });
                        resetSession(chatId); // Selesai
                    }
                } else if (status === 'pending') {
                    bot.sendMessage(chatId, "⏳ Belum dibayar, jika sudah transfer mohon tunggu sebentar lalu klik lagi.");
                } else {
                    bot.sendMessage(chatId, "❌ Transaksi kadaluarsa.");
                    resetSession(chatId);
                }
            }
        } catch (err) {
            bot.sendMessage(chatId, "⚠️ Gagal mengecek status ke server.");
        }
    }

    // --- LOGIKA ADMIN ---
    else if (chatId.toString() === OWNER_ID) {
        if (data === 'admin_broadcast') {
            adminSessions[chatId] = { action: 'WAITING_BROADCAST_MSG' };
            bot.sendMessage(chatId, "📢 Kirimkan pesan yang ingin di-broadcast ke seluruh pengguna bot (Bisa teks/foto):");
        } 
        else if (data === 'admin_add_product') {
            adminSessions[chatId] = { action: 'WAITING_NEW_PRODUCT_NAME' };
            bot.sendMessage(chatId, "Tuliskan *Nama Produk Baru* yang ingin ditambahkan:", { parse_mode: "Markdown" });
        }
        else if (data === 'admin_edit_price' || data === 'admin_edit_discount') {
            const isPrice = data === 'admin_edit_price';
            const actionType = isPrice ? 'WAITING_SELECT_PRICE' : 'WAITING_SELECT_DISCOUNT';
            adminSessions[chatId] = { action: actionType };

            const keyboard = Object.values(db.products).map(p => [{ text: p.name, callback_data: `editprod_${p.id}` }]);
            bot.sendMessage(chatId, `Pilih produk yang ingin diubah ${isPrice ? 'Harganya' : 'Diskonnya'}:`, { reply_markup: { inline_keyboard: keyboard } });
        }
        else if (data.startsWith('editprod_')) {
            const prodId = data.split('_')[1];
            const adminAct = adminSessions[chatId]?.action;

            if (adminAct === 'WAITING_SELECT_PRICE') {
                adminSessions[chatId] = { action: 'WAITING_NEW_PRICE', prodId: prodId };
                bot.sendMessage(chatId, `Kirimkan harga baru (Angka saja) untuk produk: ${db.products[prodId].name}`);
            } else if (adminAct === 'WAITING_SELECT_DISCOUNT') {
                adminSessions[chatId] = { action: 'WAITING_NEW_DISCOUNT', prodId: prodId };
                bot.sendMessage(chatId, `Kirimkan jumlah diskon (Angka saja) untuk produk: ${db.products[prodId].name}`);
            }
        }
    }
});

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
            for (let userId of db.users) {
                try { await bot.copyMessage(userId, chatId, msg.message_id); count++; } catch (e) {} 
            }
            bot.sendMessage(chatId, `✅ Broadcast selesai terkirim ke ${count} pengguna.`);
            resetAdminSession(chatId);
            return;
        }
        
        // Alur Admin Tambah Produk Baru
        else if (adminAct.action === 'WAITING_NEW_PRODUCT_NAME') {
            adminAct.prodName = text;
            adminAct.action = 'WAITING_NEW_PRODUCT_PRICE';
            bot.sendMessage(chatId, "Kirimkan *Harga* untuk produk ini (Angka saja, cth: 15000):", { parse_mode: "Markdown" });
            return;
        }
        else if (adminAct.action === 'WAITING_NEW_PRODUCT_PRICE') {
            const price = parseInt(text);
            if (isNaN(price)) return bot.sendMessage(chatId, "Harap masukkan angka saja.");
            adminAct.prodPrice = price;
            adminAct.action = 'WAITING_NEW_PRODUCT_LINK';
            bot.sendMessage(chatId, "Kirimkan *Link Login / Akses* yang akan otomatis dikirimkan ke pembeli setelah mereka berhasil membayar:", { parse_mode: "Markdown" });
            return;
        }
        else if (adminAct.action === 'WAITING_NEW_PRODUCT_LINK') {
            const link = text;
            const prodId = 'prod_' + Date.now(); 
            
            // Simpan produk ke database
            db.products[prodId] = { 
                id: prodId, 
                name: adminAct.prodName, 
                price: adminAct.prodPrice, 
                discount: 0, 
                type: 'login_link',
                link: link // Menyimpan Link Login
            };
            saveDB();
            
            bot.sendMessage(chatId, `✅ *Produk berhasil ditambahkan!*\n\nNama: ${adminAct.prodName}\nHarga: Rp ${adminAct.prodPrice}\nLink Login: ${link}`, { parse_mode: "Markdown" });
            resetAdminSession(chatId);
            return;
        }

        // Alur Admin Ubah Harga & Diskon
        else if (adminAct.action === 'WAITING_NEW_PRICE' || adminAct.action === 'WAITING_NEW_DISCOUNT') {
            const amount = parseInt(text);
            if (isNaN(amount)) return bot.sendMessage(chatId, "Harap masukkan angka saja.");
            
            const prodId = adminAct.prodId;
            if (adminAct.action === 'WAITING_NEW_PRICE') {
                db.products[prodId].price = amount;
                bot.sendMessage(chatId, `✅ Harga ${db.products[prodId].name} berhasil diubah menjadi Rp ${amount}`);
            } else {
                db.products[prodId].discount = amount;
                bot.sendMessage(chatId, `✅ Diskon ${db.products[prodId].name} berhasil diset menjadi Rp ${amount}`);
            }
            saveDB();
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
        
        bot.sendMessage(chatId, "⏳ Sedang membuat kode QRIS...");
        const product = db.products[session.productId];
        const finalPrice = product.price - product.discount;
        session.finalPrice = finalPrice; 

        try {
            const responsePG = await axios.post(`${PG_API}/v1/deposit/create`, { amount: finalPrice, method: "qris" }, {
                headers: { 'X-API-Key': PG_APIKEY, 'Content-Type': 'application/json' }
            });

            if (responsePG.data && responsePG.data.success) {
                const depositId = responsePG.data.data.depositId;
                const qrString = responsePG.data.data.qrString;
                
                session.depositId = depositId;
                session.step = 'WAITING_PAYMENT';

                const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrString)}`;
                const keyboard = { inline_keyboard: [[{ text: "🔄 Cek Pembayaran", callback_data: `check_${depositId}` }]] };
                
                bot.sendPhoto(chatId, qrImageUrl, { caption: `✅ *Tagihan Dibuat!*\n\nProduk: ${product.name}\nEmail: \`${session.email}\`\nTotal Bayar: *Rp ${finalPrice}*\n\nSilakan scan dan bayar, lalu klik tombol cek.`, parse_mode: "Markdown", reply_markup: keyboard });
            } else {
                bot.sendMessage(chatId, "❌ Gagal membuat tagihan QRIS.");
                resetSession(chatId);
            }
        } catch (error) {
            bot.sendMessage(chatId, "⚠️ Server pembayaran gangguan.");
            resetSession(chatId);
        }
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

console.log("🤖 Bot Alight Motion + Tambah Produk Otomatis sedang berjalan...");
