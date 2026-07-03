/**
 * js/keuangan/payroll.js
 * Proses Payroll (Gaji & Pembagian Hasil) Bulanan
 * Logic akurat: Pecahan Jasa Resep, Tuslah, Omzet, Uang Makan, Transport, Racik.
 */

window.AppKeuanganPayroll = {
    dataKaryawan: [],
    dataTransaksi: [],
    dataAbsensi: [],
    configGaji: null,
    configPembagian: null,
    kalkulasiGaji: [],
    dataTHR: {}, // FITUR BARU: saldo tabungan THR { karyawanId: { saldo, updatedAt } }
    psaReal: null, // FITUR BARU: ringkasan sisa PSA riil bulan berjalan

    render: function() {
        var d = new Date();
        var defaultMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

        var html = '<div class="page-enter max-w-7xl">'; // Diperlebar biar muat semua kolom
        html += '  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">';
        html += '    <div>';
        html += '      <h2 class="text-xl font-bold text-gray-800 dark:text-white">Payroll Karyawan</h2>';
        html += '      <p class="text-sm text-slate-500 dark:text-slate-400">Hitung gaji & pembagian hasil bulanan (Otomatis)</p>';
        html += '    </div>';
        html += '    <div class="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1">';
        html += '      <input type="month" id="filter-bulan-payroll" value="' + defaultMonth + '" class="px-3 py-1.5 bg-transparent dark:text-white text-sm rounded-md outline-none">';
        html += '      <button onclick="AppKeuanganPayroll.init()" class="bg-primary-600 text-white text-sm px-4 py-1.5 rounded-md font-medium">Hitung</button>';
        html += '    </div>';
        html += '  </div>';
        
        html += '  <div id="payroll-content"><div class="flex justify-center py-20"><div class="spinner"></div></div></div>';
        html += '</div>';
        return html;
    },

    init: function() {
        var self = this;
        var role = window.currentRole || 'apotek';

        // FIX (permintaan user): Admin sekarang punya akses CRUD penuh ke modul Keuangan juga.
        if (role !== 'keuangan' && role !== 'admin') {
            document.getElementById('payroll-content').innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-lg text-center font-semibold">Akses Ditolak. Halaman ini khusus Keuangan/Admin.</div>';
            return;
        }

        var monthInput = document.getElementById('filter-bulan-payroll');
        if (!monthInput) return;
        var bulan = monthInput.value;
        var startDate = bulan + '-01';
        var endDate = bulan + '-31';

        var pKary = db.collection('karyawan').where('status', '==', 'aktif').get();
        var pTrx = db.collection('transaksi').where('tanggal', '>=', startDate).where('tanggal', '<=', endDate).get();
        var pAbsen = db.collection('absensi').where('tanggal', '>=', startDate).where('tanggal', '<=', endDate).get();
        var pCfgGaji = db.collection('pengaturanGaji').doc('global').get();
        var pCfgBagi = db.collection('pengaturanPembagian').doc('global').get();
        var pTHR = db.collection('thrTabungan').get(); // FITUR BARU: saldo tabungan THR per karyawan

        Promise.all([pKary, pTrx, pAbsen, pCfgGaji, pCfgBagi, pTHR]).then(function(results) {
            self.dataKaryawan = [];
            results[0].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataKaryawan.push(d); });

            self.dataTransaksi = [];
            results[1].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataTransaksi.push(d); });

            self.dataAbsensi = [];
            results[2].forEach(function(doc) { self.dataAbsensi.push(doc.data()); });

            self.configGaji = results[3].exists ? results[3].data() : { apotek: [], klinik: [] };
            self.configPembagian = results[4].exists ? results[4].data() : {};

            // FITUR BARU: peta saldo THR tersimpan { karyawanId: { saldo, updatedAt } }
            self.dataTHR = {};
            results[5].forEach(function(doc) { self.dataTHR[doc.id] = doc.data(); });

            self.hitungPayroll();
        }).catch(function(err) {
            Utils.toast('Gagal memuat data payroll: ' + err.message, 'error');
            console.error(err);
        });
    },

        hitungPayroll: function() {
        try {
            this._hitungPayrollInner();
        } catch (err) {
            // FIX: sebelumnya error di sini (mis. field lama yang undefined) membuat seluruh
            // tabel payroll gagal render tanpa pesan jelas — Pool Klinik/Apotek & Tuslah
            // terlihat "tidak terhitung" padahal sebenarnya proses berhenti karena exception.
            console.error(err);
            Utils.toast('Gagal menghitung payroll: ' + err.message, 'error');
            var container = document.getElementById('payroll-content');
            if (container) {
                container.innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-lg text-center font-semibold">Gagal menghitung payroll: ' + Utils.escapeHtml(err.message) + '</div>';
            }
        }
    },

    // FIX: helper agar section tindakanKlinik/tindakanApotek bisa dibaca baik dalam bentuk
    // lama (array persen langsung) maupun bentuk baru { persenTHR, slot } tanpa error.
    _slotArr: function(section) {
        if (!section) return [];
        if (Array.isArray(section)) return section;
        return Array.isArray(section.slot) ? section.slot : [];
    },
    _persenTHR: function(section) {
        if (!section || Array.isArray(section)) return 0;
        return section.persenTHR || 0;
    },

    _hitungPayrollInner: function() {
        var self = this;
        this.kalkulasiGaji = [];

        // 1. KALKULASI GLOBAL BULAN INI
        var rekapDokter = {}; 
        var totalLabaObat = 0; 
        var totalPembulatan = 0; 
        var totalTuslahKlinik = 0;
        var totalTuslahApotek = 0;
        var totalNilaiRacik = 0; 

        var cfg = this.configPembagian;
        var nilaiRacikConfig = (cfg && cfg.racikObat) ? (cfg.racikObat.nilai || 0) : 0;

        this.dataTransaksi.forEach(function(t) {
            // Hitung Laba Obat & Pembulatan
            var omzetObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * i.hargaJual); }, 0) : 0;
            var hppObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * (i.hargaBeli || 0)); }, 0) : 0;
            totalLabaObat += (omzetObat - hppObat);
            totalPembulatan += (t.pembulatan || 0);

            // Hitung Racik
            if (t.racikanItems && t.racikanItems.length > 0) {
                totalNilaiRacik += (t.racikanItems.length * nilaiRacikConfig);
            }

            // Rekap Jasa Resep Dokter (Klinik & Luar)
            if (t.tipe === 'resep_klinik' && t.dokterId) {
                if (!rekapDokter[t.dokterId]) rekapDokter[t.dokterId] = { jmlResepKlinik: 0, jasaResepLuar: 0 };
                rekapDokter[t.dokterId].jmlResepKlinik += 1;
            } else if (t.tipe === 'resep_luar' && t.dokterId) {
                if (!rekapDokter[t.dokterId]) rekapDokter[t.dokterId] = { jmlResepKlinik: 0, jasaResepLuar: 0 };
                rekapDokter[t.dokterId].jasaResepLuar += (t.jasaResep || 0);
            }

            // Hitung Tuslah (FIX: Dari Laba / Harga Jual - Modal)
            if (t.tindakanItems && t.tindakanItems.length > 0) {
                t.tindakanItems.forEach(function(tin) {
                    var labaTindakan = (tin.hargaJual || 0) - (tin.modal || 0);
                    if (tin.kategori === 'klinik') totalTuslahKlinik += labaTindakan;
                    else if (tin.kategori === 'apotek') totalTuslahApotek += labaTindakan;
                });
            }
        });

        // 1b. FITUR BARU: SISA PEMBAGIAN PSA RIIL BULAN INI
        //     (dihitung dari data transaksi ASLI bulan berjalan, bukan cuma persentase pengaturan)
        var sumPersenSlots = function(slots) {
            var t = 0;
            (slots || []).forEach(function(s) { t += (s.persen || 0); });
            return t;
        };
        var jmlResepLuar = 0;
        this.dataTransaksi.forEach(function(t) { if (t.tipe === 'resep_luar') jmlResepLuar++; });

        var psaResepKlinik = 0;
        if (cfg.resepKlinik && Array.isArray(cfg.resepKlinik)) {
            cfg.resepKlinik.forEach(function(dc) {
                var rekap = rekapDokter[dc.dokterId];
                var jml = rekap ? rekap.jmlResepKlinik : 0;
                var sisaPerResep = (dc.nilaiResep || 0) - (dc.jm || 0) - (dc.jd || 0) - (dc.poolKaryKlinik || 0) - (dc.poolKaryApotek || 0);
                psaResepKlinik += sisaPerResep * jml;
            });
        }
        var sisaResepLuarPerUnit = cfg.resepLuar ? ((cfg.resepLuar.nilaiResep || 0) - (cfg.resepLuar.potonganDokter || 0)) : 0;
        var psaResepLuar = sisaResepLuarPerUnit * jmlResepLuar;

        var psaTindakanKlinik = totalTuslahKlinik * (100 - sumPersenSlots(self._slotArr(cfg.tindakanKlinik))) / 100;
        var psaTindakanApotek = totalTuslahApotek * (100 - sumPersenSlots(self._slotArr(cfg.tindakanApotek))) / 100;

        var poolOmzetTotal = cfg.tunjanganOmzet ? (totalLabaObat * (cfg.tunjanganOmzet.persen || 0)) / 100 : 0;
        var psaOmzet = poolOmzetTotal * (100 - sumPersenSlots(cfg.tunjanganOmzet && cfg.tunjanganOmzet.slot)) / 100;

        var psaUM = totalPembulatan * (100 - sumPersenSlots(cfg.uangMakan && cfg.uangMakan.slot)) / 100;
        var psaRacik = totalNilaiRacik * (100 - sumPersenSlots(cfg.racikObat && cfg.racikObat.slot)) / 100;

        this.psaReal = {
            resepKlinik: psaResepKlinik, resepLuar: psaResepLuar,
            tindakanKlinik: psaTindakanKlinik, tindakanApotek: psaTindakanApotek,
            omzet: psaOmzet, uangMakan: psaUM, racikObat: psaRacik,
            total: psaResepKlinik + psaResepLuar + psaTindakanKlinik + psaTindakanApotek + psaOmzet + psaUM + psaRacik
        };

        // 2. PROSES PER KARYAWAN
        this.dataKaryawan.forEach(function(k) {
            var depKey = (k.departemen || '').toLowerCase();
            
            // Gaji Pokok
            var gajiPokok = 0;
            var cfgGajiDep = self.configGaji[depKey] || [];
            var gajiCfg = cfgGajiDep.find(function(g) { return g.karyawanId === k.id; });
            if (gajiCfg) gajiPokok = gajiCfg.gajiPokok || 0;

            // Hari Kerja
            var hadir = self.dataAbsensi.filter(function(a) { return a.userId === k.userId || a.namaKaryawan === k.nama; }).length;

            // Jasa Medis (JM) & Jasa Dokter (JD) - Hanya untuk Dokter Klinik
            var jasaMedis = 0, jasaDokter = 0, jasaResepLuar = 0;
            if (rekapDokter[k.id]) {
                jasaResepLuar = rekapDokter[k.id].jasaResepLuar || 0; // Dapat utuh dari resep luar
                // FIX: guard supaya tidak crash bila cfg.resepKlinik belum di-set.
                if (cfg.resepKlinik && Array.isArray(cfg.resepKlinik)) {
                    var docConfig = cfg.resepKlinik.find(function(dc) { return dc.dokterId === k.id; });
                    if (docConfig && rekapDokter[k.id].jmlResepKlinik > 0) {
                        jasaMedis = (docConfig.jm || 0) * rekapDokter[k.id].jmlResepKlinik;
                        jasaDokter = (docConfig.jd || 0) * rekapDokter[k.id].jmlResepKlinik;
                    }
                }
            }

            // Bagian Pool Resep (Klinik & Apotek)
            // FITUR BARU: jika slot ditandai "Tab THR" di Pengaturan Pembagian, nilainya TIDAK dibayar tunai
            // bulan ini, melainkan masuk ke tabungan THR karyawan (thrPoolKlinik / thrPoolApotek).
            // FITUR BARU (skema THR baru): setiap pool sekarang bisa punya "Persen THR" sendiri.
            // Hasil THR = Pool x Persen THR. Karyawan yang mencentang "Tab THR" mendapat tabungan
            // = persen bagiannya x Hasil THR TERSEBUT (bukan menukar bagian tunainya).
            // Bagian tunai tetap dibayar dari sisa pool setelah Hasil THR disisihkan.
            var bagPoolKlinik = 0, bagPoolApotek = 0, thrPoolKlinik = 0, thrPoolApotek = 0;
            if (cfg.resepKlinik) {
                cfg.resepKlinik.forEach(function(dc) {
                    var rekap = rekapDokter[dc.dokterId];
                    if (rekap && rekap.jmlResepKlinik > 0) {
                        // FIX: guard array kosong agar tidak crash (.find of undefined) pada data lama.
                        var slotKlinik = (dc.slotKaryKlinik || []).find(function(s) { return s.karyawanId === k.id; });
                        if (slotKlinik) {
                            var totalPoolK = (dc.poolKaryKlinik || 0) * rekap.jmlResepKlinik;
                            var hasilThrK = totalPoolK * ((dc.thrPersenKlinik || 0) / 100);
                            var sisaCashK = totalPoolK - hasilThrK;
                            bagPoolKlinik += sisaCashK * (slotKlinik.persen / 100);
                            if (slotKlinik.isTHR) thrPoolKlinik += hasilThrK * (slotKlinik.persen / 100);
                        }

                        var slotApotek = (dc.slotKaryApotek || []).find(function(s) { return s.karyawanId === k.id; });
                        if (slotApotek) {
                            var totalPoolA = (dc.poolKaryApotek || 0) * rekap.jmlResepKlinik;
                            var hasilThrA = totalPoolA * ((dc.thrPersenApotek || 0) / 100);
                            var sisaCashA = totalPoolA - hasilThrA;
                            bagPoolApotek += sisaCashA * (slotApotek.persen / 100);
                            if (slotApotek.isTHR) thrPoolApotek += hasilThrA * (slotApotek.persen / 100);
                        }
                    }
                });
            }

            // Bagian Tuslah/Tindakan (FIX: Sudah menggunakan Laba Tindakan)
            // FITUR BARU: sama seperti pool resep di atas — Persen THR menyisihkan sebagian pool
            // tuslah sebagai Hasil THR, dan hanya karyawan yang mencentang "Tab THR" yang menabung.
            var bagTuslah = 0, thrTuslah = 0;
            var depTindakanKey = (depKey === 'klinik') ? 'tindakanKlinik' : 'tindakanApotek';
            var slotsTindakan = self._slotArr(cfg[depTindakanKey]);
            var persenThrTindakan = self._persenTHR(cfg[depTindakanKey]);
            var mySlotTindakan = slotsTindakan.find(function(s) { return s.karyawanId === k.id; });
            if (mySlotTindakan && mySlotTindakan.persen > 0) {
                var totalTuslahDep = (depKey === 'klinik') ? totalTuslahKlinik : totalTuslahApotek;
                var hasilThrTuslah = totalTuslahDep * (persenThrTindakan / 100);
                var sisaCashTuslah = totalTuslahDep - hasilThrTuslah;
                bagTuslah = (sisaCashTuslah * mySlotTindakan.persen) / 100;
                if (mySlotTindakan.isTHR) thrTuslah = (hasilThrTuslah * mySlotTindakan.persen) / 100;
            }

            // Tunjangan Omzet
            var bagOmzet = 0;
            if (cfg.tunjanganOmzet && cfg.tunjanganOmzet.persen > 0) {
                var poolOmzet = (totalLabaObat * cfg.tunjanganOmzet.persen) / 100;
                var mySlotOmzet = self._slotArr(cfg.tunjanganOmzet).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotOmzet) bagOmzet = (poolOmzet * mySlotOmzet.persen) / 100;
            }

            // Uang Makan
            var bagUM = 0;
            if (cfg.uangMakan) {
                var mySlotUM = self._slotArr(cfg.uangMakan).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotUM) bagUM = (totalPembulatan * mySlotUM.persen) / 100;
            }

            // Transport
            var bagTransport = 0;
            if (cfg.transport) {
                var mySlotTr = self._slotArr(cfg.transport).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotTr) bagTransport = ((cfg.transport.total || 0) * mySlotTr.persen) / 100;
            }

            // Racik Obat
            var bagRacik = 0;
            if (cfg.racikObat) {
                var mySlotRacik = self._slotArr(cfg.racikObat).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotRacik) bagRacik = (totalNilaiRacik * mySlotRacik.persen) / 100;
            }

            // Total pendapatan TUNAI bulan ini (porsi THR TIDAK ikut dibayar tunai, lihat di atas)
            var totalPendapatan = gajiPokok + jasaMedis + jasaDokter + jasaResepLuar + bagPoolKlinik + bagPoolApotek + bagTuslah + bagOmzet + bagUM + bagTransport + bagRacik;

            // FITUR BARU: akumulasi tabungan THR
            var thrBulanIni = thrPoolKlinik + thrPoolApotek + thrTuslah;
            var thrTersimpan = self.dataTHR[k.id] || {};
            var thrSaldoSebelum = thrTersimpan.saldo || 0;
            var thrSudahDibayarkan = false; // status pembayaran THR bulan ini (di-set via tombol "Bayarkan THR")

            self.kalkulasiGaji.push({
                karyawanId: k.id, nama: k.nama, departemen: k.departemen, jabatan: k.jabatan,
                hariKerja: hadir, gajiPokok: gajiPokok, 
                jasaMedis: jasaMedis, jasaDokter: jasaDokter, jasaResepLuar: jasaResepLuar,
                bagPoolKlinik: bagPoolKlinik, bagPoolApotek: bagPoolApotek, bagTuslah: bagTuslah,
                bagOmzet: bagOmzet, bagUM: bagUM, bagTransport: bagTransport, bagRacik: bagRacik,
                thrBulanIni: thrBulanIni, thrSaldoSebelum: thrSaldoSebelum,
                thrSaldoProyeksi: thrSaldoSebelum + thrBulanIni, thrSudahDibayarkan: thrSudahDibayarkan,
                tunjanganLain: 0, potKasbon: 0, potWisata: 0,
                totalPendapatan: totalPendapatan, totalGaji: totalPendapatan
            });
        });

        self.renderTable();
    },
    
    renderTable: function() {
        var container = document.getElementById('payroll-content');
        var html = '';

        // FITUR BARU: Kartu Ringkasan Sisa Pembagian PSA Riil (dihitung dari data transaksi bulan berjalan)
        var psa = this.psaReal || {};
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-4">';
        html += '  <h3 class="font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2"><i data-lucide="landmark" class="w-5 h-5 text-slate-500"></i> Sisa Pembagian PSA Riil Bulan Ini</h3>';
        html += '  <p class="text-xs text-slate-400 mb-4">Dihitung otomatis dari data transaksi & pengaturan pembagian aktif, bukan sekadar persentase.</p>';
        html += '  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">';
        html += '    <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"><span class="text-xs text-blue-600">Resep Klinik</span><p class="font-bold text-blue-800 dark:text-blue-300">' + Utils.formatRupiah(psa.resepKlinik) + '</p></div>';
        html += '    <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg"><span class="text-xs text-green-600">Resep Luar</span><p class="font-bold text-green-800 dark:text-green-300">' + Utils.formatRupiah(psa.resepLuar) + '</p></div>';
        html += '    <div class="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg"><span class="text-xs text-purple-600">Tindakan Klinik</span><p class="font-bold text-purple-800 dark:text-purple-300">' + Utils.formatRupiah(psa.tindakanKlinik) + '</p></div>';
        html += '    <div class="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg"><span class="text-xs text-teal-600">Tindakan Apotek</span><p class="font-bold text-teal-800 dark:text-teal-300">' + Utils.formatRupiah(psa.tindakanApotek) + '</p></div>';
        html += '    <div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"><span class="text-xs text-emerald-600">Tunjangan Omzet</span><p class="font-bold text-emerald-800 dark:text-emerald-300">' + Utils.formatRupiah(psa.omzet) + '</p></div>';
        html += '    <div class="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg"><span class="text-xs text-orange-600">Uang Makan</span><p class="font-bold text-orange-800 dark:text-orange-300">' + Utils.formatRupiah(psa.uangMakan) + '</p></div>';
        html += '    <div class="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg"><span class="text-xs text-indigo-600">Racik Obat</span><p class="font-bold text-indigo-800 dark:text-indigo-300">' + Utils.formatRupiah(psa.racikObat) + '</p></div>';
        html += '    <div class="p-3 bg-slate-800 dark:bg-slate-900 rounded-lg"><span class="text-xs text-slate-300">TOTAL PSA</span><p class="font-bold text-white">' + Utils.formatRupiah(psa.total) + '</p></div>';
        html += '  </div>';
        html += '</div>';

        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">';
        html += '<div class="overflow-x-auto">';
        html += '<table class="w-full text-xs whitespace-nowrap">';
        html += '<thead><tr class="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase">';
        html += '<th class="px-3 py-3 text-left sticky left-0 z-10 bg-slate-50 dark:bg-slate-900">Karyawan</th>';
        html += '<th class="px-2 py-3 text-center">Hadir</th>';
        html += '<th class="px-2 py-3 text-right">Gaji Pokok</th>';
        html += '<th class="px-2 py-3 text-right">JM</th>';
        html += '<th class="px-2 py-3 text-right">JD</th>';
        html += '<th class="px-2 py-3 text-right">Pool Klinik</th>';
        html += '<th class="px-2 py-3 text-right">Pool Apotek</th>';
        html += '<th class="px-2 py-3 text-right">Tuslah</th>';
        html += '<th class="px-2 py-3 text-right">Omzet</th>';
        html += '<th class="px-2 py-3 text-right">Uang Makan</th>';
        html += '<th class="px-2 py-3 text-right">Transport</th>';
        html += '<th class="px-2 py-3 text-right">Racik</th>';
        html += '<th class="px-2 py-3 text-right bg-amber-50 dark:bg-amber-900/20 text-amber-600">Sisa THR</th>';
        html += '<th class="px-2 py-3 text-center bg-amber-50 dark:bg-amber-900/20 text-amber-600">Bayar THR</th>';
        html += '<th class="px-2 py-3 text-right">Tunjangan Lain</th>';
        html += '<th class="px-2 py-3 text-right">Pot. Kasbon</th>';
        html += '<th class="px-2 py-3 text-right">Pot. Wisata</th>';
        html += '<th class="px-3 py-3 text-right text-emerald-600">Total Gaji</th>';
        html += '<th class="px-2 py-3 text-center">Aksi</th>';
        html += '</tr></thead><tbody>';

        if (this.kalkulasiGaji.length === 0) {
            html += '<tr><td colspan="19" class="text-center py-6 text-slate-400">Tidak ada karyawan aktif.</td></tr>';
        } else {
            this.kalkulasiGaji.forEach(function(k, idx) {
                html += '<tr class="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">';
                html += '<td class="px-3 py-2 sticky left-0 z-10 bg-white dark:bg-slate-800"><p class="font-medium text-gray-800 dark:text-white">' + Utils.escapeHtml(k.nama) + '</p><p class="text-[10px] text-slate-400">' + Utils.escapeHtml(k.departemen || '-') + '</p></td>';
                html += '<td class="px-2 py-2 text-center">' + k.hariKerja + ' H</td>';
                html += '<td class="px-2 py-2 text-right text-slate-600 dark:text-slate-300">' + Utils.formatRupiah(k.gajiPokok) + '</td>';
                html += '<td class="px-2 py-2 text-right text-blue-600">' + Utils.formatRupiah(k.jasaMedis) + '</td>';
                html += '<td class="px-2 py-2 text-right text-blue-600">' + Utils.formatRupiah(k.jasaDokter) + '</td>';
                html += '<td class="px-2 py-2 text-right text-purple-600">' + Utils.formatRupiah(k.bagPoolKlinik) + '</td>';
                html += '<td class="px-2 py-2 text-right text-teal-600">' + Utils.formatRupiah(k.bagPoolApotek) + '</td>';
                html += '<td class="px-2 py-2 text-right text-purple-600">' + Utils.formatRupiah(k.bagTuslah) + '</td>';
                html += '<td class="px-2 py-2 text-right text-emerald-600">' + Utils.formatRupiah(k.bagOmzet) + '</td>';
                html += '<td class="px-2 py-2 text-right text-orange-600">' + Utils.formatRupiah(k.bagUM) + '</td>';
                html += '<td class="px-2 py-2 text-right text-sky-600">' + Utils.formatRupiah(k.bagTransport) + '</td>';
                html += '<td class="px-2 py-2 text-right text-indigo-600">' + Utils.formatRupiah(k.bagRacik) + '</td>';

                // FITUR BARU: Kolom Tabungan THR — saldo proyeksi (saldo lama + akumulasi bulan ini) + tombol bayar/reset
                html += '<td class="px-2 py-2 text-right bg-amber-50/50 dark:bg-amber-900/10">';
                html += '<span class="font-semibold text-amber-700 dark:text-amber-400">' + Utils.formatRupiah(k.thrSaldoProyeksi) + '</span>';
                if (k.thrBulanIni > 0) html += '<p class="text-[10px] text-amber-500">+' + Utils.formatRupiah(k.thrBulanIni) + ' bln ini</p>';
                html += '</td>';
                html += '<td class="px-2 py-2 text-center bg-amber-50/50 dark:bg-amber-900/10">';
                if (k.thrSaldoProyeksi > 0) {
                    html += '<button onclick="AppKeuanganPayroll.bayarTHR(' + idx + ')" class="text-[10px] bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded font-semibold">Bayarkan &amp; Reset</button>';
                } else {
                    html += '<span class="text-[10px] text-slate-300">-</span>';
                }
                html += '</td>';

                // Manual Inputs
                html += '<td class="px-1 py-1 text-right"><input type="number" id="tunjangan-' + idx + '" value="0" oninput="AppKeuanganPayroll.updateTotal(' + idx + ')" class="w-20 px-1 py-1 border border-slate-300 dark:bg-slate-700 dark:text-white rounded text-xs text-right"></td>';
                html += '<td class="px-1 py-1 text-right"><input type="number" id="kasbon-' + idx + '" value="0" oninput="AppKeuanganPayroll.updateTotal(' + idx + ')" class="w-20 px-1 py-1 border border-red-300 dark:bg-slate-700 dark:text-white rounded text-xs text-right"></td>';
                html += '<td class="px-1 py-1 text-right"><input type="number" id="wisata-' + idx + '" value="0" oninput="AppKeuanganPayroll.updateTotal(' + idx + ')" class="w-20 px-1 py-1 border border-red-300 dark:bg-slate-700 dark:text-white rounded text-xs text-right"></td>';
                
                html += '<td class="px-3 py-2 text-right font-bold text-emerald-600" id="total-' + idx + '">' + Utils.formatRupiah(k.totalGaji) + '</td>';
                html += '<td class="px-2 py-2 text-center"><button onclick="AppKeuanganPayroll.cetakSlip(' + idx + ')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded">Cetak</button></td>';
                html += '</tr>';
            });
        }

        html += '</tbody></table></div></div>';

        html += '<div class="flex justify-end mt-4">';
        html += '<button onclick="AppKeuanganPayroll.simpanPayroll()" class="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i> Simpan & Kunci Payroll Bulan Ini</button>';
        html += '</div>';

        container.innerHTML = html;
        lucide.createIcons();
    },

    updateTotal: function(idx) {
        var tunjangan = parseFloat(document.getElementById('tunjangan-' + idx).value) || 0;
        var kasbon = parseFloat(document.getElementById('kasbon-' + idx).value) || 0;
        var wisata = parseFloat(document.getElementById('wisata-' + idx).value) || 0;
        
        var k = this.kalkulasiGaji[idx];
        k.tunjanganLain = tunjangan;
        k.potKasbon = kasbon;
        k.potWisata = wisata;
        
        var totalAkhir = (k.totalPendapatan + tunjangan) - (kasbon + wisata);
        document.getElementById('total-' + idx).textContent = Utils.formatRupiah(totalAkhir);
        k.totalGaji = totalAkhir;
    },

    cetakSlip: function(idx) {
        var k = this.kalkulasiGaji[idx];
        var bulan = document.getElementById('filter-bulan-payroll').value;
        var w = window.open('', '', 'width=400,height=600');

        var html = '<html><head><title>Slip Gaji ' + k.nama + '</title>';
        html += '<style>body{font-family:monospace;font-size:12px;width:80mm;margin:0;padding:10px;color:#000;} h2,p{text-align:center;margin:0;} table{width:100%;} .right{text-align:right;} .bold{font-weight:bold;} hr{border-top:1px dashed #000;margin:8px 0;}</style></head><body>';
        
        html += '<h2 class="bold">SLIP GAJI KARYAWAN</h2>';
        html += '<p>Aulia Apotek Klinik</p><hr>';
        html += '<table>';
        html += '<tr><td>Periode</td><td>: ' + bulan + '</td></tr>';
        html += '<tr><td>Nama</td><td>: ' + k.nama + '</td></tr>';
        html += '<tr><td>Jabatan</td><td>: ' + k.jabatan + '</td></tr>';
        html += '<tr><td>Hadir</td><td>: ' + k.hariKerja + ' Hari</td></tr>';
        html += '</table><hr>';
        
        html += '<table>';
        html += '<tr><td colspan="2" class="bold">PENDAPATAN:</td></tr>';
        html += '<tr><td>Gaji Pokok</td><td class="right">' + Utils.formatRupiah(k.gajiPokok) + '</td></tr>';
        if(k.jasaMedis > 0) html += '<tr><td>Jasa Medis (JM)</td><td class="right">' + Utils.formatRupiah(k.jasaMedis) + '</td></tr>';
        if(k.jasaDokter > 0) html += '<tr><td>Jasa Dokter (JD)</td><td class="right">' + Utils.formatRupiah(k.jasaDokter) + '</td></tr>';
        if(k.bagPoolKlinik > 0) html += '<tr><td>Pool Resep Klinik</td><td class="right">' + Utils.formatRupiah(k.bagPoolKlinik) + '</td></tr>';
        if(k.bagPoolApotek > 0) html += '<tr><td>Pool Resep Apotek</td><td class="right">' + Utils.formatRupiah(k.bagPoolApotek) + '</td></tr>';
        if(k.bagTuslah > 0) html += '<tr><td>Tuslah/Tindakan</td><td class="right">' + Utils.formatRupiah(k.bagTuslah) + '</td></tr>';
        if(k.bagOmzet > 0) html += '<tr><td>Tunjangan Omzet</td><td class="right">' + Utils.formatRupiah(k.bagOmzet) + '</td></tr>';
        if(k.bagUM > 0) html += '<tr><td>Uang Makan</td><td class="right">' + Utils.formatRupiah(k.bagUM) + '</td></tr>';
        if(k.bagTransport > 0) html += '<tr><td>Transport</td><td class="right">' + Utils.formatRupiah(k.bagTransport) + '</td></tr>';
        if(k.bagRacik > 0) html += '<tr><td>Racik Obat</td><td class="right">' + Utils.formatRupiah(k.bagRacik) + '</td></tr>';
        if(k.tunjanganLain > 0) html += '<tr><td>Tunjangan Lain</td><td class="right">' + Utils.formatRupiah(k.tunjanganLain) + '</td></tr>';
        html += '</table><hr>';
        
        html += '<table>';
        html += '<tr class="bold"><td>TOTAL PENDAPATAN</td><td class="right">' + Utils.formatRupiah(k.totalPendapatan + k.tunjanganLain) + '</td></tr>';
        html += '</table><hr>';

        if(k.potKasbon > 0 || k.potWisata > 0) {
            html += '<table>';
            html += '<tr><td colspan="2" class="bold">POTONGAN:</td></tr>';
            if(k.potKasbon > 0) html += '<tr><td>Kasbon</td><td class="right">(-) ' + Utils.formatRupiah(k.potKasbon) + '</td></tr>';
            if(k.potWisata > 0) html += '<tr><td>Wisata</td><td class="right">(-) ' + Utils.formatRupiah(k.potWisata) + '</td></tr>';
            html += '</table><hr>';
        }

        html += '<table>';
        html += '<tr class="bold"><td>TOTAL DITERIMA</td><td class="right">' + Utils.formatRupiah(k.totalGaji) + '</td></tr>';
        html += '</table><hr>';
        
        html += '<p>Penerima,</p><br><br><br>';
        html += '<p class="bold">( ' + k.nama + ' )</p>';
        
        html += '<script>window.onload = function() { window.print(); }<\/script>';
        html += '</body></html>';

        w.document.write(html);
        w.document.close();
    },

    simpanPayroll: function() {
        if (!confirm('Kunci & simpan payroll bulan ini? Data tidak bisa diubah setelah dikunci.')) return;

        var bulan = document.getElementById('filter-bulan-payroll').value;
        var self = this;
        // FIX: cek duplikat payroll bulanan terlebih dahulu agar gaji tidak dobel.
        db.collection('payrollHistory').where('bulan', '==', bulan).limit(1).get().then(function(snap) {
            if (!snap.empty) {
                Utils.toast('Payroll bulan ' + bulan + ' sudah pernah disimpan!', 'error');
                return;
            }
            var batch = db.batch();
            self.kalkulasiGaji.forEach(function(k) {
            var ref = db.collection('payrollHistory').doc();
            batch.set(ref, {
                bulan: bulan,
                karyawanId: k.karyawanId,
                namaKaryawan: k.nama,
                departemen: k.departemen,
                hariKerja: k.hariKerja,
                gajiPokok: k.gajiPokok,
                jasaMedis: k.jasaMedis,
                jasaDokter: k.jasaDokter,
                bagPoolKlinik: k.bagPoolKlinik,
                bagPoolApotek: k.bagPoolApotek,
                bagTuslah: k.bagTuslah,
                bagOmzet: k.bagOmzet,
                bagUM: k.bagUM,
                bagTransport: k.bagTransport,
                bagRacik: k.bagRacik,
                thrBulanIni: k.thrBulanIni || 0, // FITUR BARU: catat akumulasi THR bulan ini untuk audit
                tunjanganLain: k.tunjanganLain,
                potKasbon: k.potKasbon,
                potWisata: k.potWisata,
                totalGaji: k.totalGaji,
                status: 'paid',
                diprosesOleh: window.currentUserName || 'Keuangan',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // FITUR BARU: akumulasikan tabungan THR karyawan (jika ada porsi THR bulan ini)
            if (k.thrBulanIni > 0) {
                var thrRef = db.collection('thrTabungan').doc(k.karyawanId);
                batch.set(thrRef, {
                    karyawanId: k.karyawanId,
                    namaKaryawan: k.nama,
                    saldo: firebase.firestore.FieldValue.increment(k.thrBulanIni),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        });

            batch.commit().then(function() {
                Utils.toast('Payroll berhasil disimpan & dikunci! Tabungan THR ikut terupdate.', 'success');
                self.init();
            }).catch(function(err) {
                Utils.toast('Gagal simpan payroll: ' + err.message, 'error');
            });
        }).catch(function(err) {
            Utils.toast('Gagal memeriksa payroll: ' + err.message, 'error');
        });
    },

    // FITUR BARU: Tombol "Bayarkan & Reset" — mencairkan tabungan THR karyawan ke 0
    // dan mencatat riwayat pembayarannya untuk jejak audit.
    bayarTHR: function(idx) {
        var self = this;
        var k = this.kalkulasiGaji[idx];
        if (!k || k.thrSaldoProyeksi <= 0) return;

        var bulan = document.getElementById('filter-bulan-payroll').value;
        if (!confirm('Bayarkan THR ' + k.nama + ' sebesar ' + Utils.formatRupiah(k.thrSaldoProyeksi) + ' dan reset tabungan menjadi Rp 0?')) return;

        Utils.toast('Memproses pembayaran THR...', 'info');
        var batch = db.batch();

        var thrRef = db.collection('thrTabungan').doc(k.karyawanId);
        batch.set(thrRef, {
            karyawanId: k.karyawanId,
            namaKaryawan: k.nama,
            saldo: 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        var historyRef = db.collection('thrPembayaranHistory').doc();
        batch.set(historyRef, {
            karyawanId: k.karyawanId,
            namaKaryawan: k.nama,
            jumlah: k.thrSaldoProyeksi,
            bulanDibayarkan: bulan,
            dibayarkanOleh: window.currentUserName || 'Keuangan',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.commit().then(function() {
            Utils.toast('THR ' + k.nama + ' berhasil dibayarkan & direset.', 'success');
            self.init();
        }).catch(function(err) {
            Utils.toast('Gagal memproses THR: ' + err.message, 'error');
        });
    }
};
