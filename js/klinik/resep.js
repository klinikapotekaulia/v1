/**
 * js/klinik/resep.js
 * Pelacakan Status Resep (Rekam Medis -> Apotek)
 *
 * CATATAN PERBAIKAN:
 * File ini SEBELUMNYA berisi duplikat kode dari apotek/retur.js (window.AppApotekRetur),
 * bukan modul Resep Klinik. Akibatnya:
 *   1. Menu "Resep" di sidebar Klinik selalu gagal dibuka — app.js mencari
 *      window.AppKlinikResep (hasil konversi otomatis dari path 'klinik/resep'),
 *      padahal objek yang benar-benar ada adalah window.AppApotekRetur.
 *   2. Saat menu Resep dibuka SETELAH menu Retur Obat, file ini menimpa ulang
 *      window.AppApotekRetur dengan versi duplikat (yang kebetulan berbeda cara
 *      memanggil Utils.openModal), sehingga isi form "Buat Retur Baru" bisa berubah-ubah
 *      tergantung urutan menu yang dibuka user. Ini akar masalah "isi konten Buat Retur
 *      Baru tidak logic" yang dilaporkan.
 * Perbaikan: file ini sekarang berisi modul AppKlinikResep yang sesuai namanya, dan
 * apotek/retur.js sudah diperbaiki independen (lihat catatan FIX di file tersebut).
 *
 * FUNGSI:
 * - Menampilkan daftar resep yang dibuat dari Rekam Medis (rekamMedis dengan status
 *   'selesai'), lengkap dengan status pemrosesan resep (statusResep: menunggu/selesai).
 * - Terintegrasi langsung dengan apotek/transaksi.js: resep berstatus 'menunggu' adalah
 *   resep yang sama yang muncul di form Transaksi > Resep Klinik untuk diproses kasir apotek.
 * - Tombol "Proses di Apotek" mengarahkan langsung ke menu Transaksi.
 *
 * FIRESTORE COLLECTIONS (dibaca, tidak ditulis oleh modul ini):
 *   - rekamMedis { tanggal, nomorRM, namaPasien, dokterId, namaDokter, diagnosa,
 *                  tindakanItems[], status, statusResep, createdAt }
 */

window.AppKlinikResep = {

    // ===== STATE =====
    data: [],
    filterBulan: '',
    filterStatus: 'semua',

    // ===== RENDER =====
    render: function() {
        var d = new Date();
        var defaultMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        return [
            '<div class="page-enter max-w-5xl">',
            '  <div class="mb-6">',
            '    <h2 class="text-xl font-bold text-gray-800 dark:text-white">Resep Klinik</h2>',
            '    <p class="text-sm text-slate-500 dark:text-slate-400">Status resep dari rekam medis menuju apotek</p>',
            '  </div>',

            '  <div class="flex flex-wrap items-center gap-3 mb-5">',
            '    <label class="text-sm text-slate-500 dark:text-slate-400">Bulan:</label>',
            '    <input type="month" id="resep-filter-bulan" value="' + defaultMonth + '" class="px-3 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm outline-none">',
            '    <label class="text-sm text-slate-500 dark:text-slate-400 ml-2">Status:</label>',
            '    <select id="resep-filter-status" class="px-3 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg text-sm outline-none">',
            '      <option value="semua">Semua</option>',
            '      <option value="menunggu">Menunggu Diproses</option>',
            '      <option value="selesai">Selesai di Apotek</option>',
            '    </select>',
            '    <button onclick="AppKlinikResep.init()" class="bg-primary-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium">Tampilkan</button>',
            '  </div>',

            '  <div id="resep-list"><div class="flex justify-center py-20"><div class="spinner"></div></div></div>',
            '</div>'
        ].join('');
    },

    // ===== INIT =====
    init: function() {
        var self = this;
        var bulanEl  = document.getElementById('resep-filter-bulan');
        var statusEl = document.getElementById('resep-filter-status');
        var bulan    = bulanEl ? bulanEl.value : new Date().toISOString().slice(0, 7);
        this.filterStatus = statusEl ? statusEl.value : 'semua';
        var start = bulan + '-01';
        var end   = bulan + '-31';

        db.collection('rekamMedis')
          .where('status', '==', 'selesai')
          .where('tanggal', '>=', start).where('tanggal', '<=', end)
          .orderBy('tanggal', 'desc').get()
          .then(function(snap) {
              self.data = [];
              snap.forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.data.push(d); });
              self.renderList();
          }).catch(function(err) {
              document.getElementById('resep-list').innerHTML =
                  '<p class="text-red-500 text-center py-10">Gagal memuat: ' + Utils.escapeHtml(err.message) + '</p>';
          });
    },

    // ===== RENDER LIST =====
    renderList: function() {
        var container = document.getElementById('resep-list');
        if (!container) return;

        var filtered = this.data.filter(function(r) {
            if (AppKlinikResep.filterStatus === 'menunggu') return !r.statusResep || r.statusResep === 'menunggu';
            if (AppKlinikResep.filterStatus === 'selesai')  return r.statusResep === 'selesai';
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center py-16 text-slate-400"><i data-lucide="file-text" class="w-10 h-10 mx-auto mb-3"></i><p>Belum ada resep pada periode/filter ini</p></div>';
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Summary
        var totalMenunggu = filtered.filter(function(r) { return !r.statusResep || r.statusResep === 'menunggu'; }).length;
        var totalSelesai  = filtered.filter(function(r) { return r.statusResep === 'selesai'; }).length;

        var html = '<div class="grid grid-cols-2 gap-3 mb-5">';
        html += '<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">';
        html += '  <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Menunggu Diproses</p>';
        html += '  <p class="text-xl font-bold text-rose-600 dark:text-rose-400">' + totalMenunggu + ' Resep</p>';
        html += '</div>';
        html += '<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">';
        html += '  <p class="text-xs text-slate-500 dark:text-slate-400 mb-1">Selesai di Apotek</p>';
        html += '  <p class="text-xl font-bold text-emerald-600 dark:text-emerald-400">' + totalSelesai + ' Resep</p>';
        html += '</div></div>';

        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">';
        html += '<table class="w-full text-sm">';
        html += '<thead class="bg-slate-50 dark:bg-slate-700 text-xs uppercase text-slate-500 dark:text-slate-400">';
        html += '<tr><th class="px-4 py-3 text-left">Tanggal</th><th class="px-4 py-3 text-left">Pasien</th><th class="px-4 py-3 text-left">Dokter</th><th class="px-4 py-3 text-left">Diagnosa</th><th class="px-4 py-3 text-center">Tindakan</th><th class="px-4 py-3 text-center">Status</th><th class="px-4 py-3 text-center">Aksi</th></tr>';
        html += '</thead><tbody class="divide-y divide-slate-100 dark:divide-slate-700">';

        filtered.forEach(function(r) {
            var belumProses = !r.statusResep || r.statusResep === 'menunggu';
            var jmlTindakan = Array.isArray(r.tindakanItems) ? r.tindakanItems.length : 0;

            html += '<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50">';
            html += '<td class="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">' + (r.tanggal || '-') + '</td>';
            html += '<td class="px-4 py-3"><p class="font-medium text-gray-800 dark:text-white">' + Utils.escapeHtml(r.namaPasien || '-') + '</p>';
            html += '<p class="text-xs text-slate-400 font-mono">' + Utils.escapeHtml(r.nomorRM || '-') + '</p></td>';
            html += '<td class="px-4 py-3 text-slate-600 dark:text-slate-300">' + Utils.escapeHtml(r.namaDokter || '-') + '</td>';
            html += '<td class="px-4 py-3 text-slate-600 dark:text-slate-300">' + Utils.escapeHtml(r.diagnosa || '-') + '</td>';
            html += '<td class="px-4 py-3 text-center">' + jmlTindakan + '</td>';
            html += '<td class="px-4 py-3 text-center">' + AppKlinikResep._badgeStatus(belumProses ? 'menunggu' : 'selesai') + '</td>';
            html += '<td class="px-4 py-3 text-center">';
            if (belumProses) {
                html += '<button onclick="AppKlinikResep.prosesDiApotek()" class="text-xs bg-primary-100 hover:bg-primary-200 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400 px-2 py-1 rounded font-semibold">Proses di Apotek</button>';
            } else {
                html += '<span class="text-xs text-slate-400">-</span>';
            }
            html += '</td></tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    // ===== AKSI: arahkan ke Transaksi Apotek =====
    // TAMBAHAN: integrasi navigasi ke apotek/transaksi.js, tempat resep 'menunggu' yang sama
    // (rekamMedis.status === 'selesai' && statusResep === 'menunggu') memang diproses kasir apotek
    // lewat tipe transaksi "Resep Klinik".
    prosesDiApotek: function() {
        Utils.toast('Pilih pasien resep pada form Transaksi > Resep Klinik', 'info');
        navigateTo('apotek/transaksi', 'Transaksi');
    },

    // ===== HELPER =====
    _badgeStatus: function(status) {
        var map = {
            menunggu: ['bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', 'Menunggu'],
            selesai:  ['bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', 'Selesai']
        };
        var s = map[status] || ['bg-slate-100 text-slate-500', status || '-'];
        return '<span class="text-xs ' + s[0] + ' font-semibold px-2 py-1 rounded-full">' + s[1] + '</span>';
    }
};
