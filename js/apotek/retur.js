/**
 * js/apotek/retur.js
 * Retur Obat ke Supplier
 *
 * FITUR:
 * - Catat pengembalian obat ke supplier (kadaluarsa, rusak, salah kirim)
 * - Pilih dari master obat, isi qty & alasan retur
 * - Update stok otomatis (dikurangi) via FieldValue.increment
 * - Riwayat retur dengan filter bulan
 * - Status retur: menunggu_konfirmasi → dikonfirmasi → selesai
 *
 * FIRESTORE COLLECTIONS:
 *   - retur   { tanggal, supplier, obatId, namaObat, kodeObat, qty, satuan,
 *               hargaBeli, totalNilai, alasan, status, catatanAdmin,
 *               createdAt, inputOleh }
 *   - obat    (stok dikurangi saat retur dikonfirmasi oleh admin)
 *
 * CARA PASANG:
 *   1. Tambahkan file ini ke daftar cache sw.js
 *   2. Tambahkan menu di app.js → menuStructure.apotek:
 *        { id: 'retur', label: 'Retur Supplier', icon: 'package-open', module: 'apotek/retur' }
 *   3. Akses: kasir apotek bisa buat pengajuan, admin bisa konfirmasi/tolak
 */

window.AppApotekRetur = {

    // ===== STATE =====
    masterObat: [],
    data: [],
    filterBulan: '',

    // ===== RENDER =====
    render: function() {
        var d = new Date();
        var defaultMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        return [
            '<div class="page-enter max-w-5xl">',
            '  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">',
            '    <div>',
            '      <h2 class="text-xl font-bold text-gray-800 dark:text-white">Retur Obat ke Supplier</h2>',
            '      <p class="text-sm text-slate-500 dark:text-slate-400">Pengembalian obat kadaluarsa, rusak, atau salah kirim</p>',
            '    </div>',
            '    <button onclick="AppApotekRetur.openForm()" class="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition">',
            '      <i data-lucide="plus" class="w-4 h-4"></i> Buat Retur Baru',
            '    </button>',
            '  </div>',

            '  <div class="flex items-center gap-3 mb-5">',
            '    <label class="text-sm text-slate-500 dark:text-slate-400">Filter Bulan:</label>',
            '    <input type="month" id="retur-filter-bulan" value="' + defaultMonth + '" class="px-3 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm outline-none">',
            '    <button onclick="AppApotekRetur.init()" class="bg-primary-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium">Tampilkan</button>',
            '  </div>',

            '  <div id="retur-list"><div class="flex justify-center py-20"><div class="spinner"></div></div></div>',
            '</div>'
        ].join('');
    },

    // ===== INIT =====
    init: function() {
        var self = this;
        var bulanEl = document.getElementById('retur-filter-bulan');
        var bulan   = bulanEl ? bulanEl.value : new Date().toISOString().slice(0, 7);
        var start   = bulan + '-01';
        var end     = bulan + '-31';

        Promise.all([
            DataCache.getObat(),
            db.collection('retur').where('tanggal', '>=', start).where('tanggal', '<=', end)
              .orderBy('tanggal', 'desc').get()
        ]).then(function(results) {
            self.masterObat = [];
            results[0].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.masterObat.push(d); });

            self.data = [];
            results[1].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.data.push(d); });

            self.renderList();
        }).catch(function(err) {
            document.getElementById('retur-list').innerHTML =
                '<p class="text-red-500 text-center py-10">Gagal memuat: ' + Utils.escapeHtml(err.message) + '</p>';
        });
    },

    // ===== RENDER LIST =====
    renderList: function() {
        var container = document.getElementById('retur-list');
        if (!container) return;
        var role = window.currentRole || '';

        if (this.data.length === 0) {
            container.innerHTML = '<div class="text-center py-16 text-slate-400"><i data-lucide="package-open" class="w-10 h-10 mx-auto mb-3"></i><p>Belum ada retur bulan ini</p></div>';
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Summary
        var totalNilai = this.data.reduce(function(s, r) { return s + (r.totalNilai || 0); }, 0);
        var html = '<div class="grid grid-cols-2 gap-3 mb-5">';
        html += '<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">';
        html += '  <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Retur Bulan Ini</p>';
        html += '  <p class="text-xl font-bold text-gray-800 dark:text-white">' + this.data.length + ' Item</p>';
        html += '</div>';
        html += '<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">';
        html += '  <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Nilai Retur</p>';
        html += '  <p class="text-xl font-bold text-primary-600 dark:text-primary-400">' + Utils.formatRupiah(totalNilai) + '</p>';
        html += '</div></div>';

        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">';
        html += '<table class="w-full text-sm">';
        html += '<thead class="bg-slate-50 dark:bg-slate-700 text-xs uppercase text-slate-500 dark:text-slate-400">';
        html += '<tr><th class="px-4 py-3 text-left">Tanggal</th><th class="px-4 py-3 text-left">Obat</th><th class="px-4 py-3 text-left">Supplier</th><th class="px-4 py-3 text-center">Qty</th><th class="px-4 py-3 text-right">Nilai</th><th class="px-4 py-3 text-center">Status</th><th class="px-4 py-3 text-center">Aksi</th></tr>';
        html += '</thead><tbody class="divide-y divide-slate-100 dark:divide-slate-700">';

        var isAdmin = (role === 'admin' || role === 'keuangan');
        this.data.forEach(function(r) {
            html += '<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50">';
            html += '<td class="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">' + (r.tanggal || '-') + '</td>';
            html += '<td class="px-4 py-3"><p class="font-medium text-gray-800 dark:text-white">' + Utils.escapeHtml(r.namaObat || '-') + '</p>';
            html += '<p class="text-xs text-slate-400">Alasan: ' + Utils.escapeHtml(r.alasan || '-') + '</p></td>';
            html += '<td class="px-4 py-3 text-slate-600 dark:text-slate-300">' + Utils.escapeHtml(r.supplier || '-') + '</td>';
            html += '<td class="px-4 py-3 text-center">' + (r.qty || 0) + ' ' + Utils.escapeHtml(r.satuan || '') + '</td>';
            html += '<td class="px-4 py-3 text-right font-medium">' + Utils.formatRupiah(r.totalNilai || 0) + '</td>';
            html += '<td class="px-4 py-3 text-center">' + AppApotekRetur._badgeStatus(r.status) + '</td>';
            html += '<td class="px-4 py-3 text-center">';
            if (isAdmin && r.status === 'menunggu_konfirmasi') {
                html += '<button onclick="AppApotekRetur.konfirmasi(\'' + r.id + '\')" class="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-2 py-1 rounded font-semibold mr-1">Konfirmasi</button>';
                html += '<button onclick="AppApotekRetur.tolak(\'' + r.id + '\')" class="text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-2 py-1 rounded font-semibold">Tolak</button>';
            } else {
                html += '<span class="text-xs text-slate-400">-</span>';
            }
            html += '</td></tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    // ===== FORM RETUR BARU =====
    openForm: function() {
        var obatOptions = '<option value="">-- Pilih Obat --</option>';
        this.masterObat.sort(function(a, b) { return (a.namaObat || '').localeCompare(b.namaObat || ''); });
        this.masterObat.forEach(function(o) {
            obatOptions += '<option value="' + o.id + '" data-hpp="' + (o.hpp || 0) + '" data-stok="' + (o.stok || 0) + '" data-satuan="' + Utils.escapeHtml(o.satuan || '') + '">' + Utils.escapeHtml(o.namaObat) + ' (Stok: ' + (o.stok || 0) + ')</option>';
        });

        var today = new Date().toISOString().split('T')[0];

        // FIX: Utils.openModal hanya menerima 1 parameter (htmlContent), bukan (judul, html, callback).
        // Pemanggilan 3-parameter sebelumnya membuat parameter "judul" ('Buat Retur Baru') dianggap
        // SEBAGAI ISI modal, sehingga modal yang muncul kosong tanpa form sama sekali (form yang sudah
        // dibangun di variabel html tidak pernah ter-render, dan tombol simpan tidak pernah terpasang).
        // Sekarang mengikuti pola modal yang sama seperti modul lain (obat.js, pasien.js, dll): judul +
        // tombol close dibuat manual di dalam html, submit form ditangkap lewat addEventListener.
        var html = '<div class="p-6 max-h-[90vh] overflow-y-auto">';
        html += '<div class="flex items-center justify-between mb-5"><h3 class="text-lg font-semibold text-gray-800 dark:text-white">Buat Retur Baru</h3><button type="button" onclick="Utils.closeModal()" class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><i data-lucide="x" class="w-5 h-5 text-slate-400"></i></button></div>';

        html += '<form id="form-retur" class="space-y-4">';
        html += '<div class="grid grid-cols-2 gap-4">';
        html += '<div class="col-span-2"><label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tanggal Retur *</label><input type="date" id="retur-tgl" value="' + today + '" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" required></div>';
        html += '<div class="col-span-2"><label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Supplier *</label><input type="text" id="retur-supplier" placeholder="Nama supplier / PBF" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" required></div>';
        html += '<div class="col-span-2"><label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Obat *</label><select id="retur-obat" onchange="AppApotekRetur.onObatChange(this)" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" required>' + obatOptions + '</select>';
        // TAMBAHAN: indikator stok tersedia untuk obat yang dipilih, real-time & langsung terintegrasi
        // dengan data stok master obat — sebelumnya field ini lepas total dari stok sampai baru
        // divalidasi (dan ditolak) setelah tombol Simpan diklik.
        html += '<p id="retur-stok-info" class="text-xs text-slate-400 mt-1">Pilih obat untuk melihat stok tersedia</p></div>';
        html += '<div><label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Qty Retur *</label><input type="number" id="retur-qty" min="1" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" oninput="AppApotekRetur.hitungNilai()" required></div>';
        html += '<div><label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Harga Beli/Unit (Rp)</label><input type="number" id="retur-harga" min="0" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" oninput="AppApotekRetur.hitungNilai()" required></div>';
        html += '<div class="col-span-2"><label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Alasan Retur *</label>';
        html += '<select id="retur-alasan" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm">';
        html += '<option value="Mendekati kadaluarsa">Mendekati kadaluarsa</option>';
        html += '<option value="Sudah kadaluarsa">Sudah kadaluarsa</option>';
        html += '<option value="Obat rusak / kemasan cacat">Obat rusak / kemasan cacat</option>';
        html += '<option value="Salah kirim dari supplier">Salah kirim dari supplier</option>';
        html += '<option value="Tidak laku / slow moving">Tidak laku / slow moving</option>';
        html += '</select></div>';
        html += '<div class="col-span-2"><label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Total Nilai Retur</label>';
        html += '<p id="retur-total" class="text-xl font-bold text-primary-600 dark:text-primary-400">Rp 0</p></div>';
        html += '</div>';

        html += '<div class="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">';
        html += '<button type="button" onclick="Utils.closeModal()" class="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Batal</button>';
        html += '<button type="submit" class="px-6 py-2.5 text-sm bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg">Simpan Retur</button>';
        html += '</div>';
        html += '</form></div>';

        Utils.openModal(html);
        setTimeout(function() {
            var form = document.getElementById('form-retur');
            if (form) {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    AppApotekRetur.simpanRetur();
                });
            }
            SearchableSelect.attach('retur-obat', { placeholder: 'Ketik nama obat...' });
        }, 100);
    },

    onObatChange: function(sel) {
        var opt    = sel.options[sel.selectedIndex];
        var hpp    = parseFloat(opt.getAttribute('data-hpp')) || 0;
        var stok   = parseFloat(opt.getAttribute('data-stok')) || 0;
        var satuan = opt.getAttribute('data-satuan') || '';
        var hargaEl = document.getElementById('retur-harga');
        var qtyEl   = document.getElementById('retur-qty');

        if (hargaEl) hargaEl.value = hpp;
        // TAMBAHAN: qty langsung dibatasi (max) sesuai stok obat yang dipilih — integrasi langsung
        // ke master data obat, bukan cuma divalidasi belakangan saat submit.
        if (qtyEl) qtyEl.max = stok;
        this.hitungNilai();
    },

    hitungNilai: function() {
        var obatSel = document.getElementById('retur-obat');
        var opt     = obatSel ? obatSel.options[obatSel.selectedIndex] : null;
        var stok    = (opt && opt.value) ? (parseFloat(opt.getAttribute('data-stok')) || 0) : null;
        var satuan  = opt ? (opt.getAttribute('data-satuan') || '') : '';
        var qty     = parseFloat(document.getElementById('retur-qty')?.value) || 0;
        var harga   = parseFloat(document.getElementById('retur-harga')?.value) || 0;
        var el      = document.getElementById('retur-total');
        var infoEl  = document.getElementById('retur-stok-info');

        if (el) el.textContent = Utils.formatRupiah(qty * harga);

        // TAMBAHAN: peringatan real-time kalau qty melebihi stok, bukan menunggu toast error saat submit.
        if (infoEl) {
            if (stok === null) {
                infoEl.textContent = 'Pilih obat untuk melihat stok tersedia';
                infoEl.className = 'text-xs text-slate-400 mt-1';
            } else if (qty > stok) {
                infoEl.textContent = 'Qty melebihi stok tersedia (' + stok + ' ' + satuan + ')!';
                infoEl.className = 'text-xs text-red-500 font-medium mt-1';
            } else {
                infoEl.textContent = 'Stok tersedia: ' + stok + ' ' + satuan;
                infoEl.className = 'text-xs text-slate-500 dark:text-slate-400 mt-1';
            }
        }
    },

    simpanRetur: function() {
        var tgl      = document.getElementById('retur-tgl')?.value;
        var supplier = document.getElementById('retur-supplier')?.value.trim();
        var obatSel  = document.getElementById('retur-obat');
        var obatId   = obatSel?.value;
        var qty      = parseFloat(document.getElementById('retur-qty')?.value) || 0;
        var harga    = parseFloat(document.getElementById('retur-harga')?.value) || 0;
        var alasan   = document.getElementById('retur-alasan')?.value;

        if (!tgl || !supplier || !obatId || qty <= 0) {
            return Utils.toast('Lengkapi semua field yang wajib!', 'error');
        }

        var obat = this.masterObat.find(function(o) { return o.id === obatId; });
        if (!obat) return Utils.toast('Obat tidak ditemukan', 'error');

        if (qty > (obat.stok || 0)) {
            return Utils.toast('Qty retur (' + qty + ') melebihi stok tersedia (' + (obat.stok || 0) + ')!', 'error');
        }

        var obj = {
            tanggal:    tgl,
            supplier:   supplier,
            obatId:     obatId,
            namaObat:   obat.namaObat,
            kodeObat:   obat.kodeObat || '',
            satuan:     obat.satuan || '',
            qty:        qty,
            hargaBeli:  harga,
            totalNilai: qty * harga,
            alasan:     alasan,
            status:     'menunggu_konfirmasi',
            inputOleh:  window.currentUserName || 'Kasir',
            createdAt:  firebase.firestore.FieldValue.serverTimestamp()
        };

        db.collection('retur').add(obj).then(function() {
            Utils.toast('Pengajuan retur berhasil dibuat! Menunggu konfirmasi admin.', 'success');
            Utils.closeModal();
            AppApotekRetur.init();
        }).catch(function(err) {
            Utils.toast('Gagal: ' + err.message, 'error');
        });
        // CATATAN: stok baru dikurangi saat admin konfirmasi, bukan saat pengajuan dibuat.
    },

    // ===== KONFIRMASI (Admin) =====
    konfirmasi: function(id) {
        if (!confirm('Konfirmasi retur ini? Stok obat akan langsung dikurangi.')) return;

        var retur = this.data.find(function(r) { return r.id === id; });
        if (!retur) return;

        var batch = db.batch();
        var returRef = db.collection('retur').doc(id);
        var obatRef  = db.collection('obat').doc(retur.obatId);

        batch.update(returRef, {
            status: 'dikonfirmasi',
            dikonfirmasiOleh: window.currentUserName || 'Admin',
            dikonfirmasiAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // FIX: pakai increment negatif agar tidak race condition dengan transaksi lain
        batch.update(obatRef, {
            stok: firebase.firestore.FieldValue.increment(-(retur.qty || 0)),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.commit().then(function() {
            Utils.toast('Retur dikonfirmasi. Stok telah dikurangi ' + retur.qty + ' ' + (retur.satuan || '') + '.', 'success');
            AppApotekRetur.init();
        }).catch(function(err) {
            Utils.toast('Gagal konfirmasi: ' + err.message, 'error');
        });
    },

    // ===== TOLAK (Admin) =====
    tolak: function(id) {
        var catatan = prompt('Masukkan alasan penolakan:');
        if (catatan === null) return; // user batal
        db.collection('retur').doc(id).update({
            status: 'ditolak',
            catatanAdmin: catatan || '-',
            ditolakOleh: window.currentUserName || 'Admin',
            ditolakAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function() {
            Utils.toast('Pengajuan retur ditolak.', 'success');
            AppApotekRetur.init();
        }).catch(function(err) {
            Utils.toast('Gagal: ' + err.message, 'error');
        });
    },

    // ===== HELPER =====
    _badgeStatus: function(status) {
        var map = {
            menunggu_konfirmasi: ['bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', 'Menunggu'],
            dikonfirmasi:        ['bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', 'Dikonfirmasi'],
            ditolak:             ['bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', 'Ditolak'],
            selesai:             ['bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300', 'Selesai']
        };
        var s = map[status] || ['bg-slate-100 text-slate-500', status || '-'];
        return '<span class="text-xs ' + s[0] + ' font-semibold px-2 py-1 rounded-full">' + s[1] + '</span>';
    }
};
