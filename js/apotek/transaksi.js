/**
 * js/apotek/transaksi.js
 * Transaksi Penjualan: Obat Bebas | Resep Klinik | Resep Luar
 * - Integrasi Tindakan Apotek & Klinik
 * - Jasa resep & Harga obat auto dari pengaturan
 * - Cetak Struk Anti-Popup Blocker
 */

window.AppApotekTransaksi = {

    // ========== STATE ==========
    tipe: 'obat_bebas',
    masterObat: [],
    masterTindakan: [], 
    pengaturan: null,
    resepList: [],
    antrianList: [],

    // ========== RENDER ==========
    render: function() {
        return [
            '<div class="page-enter max-w-5xl">',
            '  <h2 class="text-xl font-bold text-gray-800 dark:text-white mb-1">Transaksi Penjualan</h2>',
            '  <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Input penjualan obat bebas dan resep dokter</p>',
            '  <div id="trx-content">',
            '    <div class="flex justify-center py-20"><div class="spinner"></div></div>',
            '  </div>',
            '</div>'
        ].join('');
    },

    // ========== INIT ==========
    init: function() {
        var self = this;
        var today = Utils.today(); // FIX: pakai tanggal lokal, bukan UTC

        Promise.all([
            DataCache.getObat(),
            db.collection('pengaturanPembagian').doc('global').get(),
            // FIX (READ SPIKE): sebelumnya where('status','==','selesai') tanpa limit()
            // -> menarik SEMUA rekam medis yang pernah selesai (terus bertambah seiring
            // waktu, bisa ribuan dokumen), lalu baru difilter statusResep di client.
            // Field statusResep SELALU diisi 'menunggu' saat rekam medis dibuat (lihat
            // js/klinik/rekamMedis.js), jadi aman & jauh lebih murah untuk query
            // langsung ke statusResep=='menunggu' di server -- hasilnya cuma resep
            // yang benar-benar masih perlu diproses, bukan seluruh riwayat.
            db.collection('rekamMedis').where('statusResep', '==', 'menunggu').get(),
            db.collection('antrian').where('tanggal', '==', today).get(),
            db.collection('masterTindakan').where('aktif', '==', true).get()
        ]).then(function(results) {

            // Master Obat
            self.masterObat = [];
            results[0].forEach(function(doc) {
                var d = doc.data(); d.id = doc.id; self.masterObat.push(d);
            });
            self.masterObat.sort(function(a, b) { return (a.namaObat || '').localeCompare(b.namaObat || ''); });

            // Master Tindakan
            self.masterTindakan = [];
            results[4].forEach(function(doc) {
                var d = doc.data(); d.id = doc.id; self.masterTindakan.push(d);
            });

            // Pengaturan Pembagian
            if (results[1].exists) {
                self.pengaturan = results[1].data();
            } else {
                self.pengaturan = { marginResep: 0, racikObat: { nilai: 0 } };
            }

            // Antrian hari ini
            self.antrianList = [];
            results[3].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.antrianList.push(d); });

            // Resep klinik menunggu (sudah difilter di query, tidak perlu filter lagi di sini)
            self.resepList = [];
            results[2].forEach(function(doc) {
                var d = doc.data(); d.id = doc.id;
                self.resepList.push(d);
            });

            self.renderForm();
        }).catch(function(err) {
            document.getElementById('trx-content').innerHTML =
                '<div class="text-center py-16"><p class="text-red-500 font-semibold">Gagal memuat: ' + Utils.escapeHtml(err.message) + '</p></div>';
        });
    },

    // ========== RENDER FORM UTAMA ==========
    renderForm: function() {
        var html = '';

        // Tombol pilih tipe
        html += '<div class="grid grid-cols-3 gap-2 mb-4">';
        html += this._btnTipe('obat_bebas', 'pill', 'Obat Bebas', true);
        html += this._btnTipe('resep_klinik', 'file-text', 'Resep Klinik', false);
        html += this._btnTipe('resep_luar', 'file-plus', 'Resep Luar', false);
        html += '</div>';

        // Header dinamis
        html += '<div id="trx-header-dynamic" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-4"></div>';

        // Keranjang obat
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-4">';
        html += '  <div class="flex justify-between items-center mb-3">';
        html += '    <h3 class="font-semibold text-gray-800 dark:text-white">Daftar Item Obat</h3>';
        html += '    <button type="button" onclick="AppApotekTransaksi.addItem()" class="text-sm bg-primary-50 dark:bg-primary-900/30 text-primary-600 px-3 py-1.5 rounded-lg font-medium hover:bg-primary-100">+ Tambah Obat</button>';
        html += '  </div>';
        html += '  <div id="trx-cart-container" class="space-y-2"><p class="text-sm text-slate-400 italic p-2">Tambahkan obat ke keranjang.</p></div>';
        html += '</div>';

        // Area Tindakan & Jasa Medis
        html += '<div id="trx-tindakan-container" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-4"></div>';

        // Ringkasan total & Pembayaran
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-6">';
        html += '  <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">';
        
        // Detail Total
        html += '    <div class="space-y-1 text-sm w-full lg:w-auto">';
        html += '      <div class="flex justify-between gap-8"><span class="text-slate-500">Total Obat (Gross):</span><span id="trx-total-obat" class="font-medium text-gray-800 dark:text-white">Rp 0</span></div>';
        html += '      <div class="flex justify-between gap-8 text-xs pl-4"><span class="text-slate-400">- Est. PPN Keluaran (11%):</span><span id="trx-ppn-keluaran" class="font-medium text-slate-500">Rp 0</span></div>';
        html += '      <div class="flex justify-between gap-8 text-xs pl-4"><span class="text-slate-400"># Nilai Bersih Obat:</span><span id="trx-nilai-bersih" class="font-medium text-slate-500">Rp 0</span></div>';
        html += '      <div class="flex justify-between gap-8"><span class="text-slate-500">Total Racik:</span><span id="trx-total-racik" class="font-medium text-teal-600">Rp 0</span></div>';
        html += '      <div class="flex justify-between gap-8"><span class="text-slate-500">Tindakan & Jasa:</span><span id="trx-total-tindakan" class="font-medium text-purple-600">Rp 0</span></div>';
        html += '      <div class="flex justify-between gap-8"><span class="text-slate-500">Jasa Resep:</span><span id="trx-jasa-resep" class="font-medium text-gray-800 dark:text-white">-</span></div>';
        html += '      <div class="flex justify-between gap-8"><span class="text-slate-500">Pembulatan:</span><span id="trx-pembulatan" class="font-medium text-amber-600">-</span></div>';
        html += '      <div class="flex justify-between gap-8 text-lg pt-2 border-t border-slate-100 dark:border-slate-700"><span class="font-semibold text-gray-700 dark:text-gray-200">TOTAL BAYAR:</span><span id="trx-grand-total" class="font-bold text-primary-600">Rp 0</span></div>';
        html += '    </div>';
        
        // Metode Bayar & Tombol Proses
        html += '    <div class="flex flex-col gap-3 w-full lg:w-auto">';
        html += '      <div>';
        html += '        <label class="block text-xs font-medium text-slate-500 mb-1">Metode Pembayaran</label>';
        html += '        <select id="trx-metode-bayar" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm">';
        html += '          <option value="cash">Cash</option><option value="transfer">Transfer</option><option value="qris">QRIS</option>';
        html += '        </select>';
        html += '      </div>';
        html += '      <button onclick="AppApotekTransaksi.simpan()" class="bg-primary-600 hover:bg-primary-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-all text-sm flex items-center gap-2 justify-center">';
        html += '        <i data-lucide="check-circle" class="w-5 h-5"></i> Proses & Simpan';
        html += '      </button>';
        html += '    </div>';
        
        html += '  </div>';
        html += '</div>';

        document.getElementById('trx-content').innerHTML = html;
        lucide.createIcons();

        this.tipe = 'obat_bebas';
        this._renderHeader('obat_bebas');
        this.renderTindakanArea(); 
    },

    _btnTipe: function(tipe, icon, label, isActive) {
        var activeClass = isActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-600';
        var textClass = isActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-600 dark:text-slate-300';
        return '<button onclick="AppApotekTransaksi.setTipe(\'' + tipe + '\')" id="btn-' + tipe + '" class="border-2 ' + activeClass + ' p-3 rounded-xl text-center transition hover:border-primary-500">' +
            '<i data-lucide="' + icon + '" class="w-5 h-5 mx-auto mb-1 ' + textClass + '"></i>' +
            '<p class="text-sm font-semibold ' + textClass + '">' + label + '</p></button>';
    },

    setTipe: function(tipe) {
        this.tipe = tipe;
        var tipes = ['obat_bebas', 'resep_klinik', 'resep_luar'];
        tipes.forEach(function(t) {
            var btn = document.getElementById('btn-' + t);
            if (!btn) return;
            if (t === tipe) {
                btn.className = btn.className.replace(/border-slate-200 dark:border-slate-600/g, '').replace(/text-slate-600 dark:text-slate-300/g, '');
                if (btn.className.indexOf('border-primary-500') === -1) btn.className += ' border-primary-500 bg-primary-50 dark:bg-primary-900/20';
                btn.querySelectorAll('i, p').forEach(function(el) { el.className = el.className.replace(/text-slate-600 dark:text-slate-300/g, 'text-primary-600 dark:text-primary-400'); });
            } else {
                btn.className = btn.className.replace(/border-primary-500/g, '').replace(/bg-primary-50/g, '').replace(/dark:bg-primary-900\/20/g, '');
                if (btn.className.indexOf('border-slate-200') === -1) btn.className += ' border-slate-200 dark:border-slate-600';
                btn.querySelectorAll('i, p').forEach(function(el) { el.className = el.className.replace(/text-primary-600 dark:text-primary-400/g, 'text-slate-600 dark:text-slate-300'); });
            }
        });

        this._renderHeader(tipe);
        document.getElementById('trx-cart-container').innerHTML = '<p class="text-sm text-slate-400 italic p-2">Tambahkan obat ke keranjang.</p>';
        this.renderTindakanArea();
        this.hitungTotal();
    },

    _renderHeader: function(tipe) {
        var html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
        if (tipe === 'resep_klinik') {
            html += '<div><label class="block text-xs font-medium text-blue-600 mb-1">Pilih Resep Klinik</label>';
            html += '<select id="trx-resep-id" onchange="AppApotekTransaksi.onSelectResep()" class="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-700 dark:text-white rounded-lg text-sm">';
            html += '<option value="">-- Pilih Resep Menunggu (' + this.resepList.length + ') --</option>';
            this.resepList.forEach(function(r) {
                html += '<option value="' + r.id + '">' + Utils.escapeHtml(r.namaPasien || '-') + ' (' + Utils.escapeHtml(r.nomorRM || '-') + ') — ' + Utils.escapeHtml(r.namaDokter || '-') + '</option>';
            });
            html += '</select></div>';
        } else if (tipe === 'resep_luar') {
            html += '<div><label class="block text-xs font-medium text-green-600 mb-1">Dokter Pemberi Resep *</label>';
            html += '<select id="trx-dokter-luar-id" onchange="AppApotekTransaksi.onChangeDokterLuar()" class="w-full px-3 py-2 border border-green-300 dark:border-green-700 bg-white dark:bg-slate-700 dark:text-white rounded-lg text-sm"><option value="">-- Pilih Dokter --</option>';
            if (this.pengaturan && Array.isArray(this.pengaturan.resepKlinik)) {
                this.pengaturan.resepKlinik.forEach(function(doc) {
                    html += '<option value="' + doc.dokterId + '" data-nama="' + Utils.escapeHtml(doc.namaDokter || '') + '">' + Utils.escapeHtml(doc.namaDokter || 'Dokter') + '</option>';
                });
            }
            // FIX (permintaan user): tambahkan opsi dokter lain di luar daftar Pengaturan
            // Dokter/Pembagian, untuk resep dari puskesmas / dokter luar yang belum terdaftar.
            html += '<option value="__LAINNYA__" data-nama="">-- Dokter Lain / Luar (input manual) --</option>';
            html += '</select>';
            html += '<input type="text" id="trx-dokter-luar-manual" class="hidden mt-2 w-full px-3 py-2 border border-green-300 dark:border-green-700 bg-white dark:bg-slate-700 dark:text-white rounded-lg text-sm" placeholder="Ketik nama dokter / asal puskesmas" oninput="AppApotekTransaksi.hitungTotal()">';
            html += '</div>';
        }
        html += '<div><label class="block text-xs font-medium text-slate-500 mb-1">Nama Pasien (Opsional)</label>';
        html += '<input type="text" id="trx-pasien" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white rounded-lg text-sm" placeholder="Nama Pasien"></div>';
        html += '</div>';
        document.getElementById('trx-header-dynamic').innerHTML = html;
    },

    // FIX (permintaan user): tampilkan/sembunyikan input manual saat "Dokter Lain / Luar" dipilih.
    onChangeDokterLuar: function() {
        var sel = document.getElementById('trx-dokter-luar-id');
        var manualInput = document.getElementById('trx-dokter-luar-manual');
        if (sel && manualInput) {
            if (sel.value === '__LAINNYA__') {
                manualInput.classList.remove('hidden');
                manualInput.focus();
            } else {
                manualInput.classList.add('hidden');
                manualInput.value = '';
            }
        }
        this.hitungTotal();
    },

    // ========== AREA TINDAKAN ==========
    renderTindakanArea: function() {
        var container = document.getElementById('trx-tindakan-container');
        if (!container) return;
        var self = this;
        var html = '<div class="flex justify-between items-center mb-3">';
        html += '<h3 class="font-semibold text-gray-800 dark:text-white">Tindakan & Jasa Medis</h3>';

        if (this.tipe !== 'resep_klinik') {
            // FITUR BARU (permintaan user): "Tindakan Klinik" sekarang juga bisa
            // ditambahkan langsung di sini (Obat Bebas / Resep Luar), berdampingan
            // dengan "Tindakan Apotek" — dipakai untuk tindakan klinik yang terjadi
            // TANPA resep dokter/rekam medis (mis. cek tensi, ganti perban, suntik
            // langsung di kasir). Kalau tindakannya berasal dari resep dokter yang
            // sudah tercatat di Rekam Medis, tetap pakai alur "Resep Klinik" seperti
            // biasa (otomatis, lihat onSelectResep()).
            html += '<div class="flex gap-2">';
            html += '<button type="button" onclick="AppApotekTransaksi.addTindakan(\'klinik\')" class="text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100">+ Tindakan Klinik</button>';
            html += '<button type="button" onclick="AppApotekTransaksi.addTindakan(\'apotek\')" class="text-sm bg-teal-50 dark:bg-teal-900/30 text-teal-600 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-100">+ Tindakan Apotek</button>';
            html += '</div>';
        } else {
            html += '<span class="text-xs text-blue-600">Otomatis dari Rekam Medis</span>';
        }
        html += '</div>';
        
        html += '<div id="trx-tindakan-list" class="space-y-2"><p class="text-sm text-slate-400 italic p-2">Tidak ada tindakan.</p></div>';
        container.innerHTML = html;
    },

    // FIX: sebelumnya hanya ada addTindakanApotek() (khusus kategori 'apotek').
    // Digeneralisasi jadi addTindakan(kategori) supaya bisa dipakai untuk
    // 'klinik' maupun 'apotek', dropdown-nya otomatis difilter sesuai kategori
    // yang dipilih dari master data Tindakan (js/pengaturan/tindakan.js).
    addTindakan: function(kategori) {
        var container = document.getElementById('trx-tindakan-list');
        if (container.querySelector('p.italic')) container.innerHTML = '';
        var idx = container.children.length + '-' + Date.now(); // FIX: id unik walau ada baris klinik & apotek campur

        var isKlinik = (kategori === 'klinik');
        var warna = isKlinik ? 'blue' : 'teal';
        var labelKategori = isKlinik ? 'Klinik' : 'Apotek';

        var html = '<div id="trx-tindakan-row-' + idx + '" class="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/30 p-2 rounded-lg border border-slate-100 dark:border-slate-700">';
        html += '<span class="text-[10px] font-semibold px-1.5 py-1 rounded bg-' + warna + '-100 dark:bg-' + warna + '-900/30 text-' + warna + '-600 flex-shrink-0">' + labelKategori + '</span>';
        html += '<select id="trx-tindakan-select-' + idx + '" onchange="AppApotekTransaksi.onSelectTindakan(\'' + idx + '\')" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm">';
        html += '<option value="">-- Pilih Tindakan ' + labelKategori + ' --</option>';
        this.masterTindakan.forEach(function(t) {
            if (t.kategori === kategori) {
                html += '<option value="' + t.id + '" data-harga="' + (t.hargaJual || 0) + '">' + Utils.escapeHtml(t.nama) + ' (' + Utils.formatRupiah(t.hargaJual) + ')</option>';
            }
        });
        html += '</select>';
        html += '<div class="flex items-center gap-2 w-1/3"><input type="number" id="trx-tindakan-harga-' + idx + '" value="0" readonly class="w-full px-2 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm text-right font-bold text-' + warna + '-600"></div>';
        html += '<button type="button" onclick="AppApotekTransaksi.removeTindakan(\'' + idx + '\')" class="p-2 text-red-400 hover:text-red-600"><i data-lucide="x" class="w-5 h-5"></i></button>';
        html += '</div>';
        
        container.insertAdjacentHTML('beforeend', html);
        lucide.createIcons({ nodes: [container] });
    },

    onSelectTindakan: function(idx) {
        var select = document.getElementById('trx-tindakan-select-' + idx);
        var selectedOption = select.options[select.selectedIndex];
        var harga = selectedOption.getAttribute('data-harga') || 0;
        document.getElementById('trx-tindakan-harga-' + idx).value = harga;
        this.hitungTotal();
    },

    removeTindakan: function(idx) {
        var row = document.getElementById('trx-tindakan-row-' + idx);
        if (row) row.remove();
        if (!document.getElementById('trx-tindakan-list').querySelector('[id^="trx-tindakan-row-"]')) {
            document.getElementById('trx-tindakan-list').innerHTML = '<p class="text-sm text-slate-400 italic p-2">Tidak ada tindakan.</p>';
        }
        this.hitungTotal();
    },

    onSelectResep: function() {
        var id = document.getElementById('trx-resep-id').value;
        var listContainer = document.getElementById('trx-tindakan-list');
        if(listContainer) listContainer.innerHTML = '<p class="text-sm text-slate-400 italic p-2">Tidak ada tindakan.</p>';
        
        if (!id) { this.hitungTotal(); return; }
        
        var resep = this.resepList.find(function(r) { return r.id === id; });
        if (resep) {
            document.getElementById('trx-pasien').value = resep.namaPasien || '';
            
            if (resep.tindakanItems && resep.tindakanItems.length > 0) {
                var html = '';
                resep.tindakanItems.forEach(function(t, i) {
                    html += '<div class="flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800">';
                    html += '<div class="flex items-center gap-2"><i data-lucide="stethoscope" class="w-4 h-4 text-blue-500"></i><span class="text-sm text-gray-800 dark:text-white">' + Utils.escapeHtml(t.namaTindakan) + '</span></div>';
                    html += '<span class="text-sm font-bold text-blue-600">' + Utils.formatRupiah(t.hargaJual) + '</span>';
                    html += '<input type="hidden" id="trx-tindakan-klinik-' + i + '" value="' + t.hargaJual + '">';
                    html += '</div>';
                });
                if(listContainer) listContainer.innerHTML = html;
                lucide.createIcons();
            }
        }
        this.hitungTotal();
    },

    // ========== KERANJANG OBAT ==========
    addItem: function() {
        var self = this;
        var container = document.getElementById('trx-cart-container');
        if (container.querySelector('p.italic')) container.innerHTML = '';

        var idx = container.children.length;
        var isResep = (this.tipe === 'resep_klinik' || this.tipe === 'resep_luar');

        var html = '<div id="trx-row-' + idx + '" class="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">';
        html += '<div class="grid grid-cols-2 md:grid-cols-6 gap-3 items-start">';

        html += '<div class="col-span-2"><label class="block text-xs text-slate-500 mb-1">Pilih Obat</label>';
        html += '<select id="trx-obat-' + idx + '" onchange="AppApotekTransaksi.onSelectObat(' + idx + ')" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm"><option value="">-- Pilih Obat --</option>';
        this.masterObat.forEach(function(o) {
            var stokLabel = (o.stok || 0) > 0 ? o.stok + ' ' + (o.satuan || 'pcs') : 'HABIS';
            html += '<option value="' + o.id + '">' + Utils.escapeHtml(o.namaObat || '-') + ' [' + stokLabel + ']</option>';
        });
        html += '</select></div>';

        html += '<div><label class="block text-xs text-slate-500 mb-1">Qty</label>';
        html += '<input type="number" id="trx-qty-' + idx + '" value="1" min="1" oninput="AppApotekTransaksi.hitungTotal()" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm text-center"></div>';

        html += '<div><label class="block text-xs text-slate-500 mb-1">Harga Jual</label>';
        html += '<input type="number" id="trx-harga-' + idx + '" value="0" min="0" oninput="AppApotekTransaksi.hitungTotal()" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm text-right">';
        html += '<p id="trx-hint-' + idx + '" class="text-[10px] text-slate-400 mt-1"></p></div>';

        html += '<div><label class="block text-xs text-slate-500 mb-1">Subtotal</label>';
        html += '<div id="trx-sub-' + idx + '" class="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm text-right font-medium">Rp 0</div></div>';

        html += '<div class="col-span-2 flex items-end justify-between gap-2">';
        if (isResep) {
            var nilaiRacik = (self.pengaturan && self.pengaturan.racikObat) ? self.pengaturan.racikObat.nilai : 0;
            html += '<label class="flex items-center gap-2 text-sm text-teal-600 dark:text-teal-400 cursor-pointer bg-teal-50 dark:bg-teal-900/20 px-3 py-2 rounded-lg border border-teal-200 dark:border-teal-700">';
            html += '<input type="checkbox" id="trx-racik-' + idx + '" onchange="AppApotekTransaksi.hitungTotal()" class="w-4 h-4 rounded border-teal-300 text-teal-600"> Racik (+' + Utils.formatRupiah(nilaiRacik) + ')';
            html += '</label>';
        } else {
            html += '<div></div>';
        }
        html += '<button type="button" onclick="AppApotekTransaksi.removeItem(' + idx + ')" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><i data-lucide="x" class="w-5 h-5"></i></button>';
        html += '</div>';

        html += '</div></div>';
        container.insertAdjacentHTML('beforeend', html);
        lucide.createIcons({ nodes: [container] });
        SearchableSelect.attach('trx-obat-' + idx, { placeholder: 'Ketik nama obat...' });
    },

    onSelectObat: function(idx) {
        var obatId = document.getElementById('trx-obat-' + idx).value;
        var hargaEl = document.getElementById('trx-harga-' + idx);
        var hintEl = document.getElementById('trx-hint-' + idx);
        if (!obatId) { hargaEl.value = 0; if (hintEl) hintEl.textContent = ''; this.hitungTotal(); return; }

        var obat = this.masterObat.find(function(o) { return o.id === obatId; });
        if (!obat) return;

        var isResep = (this.tipe === 'resep_klinik' || this.tipe === 'resep_luar');
        var cfg = this.pengaturan;
        var marginPersen = (cfg && cfg.marginResep) ? parseFloat(cfg.marginResep) : 0;

        if (isResep && marginPersen > 0 && obat.hpp > 0) {
            var hargaAuto = Math.ceil(obat.hpp * (1 + marginPersen / 100));
            hargaEl.value = hargaAuto;
            if (hintEl) { hintEl.textContent = 'AUTO: HPP + ' + marginPersen + '%'; hintEl.className = 'text-[10px] text-emerald-600 mt-1 font-semibold'; }
        } else {
            hargaEl.value = obat.hargaJual || 0;
            if (hintEl) { hintEl.textContent = isResep ? 'Harga Manual (Margin 0%)' : 'Harga Jual Bebas'; hintEl.className = 'text-[10px] text-slate-400 mt-1'; }
        }
        this.hitungTotal();
    },

    removeItem: function(idx) {
        var row = document.getElementById('trx-row-' + idx);
        if (row) row.remove();
        if (!document.getElementById('trx-cart-container').querySelector('[id^="trx-row-"]')) {
            document.getElementById('trx-cart-container').innerHTML = '<p class="text-sm text-slate-400 italic p-2">Tambahkan obat ke keranjang.</p>';
        }
        this.hitungTotal();
    },

    // ========== HITUNG TOTAL ==========
    hitungTotal: function() {
        var self = this;
        var container = document.getElementById('trx-cart-container');
        if (!container) return;

        var rows = container.querySelectorAll('[id^="trx-row-"]');
        var totalObat = 0;
        var totalRacik = 0;
        var totalPPNKeluaran = 0;
        var cfg = this.pengaturan;
        var nilaiRacikConfig = (cfg && cfg.racikObat && cfg.racikObat.nilai) ? cfg.racikObat.nilai : 0;

        rows.forEach(function(row) {
            var idx = row.id.split('-').pop();
            var obatId = document.getElementById('trx-obat-' + idx)?.value;
            var qty = parseInt(document.getElementById('trx-qty-' + idx)?.value) || 0;
            var harga = parseInt(document.getElementById('trx-harga-' + idx)?.value) || 0;
            var sub = qty * harga;
            var subEl = document.getElementById('trx-sub-' + idx);
            if (subEl) subEl.textContent = Utils.formatRupiah(sub);
            totalObat += sub;

            var obat = self.masterObat.find(function(o) { return o.id === obatId; });
            var isPPN = obat ? (obat.isPPN !== false) : true;
            if (isPPN) {
                totalPPNKeluaran += Math.round(sub - (sub / 1.11));
            }

            if (self.tipe === 'resep_klinik' || self.tipe === 'resep_luar') {
                var racikEl = document.getElementById('trx-racik-' + idx);
                if (racikEl && racikEl.checked) totalRacik += nilaiRacikConfig;
            }
        });

        // Hitung Total Tindakan (Klinik & Apotek)
        var totalTindakan = 0;
        // 1. Dari Klinik (hidden input)
        document.querySelectorAll('[id^="trx-tindakan-klinik-"]').forEach(function(input) {
            totalTindakan += parseFloat(input.value) || 0;
        });
        // 2. Dari Apotek Manual (input readonly)
        document.querySelectorAll('[id^="trx-tindakan-harga-"]').forEach(function(input) {
            totalTindakan += parseFloat(input.value) || 0;
        });

        // Hitung jasa resep
        var jasaResep = 0;
        if (this.tipe === 'resep_klinik' && cfg && Array.isArray(cfg.resepKlinik)) {
            var resepIdEl = document.getElementById('trx-resep-id');
            var selectedResepId = resepIdEl ? resepIdEl.value : '';
            if (selectedResepId) {
                var resepData = this.resepList.find(function(r) { return r.id === selectedResepId; });
                if (resepData) {
                    var skemaDokter = cfg.resepKlinik.find(function(d) { return d.dokterId === resepData.dokterId; });
                    if (!skemaDokter && resepData.namaDokter) {
                        skemaDokter = cfg.resepKlinik.find(function(d) { return d.namaDokter === resepData.namaDokter; });
                    }
                    if (skemaDokter && skemaDokter.nilaiResep > 0) jasaResep = skemaDokter.nilaiResep;
                }
            }
        } else if (this.tipe === 'resep_luar' && cfg && cfg.resepLuar) {
            var dokterLuarEl = document.getElementById('trx-dokter-luar-id');
            if (dokterLuarEl && dokterLuarEl.value && cfg.resepLuar.nilaiResep > 0) jasaResep = cfg.resepLuar.nilaiResep;
        }

        var totalRaw = totalObat + totalRacik + totalTindakan + jasaResep;
        var totalRounded = Math.ceil(totalRaw / 1000) * 1000;
        var pembulatan = totalRounded - totalRaw;

        document.getElementById('trx-total-obat').textContent = Utils.formatRupiah(totalObat);
        document.getElementById('trx-ppn-keluaran').textContent = Utils.formatRupiah(totalPPNKeluaran);
        document.getElementById('trx-nilai-bersih').textContent = Utils.formatRupiah(totalObat - totalPPNKeluaran);
        document.getElementById('trx-total-racik').textContent = totalRacik > 0 ? Utils.formatRupiah(totalRacik) : '-';
        document.getElementById('trx-total-tindakan').textContent = totalTindakan > 0 ? Utils.formatRupiah(totalTindakan) : '-';
        document.getElementById('trx-jasa-resep').textContent = jasaResep > 0 ? Utils.formatRupiah(jasaResep) : '-';
        document.getElementById('trx-pembulatan').textContent = pembulatan > 0 ? Utils.formatRupiah(pembulatan) : '-';
        document.getElementById('trx-grand-total').textContent = Utils.formatRupiah(totalRounded);
    },

    // ========== SIMPAN & CETAK ==========
    simpan: function() {
        var self = this;

        // FIX (BUG KLIK DOBEL): sebelumnya tombol "Proses & Simpan" tidak pernah
        // di-disable dan tidak ada flag guard, jadi kalau kasir klik 2x dengan cepat
        // (koneksi lambat / tap ganda di HP-tablet), dua transaksi terpisah bisa
        // tersimpan untuk 1 kali penjualan -- stok berkurang dobel & pendapatan
        // tercatat dobel. Pola guard ini sudah dipakai di js/keuangan/payroll.js
        // ("cegah klik dobel"), sekarang diterapkan juga di sini.
        if (this._isSaving) return;
        this._isSaving = true;
        var btnSimpan = document.querySelector('#trx-content button[onclick="AppApotekTransaksi.simpan()"]');
        if (btnSimpan) { btnSimpan.disabled = true; btnSimpan.classList.add('opacity-50', 'cursor-not-allowed'); }
        var _resetGuard = function() {
            self._isSaving = false;
            if (btnSimpan) { btnSimpan.disabled = false; btnSimpan.classList.remove('opacity-50', 'cursor-not-allowed'); }
        };

        if (this.tipe === 'resep_luar') {
            var dokterLuarVal = document.getElementById('trx-dokter-luar-id').value.trim();
            if (!dokterLuarVal) {
                Utils.toast('Nama dokter pemberi resep wajib diisi', 'error'); _resetGuard(); return;
            }
            if (dokterLuarVal === '__LAINNYA__' && !document.getElementById('trx-dokter-luar-manual').value.trim()) {
                Utils.toast('Nama dokter/puskesmas wajib diisi', 'error'); _resetGuard(); return;
            }
        }
        if (this.tipe === 'resep_klinik' && !document.getElementById('trx-resep-id').value) {
            Utils.toast('Pilih resep klinik yang akan diproses', 'error'); _resetGuard(); return;
        }

        var items = [];
        var racikanItems = [];
        var rows = document.querySelectorAll('[id^="trx-row-"]');

        rows.forEach(function(row) {
            var idx = row.id.split('-').pop();
            var obatId = document.getElementById('trx-obat-' + idx).value;
            if (!obatId) return;

            var obat = self.masterObat.find(function(o) { return o.id === obatId; });
            if (!obat) return;

            var jumlah = parseInt(document.getElementById('trx-qty-' + idx).value) || 0;
            var hargaJual = parseInt(document.getElementById('trx-harga-' + idx).value) || 0;
            if (jumlah <= 0) return;

            items.push({
                obatId: obatId, namaObat: obat.namaObat || '-', kodeObat: obat.kodeObat || '-',
                satuan: obat.satuan || '-', hargaJual: hargaJual, hargaBeli: obat.hpp || 0, jumlah: jumlah,
                isPPN: obat.isPPN !== false
            });

            if (self.tipe === 'resep_klinik' || self.tipe === 'resep_luar') {
                var racikEl = document.getElementById('trx-racik-' + idx);
                if (racikEl && racikEl.checked) {
                    racikanItems.push({ namaObat: obat.namaObat || '-', kodeObat: obat.kodeObat || '-' });
                }
            }
        });

        if (items.length === 0) { Utils.toast('Tambahkan minimal 1 obat', 'error'); _resetGuard(); return; }

        // Kumpulkan Tindakan (SERTAKAN MODAL NYA!)
        var tindakanItemsFinal = [];
        if (this.tipe === 'resep_klinik') {
            var resepIdFinal = document.getElementById('trx-resep-id').value;
            var resepData = this.resepList.find(function(r) { return r.id === resepIdFinal; });
            if (resepData && resepData.tindakanItems) {
                tindakanItemsFinal = resepData.tindakanItems.map(function(t) {
                    return { namaTindakan: t.namaTindakan, hargaJual: t.hargaJual, modal: t.modal, kategori: 'klinik' };
                });
            }
        } else {
            // FIX: sebelumnya kategori di-hardcode 'apotek' untuk SEMUA baris tindakan
            // manual, padahal sekarang baris bisa berasal dari dropdown "Tindakan
            // Klinik" ATAU "Tindakan Apotek" (lihat addTindakan()). Ambil kategori
            // dari master data tindakan itu sendiri (tData.kategori) supaya tindakan
            // klinik tanpa resep tetap tercatat kategori 'klinik' — ini yang membuatnya
            // ikut terhitung ke pool "Tindakan Klinik (Tuslah)" di payroll, bukan
            // ke pool Apotek.
            document.querySelectorAll('[id^="trx-tindakan-row-"]').forEach(function(row) {
                var idx = row.id.replace('trx-tindakan-row-', '');
                var selectEl = document.getElementById('trx-tindakan-select-' + idx);
                var tindId = selectEl.value;
                if(tindId) {
                    var tData = self.masterTindakan.find(function(t){ return t.id === tindId; });
                    if(tData) tindakanItemsFinal.push({ namaTindakan: tData.nama, hargaJual: tData.hargaJual, modal: tData.modal, kategori: tData.kategori || 'apotek' });
                }
            });
        }

        var cfg = this.pengaturan;
        var totalObat = items.reduce(function(sum, i) { return sum + (i.jumlah * i.hargaJual); }, 0);
        var nilaiRacikConfig = (cfg && cfg.racikObat && cfg.racikObat.nilai) ? cfg.racikObat.nilai : 0;
        var totalRacik = racikanItems.length * nilaiRacikConfig;
        var totalTindakan = tindakanItemsFinal.reduce(function(sum, t) { return sum + (t.hargaJual || 0); }, 0);
        
        var jasaResepFinal = 0;
        var resepIdFinal = null, dokterIdFinal = null, dokterLuarFinal = null;

        if (this.tipe === 'resep_klinik') {
            resepIdFinal = document.getElementById('trx-resep-id').value;
            var resepData2 = this.resepList.find(function(r) { return r.id === resepIdFinal; });
            if (resepData2) {
                dokterIdFinal = resepData2.dokterId || null;
                if (cfg && Array.isArray(cfg.resepKlinik)) {
                    var skemaDokter = cfg.resepKlinik.find(function(d) { return d.dokterId === dokterIdFinal; });
                    if (!skemaDokter && resepData2.namaDokter) {
                        skemaDokter = cfg.resepKlinik.find(function(d) { return d.namaDokter === resepData2.namaDokter; });
                    }
                    if (skemaDokter) jasaResepFinal = skemaDokter.nilaiResep || 0;
                }
            }
        } else if (this.tipe === 'resep_luar') {
            var dokterLuarSelect = document.getElementById('trx-dokter-luar-id');
            if (dokterLuarSelect.value === '__LAINNYA__') {
                // FIX (permintaan user): dokter di luar daftar Pengaturan/Pembagian (puskesmas/dokter jauh)
                dokterIdFinal = null;
                dokterLuarFinal = document.getElementById('trx-dokter-luar-manual').value.trim();
            } else {
                dokterIdFinal = dokterLuarSelect.value || null;
                dokterLuarFinal = dokterLuarSelect.options[dokterLuarSelect.selectedIndex].getAttribute('data-nama');
            }
            if (cfg && cfg.resepLuar) jasaResepFinal = cfg.resepLuar.nilaiResep || 0;
        }

        var totalRaw = totalObat + totalRacik + totalTindakan + jasaResepFinal;
        var totalRounded = Math.ceil(totalRaw / 1000) * 1000;
        var pembulatan = totalRounded - totalRaw;
        var metodeBayar = document.getElementById('trx-metode-bayar').value;

        var totalPPNKeluaran = 0;
        items.forEach(function(item) {
            if (item.isPPN !== false) {
                var sub = item.jumlah * item.hargaJual;
                totalPPNKeluaran += Math.round(sub - (sub / 1.11));
            }
        });

        var obj = {
            tipe: this.tipe,
            tanggal: Utils.today(), // FIX KRITIS: sebelumnya pakai UTC, transaksi dini hari (00:00-07:00 WIB) tersimpan dengan tanggal KEMARIN sehingga tidak muncul di laporan/dashboard "hari ini"
            namaPasien: document.getElementById('trx-pasien').value.trim(),
            dokterId: dokterIdFinal,
            dokterLuar: dokterLuarFinal,
            resepId: resepIdFinal,
            items: items,
            racikanItems: racikanItems,
            tindakanItems: tindakanItemsFinal,
            totalObat: totalObat,
            totalRacik: totalRacik,
            totalTindakan: totalTindakan,
            jasaResep: jasaResepFinal,
            pembulatan: pembulatan,
            totalAkhir: totalRounded,
            metodeBayar: metodeBayar,
            totalPPN: totalPPNKeluaran,
            nilaiBersih: totalRounded - totalPPNKeluaran,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // FIX 2: Buka jendela print duluan biar gak kena blokir Popup Blocker browser
        var printWindow = window.open('', '', 'width=400,height=600');

        Utils.toast('Memproses transaksi...', 'info');

        // FIX (KEAMANAN STOK): sebelumnya pakai batch.update() + FieldValue.increment()
        // yang TIDAK membaca stok terkini dan TIDAK memvalidasi hasil akhir -- kalau ada
        // 2 transaksi bersamaan untuk obat yang sama, stok bisa jadi MINUS (oversell).
        // Sekarang pakai runTransaction(): baca stok semua obat dulu di dalam transaksi,
        // validasi cukup, baru tulis. Firestore otomatis retry transaksi ini kalau ada
        // transaksi lain yang menyentuh dokumen obat yang sama di waktu bersamaan,
        // sehingga pengecekan stok selalu berdasarkan data terbaru (tidak stale).
        var trxRef = db.collection('transaksi').doc();

        // FIX (BUG STOK GANDA): sebelumnya setiap baris item ditangani satu-per-satu,
        // sehingga kalau obat yang SAMA muncul di lebih dari satu baris (mis. kasir
        // menambahkan Paracetamol di baris 1 & baris 3), kedua baris tsb membaca stok
        // AWAL yang sama lalu masing-masing menghitung "stokBaru" dari angka awal itu
        // -- padahal keduanya menulis ke dokumen obat yang sama, jadi tx.update() kedua
        // menimpa hasil tx.update() pertama (bukan terakumulasi). Akibatnya stok yang
        // tersimpan hanya terpotong utk SALAH SATU baris, bukan total gabungan
        // keduanya (data stok jadi lebih besar dari yang seharusnya / bisa oversell).
        // Perbaikan: gabungkan (sum) jumlah per obatId dulu -- sama seperti pola yang
        // sudah dipakai di js/apotek/retur.js (deltaMap) -- baru divalidasi & ditulis
        // sekali per obatId.
        var qtyPerObat = {};
        items.forEach(function(item) {
            qtyPerObat[item.obatId] = (qtyPerObat[item.obatId] || 0) + item.jumlah;
        });
        var obatIdsUnik = Object.keys(qtyPerObat);

        // FIX (BUG RESEP DOBEL): sebelumnya statusResep rekamMedis langsung ditulis
        // 'selesai' TANPA dibaca/divalidasi dulu di dalam transaksi (beda dengan stok
        // obat yang sudah divalidasi dengan benar di atas). Kalau simpan() ini
        // ke-trigger dua kali untuk resep yang sama (klik dobel sebelum ada guard,
        // atau dua tab/sesi kasir yang masih menampilkan resep yang sama karena
        // resepList tidak real-time), resep bisa tertagih & "terhabiskan" dua kali.
        // Sekarang statusResep ikut dibaca & divalidasi di dalam transaksi yang sama.
        var resepRef = (self.tipe === 'resep_klinik' && obj.resepId) ? db.collection('rekamMedis').doc(obj.resepId) : null;

        db.runTransaction(function(tx) {
            // 1) BACA semua dokumen obat yang terlibat TERLEBIH DAHULU (wajib di Firestore:
            //    semua read harus selesai sebelum write pertama dalam satu transaksi).
            var obatRefs = obatIdsUnik.map(function(obatId) {
                return db.collection('obat').doc(obatId);
            });
            var reads = obatRefs.map(function(ref) { return tx.get(ref); });
            if (resepRef) reads.push(tx.get(resepRef));

            return Promise.all(reads)
                .then(function(allSnaps) {
                    var snaps = allSnaps.slice(0, obatRefs.length);
                    if (resepRef) {
                        var resepSnap = allSnaps[obatRefs.length];
                        if (!resepSnap.exists) {
                            throw new Error('Resep klinik terkait tidak ditemukan (mungkin sudah dihapus).');
                        }
                        var statusResepSaatIni = resepSnap.data().statusResep;
                        if (statusResepSaatIni && statusResepSaatIni !== 'menunggu') {
                            throw new Error('Resep ini sudah diproses/ditagih sebelumnya oleh transaksi lain.');
                        }
                    }
                    // 2) VALIDASI: pastikan setiap obat masih ada & stok TOTAL (gabungan semua
                    //    baris obat yang sama) cukup. Jika tidak, batalkan seluruh transaksi
                    //    (throw) -- tidak ada perubahan sebagian (all-or-nothing).
                    var updates = [];
                    for (var i = 0; i < obatIdsUnik.length; i++) {
                        var obatId = obatIdsUnik[i];
                        var snap = snaps[i];
                        var totalJumlah = qtyPerObat[obatId];
                        // Nama obat untuk pesan error (ambil dari baris item pertama yang cocok)
                        var namaObatRef = items.find(function(it) { return it.obatId === obatId; });
                        var namaObat = namaObatRef ? namaObatRef.namaObat : obatId;

                        if (!snap.exists) {
                            throw new Error('Obat "' + namaObat + '" tidak ditemukan (mungkin sudah dihapus).');
                        }

                        var stokSaatIni = snap.data().stok || 0;
                        if (stokSaatIni < totalJumlah) {
                            throw new Error('Stok "' + namaObat + '" tidak cukup. Tersisa ' +
                                stokSaatIni + ', dibutuhkan ' + totalJumlah + '.');
                        }

                        updates.push({ ref: obatRefs[i], stokBaru: stokSaatIni - totalJumlah });
                    }

                    // 3) TULIS: simpan transaksi + kurangi stok obat, semua atomik.
                    tx.set(trxRef, obj);
                    updates.forEach(function(u) {
                        // Tulis nilai absolut hasil validasi (bukan increment lagi),
                        // supaya nilai yang tersimpan konsisten dengan yang divalidasi
                        // di atas & selalu >= 0.
                        tx.update(u.ref, { stok: u.stokBaru });
                    });

                    if (resepRef) {
                        tx.update(resepRef, { statusResep: 'selesai' });
                    }
                });
        }).then(function() {
            obj.id = trxRef.id;
            Utils.toast('Transaksi berhasil! Stok obat dikurangi.', 'success');
            self.cetakStruk(obj, printWindow); // KIRIM WINDOW YANG SUDAH DIBUKA KE FUNGSI CETAK
            _resetGuard();
            AppApotekTransaksi.init();
        }).catch(function(err) {
            Utils.toast('Gagal menyimpan: ' + err.message, 'error');
            if (printWindow) printWindow.close(); // Tutup window kalau transaksinya gagal
            _resetGuard();
        });
    },

    // ========== CETAK STRUK ==========
    cetakStruk: function(data, w) {
        if(!w) {
            Utils.toast('Popup struk diblokir browser. Izinkan pop-up untuk situs ini.', 'error');
            return;
        }

        // Tampilkan loading di window cetak selagi mengambil data dari Firestore
        w.document.write('<html><head><title>Struk Transaksi</title></head><body style="font-family:monospace;padding:20px;text-align:center;">Memuat data struk...</body></html>');
        w.document.close();
        
        db.collection('pengaturan').doc('profil').get().then(function(doc) {
            var p = doc.exists ? doc.data() : {};
            
            // JIKA printer termal Bluetooth terhubung, cetak langsung via Bluetooth!
            if (window.ThermalPrinter && window.ThermalPrinter.isConnected()) {
                window.ThermalPrinter.printReceipt(data, p);
                
                // Jika otomatis cetak aktif, tutup window browser standard dan tidak perlu dialog print browser
                if (window.ThermalPrinter.isAutoPrint) {
                    if (w) {
                        w.close();
                        return;
                    }
                }
            }
            
            // Fallback values bila record belum ada atau kosong
            var namaInstansi = p.nama || 'Aulia Apotek Klinik';
            var tampilkanLogo = p.tampilkanLogo !== false;
            var logoStrukB64 = p.logoStrukB64 || '';
            var logoUkuran = p.logoUkuran || 100;
            var logoPosisi = p.logoPosisi || 'center';
            
            var h1 = p.strukHeader1 || namaInstansi;
            var h2 = p.strukHeader2 || '';
            var h3 = p.strukHeader3 || p.alamat || '';
            var h4 = p.strukHeader4 || (p.telp ? 'Telp: ' + p.telp : '');
            var hSelesai = p.strukHeaderSelesai || '';
            
            var showPasien = p.showPasien !== false;
            var showDokter = p.showDokter !== false;
            var showMetodeBayar = p.showMetodeBayar !== false;
            
            var f1 = p.strukFooter1 || 'Terima Kasih';
            var f2 = p.strukFooter2 || 'Semoga Lekas Sembuh';
            var fRetur = p.footerStruk || '';
            
            var strukLebar = p.strukLebar || '80mm';
            var strukUkuranFont = p.strukUkuranFont || '12px';

            var tgl = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
            
            var html = '<html><head><title>Struk Transaksi</title>';
            html += '<style>';
            html += '@media print { .no-print { display: none !important; } }';
            html += 'body { font-family: "Courier New", monospace; font-size: ' + strukUkuranFont + '; width: ' + strukLebar + '; margin: 0; padding: 10px; color: #000; }';
            html += 'h2, h3, p { margin: 0; padding: 0; text-align: center; }';
            html += 'hr { border-top: 1px dashed #000; margin: 8px 0; }';
            html += 'table { width: 100%; border-collapse: collapse; }';
            html += 'td { vertical-align: top; padding: 2px 0; }';
            html += '.right { text-align: right; }';
            html += '.bold { font-weight: bold; }';
            html += '.center { text-align: center; }';
            html += '.flex-logo { display: flex; }';
            html += '.flex-logo.center { justify-content: center; }';
            html += '.flex-logo.left { justify-content: flex-start; }';
            html += '.flex-logo.right { justify-content: flex-end; }';
            html += '</style></head><body>';
            
            // JIKA printer termal Bluetooth terhubung, tampilkan tombol aksi manual di popup
            if (window.ThermalPrinter && window.ThermalPrinter.isConnected()) {
                html += '<div class="no-print" style="background:#eff6ff; border: 1px solid #bfdbfe; padding:8px; margin-bottom:12px; border-radius:6px; display:flex; gap:6px; justify-content:center; align-items:center;">';
                html += '  <button onclick="window.opener.ThermalPrinter.printReceipt(' + JSON.stringify(data).replace(/"/g, '&quot;') + ', ' + JSON.stringify(p).replace(/"/g, '&quot;') + ');" style="background:#2563eb; color:white; border:none; padding:6px 12px; border-radius:4px; font-family:sans-serif; font-size:11px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:4px;">🔌 Cetak Bluetooth</button>';
                html += '  <button onclick="window.print()" style="background:#475569; color:white; border:none; padding:6px 12px; border-radius:4px; font-family:sans-serif; font-size:11px; font-weight:bold; cursor:pointer;">📄 Cetak Biasa</button>';
                html += '</div>';
            }
            
            // 1. Logo
            if (tampilkanLogo) {
                var alignClass = logoPosisi; // left, center, right
                if (logoStrukB64) {
                    html += '<div class="flex-logo ' + alignClass + '" style="margin-bottom: 8px;">';
                    html += '  <img src="' + logoStrukB64 + '" style="width: ' + logoUkuran + 'px; height: auto;">';
                    html += '</div>';
                } else {
                    // Default circle logo if no base64 logo uploaded but toggle is true
                    html += '<div class="flex-logo ' + alignClass + '" style="margin-bottom: 8px;">';
                    html += '  <div style="border: 1.5px solid #000; border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">';
                    html += '    ' + h1.charAt(0);
                    html += '  </div>';
                    html += '</div>';
                }
            }

            // 2. Headers
            if (h1) html += '<h2 class="bold">' + Utils.escapeHtml(h1) + '</h2>';
            if (h2) html += '<p>' + Utils.escapeHtml(h2) + '</p>';
            if (h3) html += '<p>' + Utils.escapeHtml(h3) + '</p>';
            if (h4) html += '<p>' + Utils.escapeHtml(h4) + '</p>';
            if (hSelesai) html += '<p style="font-style: italic; margin-top: 2px;">' + Utils.escapeHtml(hSelesai) + '</p>';
            
            html += '<hr>';
            
            // 3. Metadata
            html += '<table>';
            html += '<tr><td style="width: 25%;">No</td><td>: ' + data.id.substring(0, 8).toUpperCase() + '</td></tr>';
            html += '<tr><td>Tgl</td><td>: ' + tgl + '</td></tr>';
            if (showPasien) {
                html += '<tr><td>Pasien</td><td>: ' + Utils.escapeHtml(data.namaPasien || '-') + '</td></tr>';
            }
            if (showDokter && (data.tipe === 'resep_klinik' || data.tipe === 'resep_luar')) {
                html += '<tr><td>Dokter</td><td>: ' + Utils.escapeHtml(data.dokterLuar || 'Klinik') + '</td></tr>';
            }
            if (showMetodeBayar) {
                html += '<tr><td>Bayar</td><td>: ' + ((data.metodeBayar || '-') + '').toUpperCase() + '</td></tr>';
            }
            html += '</table><hr>';
            
            // 4. Items Table
            html += '<table>';
            data.items.forEach(function(item) {
                html += '<tr><td colspan="2">' + Utils.escapeHtml(item.namaObat || '') + '</td></tr>';
                html += '<tr><td>' + item.jumlah + ' x ' + Utils.formatRupiah(item.hargaJual) + '</td><td class="right">' + Utils.formatRupiah(item.jumlah * item.hargaJual) + '</td></tr>';
            });
            html += '</table><hr>';
            
            if (data.tindakanItems && data.tindakanItems.length > 0) {
                html += '<table>';
                data.tindakanItems.forEach(function(t) {
                    html += '<tr><td>' + Utils.escapeHtml(t.namaTindakan || '') + '</td><td class="right">' + Utils.formatRupiah(t.hargaJual) + '</td></tr>';
                });
                html += '</table><hr>';
            }
            
            // 5. Totals
            html += '<table>';
            html += '<tr><td>Total Obat</td><td class="right">' + Utils.formatRupiah(data.totalObat) + '</td></tr>';
            if (data.totalRacik > 0) html += '<tr><td>Racik (' + data.racikanItems.length + ' item)</td><td class="right">' + Utils.formatRupiah(data.totalRacik) + '</td></tr>';
            if (data.totalTindakan > 0) html += '<tr><td>Total Tindakan</td><td class="right">' + Utils.formatRupiah(data.totalTindakan) + '</td></tr>';
            if (data.jasaResep > 0) html += '<tr><td>Jasa Resep</td><td class="right">' + Utils.formatRupiah(data.jasaResep) + '</td></tr>';
            if (data.pembulatan > 0) html += '<tr><td>Pembulatan</td><td class="right">' + Utils.formatRupiah(data.pembulatan) + '</td></tr>';
            html += '<tr class="bold"><td>TOTAL</td><td class="right">' + Utils.formatRupiah(data.totalAkhir) + '</td></tr>';
            html += '</table><hr>';
            
            // 6. Footers
            if (f1) html += '<p>' + Utils.escapeHtml(f1) + '</p>';
            if (f2) html += '<p>' + Utils.escapeHtml(f2) + '</p>';
            if (fRetur) html += '<p style="font-style: italic; margin-top: 4px;">* ' + Utils.escapeHtml(fRetur) + ' *</p>';
            
            if (window.ThermalPrinter && window.ThermalPrinter.isConnected()) {
                // Jangan panggil window.print() otomatis, agar user bisa memilih "Cetak Bluetooth" atau "Cetak Biasa" di tombol atas.
            } else {
                html += '<script>window.onload = function() { window.print(); }<\/script>';
            }
            html += '</body></html>';
            
            // Re-open/clear the document and write the real content
            w.document.open();
            w.document.write(html);
            w.document.close();
        }).catch(function(err) {
            console.error('Gagal mengambil profil struk:', err);
            // Fallback rendering in case of database load failure
            var tgl = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
            var html = '<html><head><title>Struk Transaksi</title>';
            html += '<style>body { font-family: "Courier New", monospace; font-size: 12px; width: 80mm; margin: 0; padding: 10px; color: #000; } h2, p { text-align: center; margin: 0; } hr { border-top: 1px dashed #000; margin: 8px 0; } table { width:100%; } .right { text-align:right; } .bold { font-weight:bold; }</style></head><body>';
            html += '<h2 class="bold">AULIA APOTEK KLINIK</h2>';
            html += '<p>Jl. Contoh Alamat No. 123, Kota</p><hr>';
            html += '<table><tr><td>No</td><td>: ' + data.id.substring(0, 8).toUpperCase() + '</td></tr>';
            html += '<tr><td>Tgl</td><td>: ' + tgl + '</td></tr></table><hr>';
            html += '<table>';
            data.items.forEach(function(item) {
                html += '<tr><td colspan="2">' + Utils.escapeHtml(item.namaObat || '') + '</td></tr>';
                html += '<tr><td>' + item.jumlah + ' x ' + Utils.formatRupiah(item.hargaJual) + '</td><td class="right">' + Utils.formatRupiah(item.jumlah * item.hargaJual) + '</td></tr>';
            });
            html += '</table><hr>';
            html += '<table><tr class="bold"><td>TOTAL</td><td class="right">' + Utils.formatRupiah(data.totalAkhir) + '</td></tr></table><hr>';
            html += '<p>Terima Kasih</p><p>Semoga Lekas Sembuh</p>';
            if (window.ThermalPrinter && window.ThermalPrinter.isConnected()) {
                html += '</body></html>';
            } else {
                html += '<script>window.onload = function() { window.print(); }<\/script></body></html>';
            }
            
            w.document.open();
            w.document.write(html);
            w.document.close();
        });
    }
};