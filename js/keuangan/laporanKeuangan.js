/**
 * js/keuangan/laporanKeuangan.js
 * Laporan Keuangan (Laba/Rugi & Arus Kas) - Hanya PSA/Keuangan
 */

window.AppKeuanganLaporanKeuangan = {
    dataTransaksi: [],
    dataPengeluaran: [],
    dataPembelian: [],
    dataPayroll: [],       // FITUR BARU
    dataTransaksiPrev: [], // FITUR BARU
    dataPemasukanLain: [], // FITUR BARU: pemasukan non-penjualan (kasMasuk), mis. selisih retur tukar barang
    summary: null,         // FITUR BARU: dipakai oleh exportExcel()

    render: function() {
        var d = new Date();
        var defaultMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

        var html = '<div class="page-enter max-w-6xl">';
        html += '  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">';
        html += '    <div>';
        html += '      <h2 class="text-xl font-bold text-gray-800 dark:text-white">Laporan Keuangan</h2>';
        html += '      <p class="text-sm text-slate-500 dark:text-slate-400">Rekap arus kas & laba rugi bulanan</p>';
        html += '    </div>';
        html += '    <div class="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1">';
        html += '      <input type="month" id="filter-bulan" value="' + defaultMonth + '" class="px-3 py-1.5 bg-transparent dark:text-white text-sm rounded-md outline-none">';
        html += '      <button onclick="AppKeuanganLaporanKeuangan.init()" class="bg-primary-600 text-white text-sm px-4 py-1.5 rounded-md font-medium">Tampilkan</button>';
        html += '    </div>';
        html += '  </div>';
        
        html += '  <div id="laporan-content"><div class="flex justify-center py-20"><div class="spinner"></div></div></div>';
        html += '</div>';
        return html;
    },

    init: function() {
        var self = this;
        var monthInput = document.getElementById('filter-bulan');
        if (!monthInput) return;
        
        var bulan = monthInput.value; // Format: YYYY-MM
        var startDate = bulan + '-01';
        var endDate = bulan + '-31';

        // Bulan sebelumnya, untuk perbandingan pertumbuhan (FITUR BARU: laporan lebih lengkap)
        var prevParts = bulan.split('-');
        var prevDate = new Date(parseInt(prevParts[0]), parseInt(prevParts[1]) - 1, 1);
        prevDate.setMonth(prevDate.getMonth() - 1);
        var prevBulan = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

        // Query semua data di bulan tersebut
        var pTrx = db.collection('transaksi').where('tanggal', '>=', startDate).where('tanggal', '<=', endDate).get();
        var pKeluar = db.collection('kasKeluar').where('status', '==', 'approved').where('tanggal', '>=', startDate).where('tanggal', '<=', endDate).get();
        // FITUR BARU: pemasukan non-penjualan (mis. selisih retur tukar barang yang DITERIMA dari
        // supplier) sekarang juga otomatis masuk laporan, bukan cuma tersimpan di database saja.
        var pMasuk = db.collection('kasMasuk').where('status', '==', 'approved').where('tanggal', '>=', startDate).where('tanggal', '<=', endDate).get();
        var pBeli = db.collection('pembelian').where('tanggal', '>=', startDate).where('tanggal', '<=', endDate).get();
        // FIX/FITUR BARU: sertakan beban payroll (sebelumnya tidak ikut dihitung sama sekali di laporan ini,
        // sehingga "Laba Bersih" terlihat lebih besar dari kondisi riil).
        var pPayroll = db.collection('payrollHistory').where('bulan', '==', bulan).get();
        var pTrxPrev = db.collection('transaksi').where('tanggal', '>=', prevBulan + '-01').where('tanggal', '<=', prevBulan + '-31').get();

        Promise.all([pTrx, pKeluar, pBeli, pPayroll, pTrxPrev, pMasuk]).then(function(results) {
            self.dataTransaksi = [];
            results[0].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataTransaksi.push(d); });

            self.dataPengeluaran = [];
            results[1].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataPengeluaran.push(d); });

            self.dataPembelian = [];
            results[2].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataPembelian.push(d); });

            self.dataPayroll = [];
            results[3].forEach(function(doc) { self.dataPayroll.push(doc.data()); });

            self.dataTransaksiPrev = [];
            results[4].forEach(function(doc) { self.dataTransaksiPrev.push(doc.data()); });

            // FITUR BARU: pemasukan non-penjualan (kasMasuk approved), mis. selisih retur tukar barang.
            self.dataPemasukanLain = [];
            results[5].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataPemasukanLain.push(d); });

            self.renderReport();
        }).catch(function(err) {
            Utils.toast('Gagal memuat laporan: ' + err.message, 'error');
            console.error(err);
        });
    },

    renderReport: function() {
        var container = document.getElementById('laporan-content');
        var self = this;

        // 1. KALKULASI PENDAPATAN (Dari Transaksi)
        var totalOmzet = 0, totalHPP = 0, totalLabaKotor = 0;
        var totalTindakan = 0, totalRacik = 0, totalJasaResep = 0;
        var cashMasuk = 0, transferMasuk = 0, qrisMasuk = 0;

        this.dataTransaksi.forEach(function(t) {
            var omzetObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * i.hargaJual); }, 0) : 0;
            var hppObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * (i.hargaBeli || 0)); }, 0) : 0;
            
            totalOmzet += omzetObat + (t.totalRacik || 0) + (t.totalTindakan || 0) + (t.jasaResep || 0);
            totalHPP += hppObat;
            totalTindakan += (t.totalTindakan || 0);
            totalRacik += (t.totalRacik || 0);
            totalJasaResep += (t.jasaResep || 0);
            totalLabaKotor += (omzetObat - hppObat) + (t.totalRacik || 0) + (t.totalTindakan || 0) + (t.jasaResep || 0);

            if (t.metodeBayar === 'cash') cashMasuk += t.totalAkhir || 0;
            else if (t.metodeBayar === 'transfer') transferMasuk += t.totalAkhir || 0;
            else if (t.metodeBayar === 'qris') qrisMasuk += t.totalAkhir || 0;
        });

        // 2. KALKULASI PENGELUARAN
        var totalOperasional = 0, totalBeliTunai = 0, totalBeliKredit = 0;
        
        this.dataPengeluaran.forEach(function(p) {
            totalOperasional += p.jumlah || 0;
        });

        this.dataPembelian.forEach(function(b) {
            if (b.metodePembayaran === 'tunai') totalBeliTunai += b.totalHarga || 0;
            else totalBeliKredit += b.totalHarga || 0;
        });

        // FITUR BARU: Beban Payroll (Gaji + Tunjangan). Sebelumnya laporan ini SAMA SEKALI tidak
        // memasukkan beban gaji karyawan, sehingga Laba Bersih yang ditampilkan tidak realistis.
        var totalGajiPokok = 0, totalTunjanganJasa = 0;
        this.dataPayroll.forEach(function(g) {
            var gp = g.gajiPokok || 0;
            var tot = g.totalGaji || 0;
            totalGajiPokok += gp;
            totalTunjanganJasa += Math.max(0, tot - gp);
        });
        var totalBebanPayroll = totalGajiPokok + totalTunjanganJasa;

        // FITUR BARU: Pemasukan Lain (Non-Penjualan) — mis. selisih retur tukar barang yang
        // DITERIMA dari supplier, otomatis tercatat di koleksi kasMasuk saat retur dikonfirmasi.
        var totalPemasukanLain = 0;
        this.dataPemasukanLain.forEach(function(m) { totalPemasukanLain += m.jumlah || 0; });

        var totalKasKeluar = totalOperasional + totalBeliTunai + totalBebanPayroll;
        var labaBersih = totalLabaKotor - totalOperasional - totalBebanPayroll + totalPemasukanLain;

        // FITUR BARU: perbandingan omzet dengan bulan sebelumnya (pertumbuhan)
        var omzetBulanLalu = 0;
        this.dataTransaksiPrev.forEach(function(t) {
            var omzetObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * i.hargaJual); }, 0) : 0;
            omzetBulanLalu += omzetObat + (t.totalRacik || 0) + (t.totalTindakan || 0) + (t.jasaResep || 0);
        });
        var pertumbuhanOmzet = omzetBulanLalu > 0 ? ((totalOmzet - omzetBulanLalu) / omzetBulanLalu) * 100 : null;

        // FITUR BARU: rasio keuangan dasar
        var marginLabaKotor = totalOmzet > 0 ? (totalLabaKotor / totalOmzet) * 100 : 0;
        var marginLabaBersih = totalOmzet > 0 ? (labaBersih / totalOmzet) * 100 : 0;

        // Simpan ringkasan supaya bisa dipakai fungsi export tanpa hitung ulang
        this.summary = {
            totalOmzet: totalOmzet, totalHPP: totalHPP, totalLabaKotor: totalLabaKotor,
            totalTindakan: totalTindakan, totalRacik: totalRacik, totalJasaResep: totalJasaResep,
            cashMasuk: cashMasuk, transferMasuk: transferMasuk, qrisMasuk: qrisMasuk,
            totalOperasional: totalOperasional, totalBeliTunai: totalBeliTunai, totalBeliKredit: totalBeliKredit,
            totalGajiPokok: totalGajiPokok, totalTunjanganJasa: totalTunjanganJasa, totalBebanPayroll: totalBebanPayroll,
            totalPemasukanLain: totalPemasukanLain,
            totalKasKeluar: totalKasKeluar, labaBersih: labaBersih,
            marginLabaKotor: marginLabaKotor, marginLabaBersih: marginLabaBersih, pertumbuhanOmzet: pertumbuhanOmzet
        };

        // 3. RENDER UI
        var html = '<div class="flex justify-end mb-4">';
        html += '  <button onclick="AppKeuanganLaporanKeuangan.exportExcel()" class="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2"><i data-lucide="file-spreadsheet" class="w-4 h-4"></i> Export Laporan (Excel)</button>';
        html += '</div>';

        // FITUR BARU: kartu rasio & pertumbuhan
        html += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">';
        html += '  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"><p class="text-xs text-slate-400 mb-1">Margin Laba Kotor</p><p class="text-xl font-bold text-primary-600">' + marginLabaKotor.toFixed(1) + '%</p></div>';
        html += '  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"><p class="text-xs text-slate-400 mb-1">Margin Laba Bersih</p><p class="text-xl font-bold ' + (marginLabaBersih >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + marginLabaBersih.toFixed(1) + '%</p></div>';
        html += '  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"><p class="text-xs text-slate-400 mb-1">Pertumbuhan Omzet vs Bulan Lalu</p><p class="text-xl font-bold ' + (pertumbuhanOmzet === null ? 'text-slate-400' : (pertumbuhanOmzet >= 0 ? 'text-emerald-600' : 'text-red-600')) + '">' + (pertumbuhanOmzet === null ? 'N/A' : (pertumbuhanOmzet >= 0 ? '+' : '') + pertumbuhanOmzet.toFixed(1) + '%') + '</p></div>';
        html += '</div>';

        html += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">';
        
        // Kartu 1: Ringkasan Laba Rugi
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">';
        html += '  <h3 class="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><i data-lucide="trending-up" class="w-5 h-5 text-emerald-500"></i> Ringkasan Laba/Rugi</h3>';
        html += '  <div class="space-y-3 text-sm">';
        html += '    <div class="flex justify-between"><span class="text-slate-500">Omzet Penjualan</span><span class="font-semibold text-gray-800 dark:text-white">' + Utils.formatRupiah(totalOmzet) + '</span></div>';
        html += '    <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Modal Obat (HPP)</span><span class="text-red-500">' + Utils.formatRupiah(totalHPP) + '</span></div>';
        html += '    <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">+ Tindakan & Jasa</span><span class="text-emerald-500">' + Utils.formatRupiah(totalTindakan + totalJasaResep) + '</span></div>';
        html += '    <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">+ Racik & Lainnya</span><span class="text-emerald-500">' + Utils.formatRupiah(totalRacik) + '</span></div>';
        html += '    <div class="flex justify-between border-t border-slate-100 pt-2"><span class="font-semibold text-slate-600 dark:text-slate-300">Laba Kotor</span><span class="font-bold text-primary-600">' + Utils.formatRupiah(totalLabaKotor) + '</span></div>';
        html += '    <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Gaji Pokok Karyawan</span><span class="text-red-500">' + Utils.formatRupiah(totalGajiPokok) + '</span></div>';
        html += '    <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Tunjangan & Jasa Pembagian Hasil</span><span class="text-red-500">' + Utils.formatRupiah(totalTunjanganJasa) + '</span></div>';
        if (totalPemasukanLain > 0) {
            html += '    <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">+ Pemasukan Lain (Retur Tukar Barang, dll)</span><span class="text-emerald-500">' + Utils.formatRupiah(totalPemasukanLain) + '</span></div>';
        }
        html += '    <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Biaya Operasional Lain</span><span class="text-red-500">' + Utils.formatRupiah(totalOperasional) + '</span></div>';
        html += '    <div class="flex justify-between border-t-2 border-slate-200 pt-3 mt-2"><span class="font-bold text-gray-800 dark:text-white">LABA BERSIH</span><span class="font-bold text-lg ' + (labaBersih >= 0 ? 'text-emerald-600' : 'text-red-600') + '">' + Utils.formatRupiah(labaBersih) + '</span></div>';
        html += '  </div>';
        html += '</div>';

        // Kartu 2: Arus Kas (Cash Flow)
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">';
        html += '  <h3 class="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><i data-lucide="wallet" class="w-5 h-5 text-sky-500"></i> Arus Kas Bulan Ini</h3>';
        html += '  <div class="space-y-3 text-sm">';
        html += '    <div class="flex justify-between"><span class="text-slate-500">Kas Masuk (Cash)</span><span class="font-semibold text-emerald-500">' + Utils.formatRupiah(cashMasuk) + '</span></div>';
        html += '    <div class="flex justify-between"><span class="text-slate-500">Kas Masuk (Transfer)</span><span class="font-semibold text-emerald-500">' + Utils.formatRupiah(transferMasuk) + '</span></div>';
        html += '    <div class="flex justify-between"><span class="text-slate-500">Kas Masuk (QRIS)</span><span class="font-semibold text-emerald-500">' + Utils.formatRupiah(qrisMasuk) + '</span></div>';
        if (totalPemasukanLain > 0) {
            html += '    <div class="flex justify-between"><span class="text-slate-500">Pemasukan Lain (Retur Tukar Barang, dll)</span><span class="font-semibold text-emerald-500">' + Utils.formatRupiah(totalPemasukanLain) + '</span></div>';
        }
        html += '    <div class="flex justify-between border-t border-slate-100 pt-2"><span class="font-semibold text-slate-600 dark:text-slate-300">Total Kas Masuk</span><span class="font-bold text-emerald-600">' + Utils.formatRupiah(cashMasuk + transferMasuk + qrisMasuk + totalPemasukanLain) + '</span></div>';
        html += '    <div class="flex justify-between mt-4"><span class="text-slate-500">Beli Obat Tunai</span><span class="text-red-500">' + Utils.formatRupiah(totalBeliTunai) + '</span></div>';
        html += '    <div class="flex justify-between"><span class="text-slate-500">Pengeluaran Operasional</span><span class="text-red-500">' + Utils.formatRupiah(totalOperasional) + '</span></div>';
        html += '    <div class="flex justify-between"><span class="text-slate-500">Pembayaran Payroll (Gaji+Tunjangan)</span><span class="text-red-500">' + Utils.formatRupiah(totalBebanPayroll) + '</span></div>';
        html += '    <div class="flex justify-between border-t-2 border-slate-200 pt-3 mt-2"><span class="font-bold text-gray-800 dark:text-white">TOTAL KAS KELUAR</span><span class="font-bold text-lg text-red-600">' + Utils.formatRupiah(totalKasKeluar) + '</span></div>';
        html += '  </div>';
        html += '</div>';
        html += '</div>';

        // Kartu 3: Hutang & Piutang Info
        html += '<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5 flex items-center gap-4 mb-6">';
        html += '  <i data-lucide="alert-circle" class="w-8 h-8 text-amber-500 flex-shrink-0"></i>';
        html += '  <div class="text-sm text-amber-700 dark:text-amber-400">';
        html += '    <p class="font-semibold">Total Pembelian Kredit Bulan Ini: ' + Utils.formatRupiah(totalBeliKredit) + '</p>';
        html += '    <p class="text-xs mt-1">*Pembelian kredit tidak mempengaruhi Arus Kas bulan ini, tapi akan mempengaruhi saat faktur dilunasi di modul Hutang Usaha.</p>';
        html += '  </div>';
        html += '</div>';

        // Tabel Rincian Transaksi
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">';
        html += '  <div class="p-4 border-b border-slate-200 dark:border-slate-700"><h3 class="font-semibold text-gray-800 dark:text-white">Rincian Transaksi Penjualan</h3></div>';
        html += '  <div class="overflow-x-auto max-h-96 overflow-y-auto">';
        html += '    <table class="w-full text-sm">';
        html += '      <thead class="bg-slate-50 dark:bg-slate-900 sticky top-0"><tr class="text-xs text-slate-500 uppercase">';
        html += '        <th class="px-4 py-3 text-left">Tanggal</th><th class="px-4 py-3 text-left">Pasien</th><th class="px-4 py-3 text-left">Tipe</th><th class="px-4 py-3 text-left">Bayar</th><th class="px-4 py-3 text-right">Total</th>';
        html += '      </tr></thead><tbody>';
        
        if (this.dataTransaksi.length === 0) {
            html += '<tr><td colspan="5" class="text-center py-6 text-slate-400">Tidak ada transaksi bulan ini.</td></tr>';
        } else {
            this.dataTransaksi.forEach(function(t) {
                html += '<tr class="border-t border-slate-100 dark:border-slate-700">';
                html += '<td class="px-4 py-3 text-xs text-slate-500">' + (t.tanggal || '-') + '</td>';
                html += '<td class="px-4 py-3 font-medium text-gray-800 dark:text-white">' + Utils.escapeHtml(t.namaPasien || 'Bebas') + '</td>';
                html += '<td class="px-4 py-3 text-xs"><span class="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">' + Utils.escapeHtml(t.tipe || '-') + '</span></td>';
                html += '<td class="px-4 py-3 text-xs uppercase">' + Utils.escapeHtml(t.metodeBayar || '-') + '</td>';
                html += '<td class="px-4 py-3 text-right font-semibold text-gray-800 dark:text-white">' + Utils.formatRupiah(t.totalAkhir) + '</td>';
                html += '</tr>';
            });
        }
        html += '      </tbody></table>';
        html += '  </div>';
        html += '</div>';

        container.innerHTML = html;
        lucide.createIcons();
    },

    // FITUR BARU: export laporan lengkap ke Excel (multi-sheet: Ringkasan, Rincian Transaksi, Rincian Pengeluaran)
    exportExcel: function() {
        if (!this.summary) { Utils.toast('Tampilkan laporan dahulu sebelum export.', 'error'); return; }
        var s = this.summary;
        var bulan = document.getElementById('filter-bulan').value;

        var wb = XLSX.utils.book_new();

        var ringkasan = [
            ['LAPORAN KEUANGAN - Aulia Apotek Klinik'], ['Periode: ' + bulan], [],
            ['RINGKASAN LABA/RUGI', ''],
            ['Omzet Penjualan', s.totalOmzet],
            ['Modal Obat (HPP)', -s.totalHPP],
            ['Tindakan & Jasa', s.totalTindakan + s.totalJasaResep],
            ['Racik & Lainnya', s.totalRacik],
            ['Laba Kotor', s.totalLabaKotor],
            ['Gaji Pokok Karyawan', -s.totalGajiPokok],
            ['Tunjangan & Jasa Pembagian Hasil', -s.totalTunjanganJasa],
            ['Pemasukan Lain (Retur Tukar Barang, dll)', s.totalPemasukanLain || 0],
            ['Biaya Operasional Lain', -s.totalOperasional],
            ['LABA BERSIH', s.labaBersih], [],
            ['ARUS KAS', ''],
            ['Kas Masuk (Cash)', s.cashMasuk],
            ['Kas Masuk (Transfer)', s.transferMasuk],
            ['Kas Masuk (QRIS)', s.qrisMasuk],
            ['Pemasukan Lain (Retur Tukar Barang, dll)', s.totalPemasukanLain || 0],
            ['Total Kas Masuk', s.cashMasuk + s.transferMasuk + s.qrisMasuk + (s.totalPemasukanLain || 0)],
            ['Beli Obat Tunai', -s.totalBeliTunai],
            ['Pengeluaran Operasional', -s.totalOperasional],
            ['Pembayaran Payroll', -s.totalBebanPayroll],
            ['Total Kas Keluar', -s.totalKasKeluar], [],
            ['Pembelian Kredit (belum lunas)', s.totalBeliKredit], [],
            ['RASIO', ''],
            ['Margin Laba Kotor', s.marginLabaKotor.toFixed(1) + '%'],
            ['Margin Laba Bersih', s.marginLabaBersih.toFixed(1) + '%'],
            ['Pertumbuhan Omzet vs Bulan Lalu', s.pertumbuhanOmzet === null ? 'N/A' : s.pertumbuhanOmzet.toFixed(1) + '%']
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ringkasan), 'Ringkasan');

        var trxRows = [['Tanggal', 'Pasien', 'Tipe', 'Metode Bayar', 'Total']];
        this.dataTransaksi.forEach(function(t) {
            trxRows.push([t.tanggal || '-', t.namaPasien || 'Bebas', t.tipe || '-', t.metodeBayar || '-', t.totalAkhir || 0]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trxRows), 'Rincian Transaksi');

        var keluarRows = [['Tanggal', 'Keterangan', 'Kategori', 'Jumlah']];
        this.dataPengeluaran.forEach(function(p) {
            keluarRows.push([p.tanggal || '-', p.keterangan || '-', p.kategori || '-', p.jumlah || 0]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(keluarRows), 'Rincian Pengeluaran');

        if (this.dataPemasukanLain && this.dataPemasukanLain.length > 0) {
            var masukRows = [['Tanggal', 'Keterangan', 'Kategori', 'Jumlah']];
            this.dataPemasukanLain.forEach(function(m) {
                masukRows.push([m.tanggal || '-', m.keterangan || '-', m.kategori || '-', m.jumlah || 0]);
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(masukRows), 'Rincian Pemasukan Lain');
        }

        XLSX.writeFile(wb, 'Laporan_Keuangan_' + bulan + '.xlsx');
        Utils.toast('Laporan berhasil diexport ke Excel!', 'success');
    }
};