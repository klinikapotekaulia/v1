/**
 * js/keuangan/payroll.js
 * Proses Payroll (Gaji & Pembagian Hasil)
 * Logic akurat: Pecahan Jasa Resep, Tuslah, Omzet, Uang Makan, Transport, Racik.
 *
 * FITUR BARU (skema bayar per karyawan): setiap karyawan sekarang punya periode akumulasi
 * SENDIRI-SENDIRI (payrollPeriode/{karyawanId}), bukan 1 dokumen 'global' untuk semua orang.
 * Ini dibutuhkan karena ada dokter yang dibayar per hari praktek — dia bisa dibayarkan
 * kapan saja lewat tombol "Bayarkan" di barisnya sendiri, TANPA menunggu atau ikut mereset
 * periode karyawan lain. Tombol "Bayarkan Semua" tetap ada untuk membayar seluruh karyawan
 * sekaligus (masing-masing tetap direset sesuai periodenya sendiri-sendiri).
 */

window.AppKeuanganPayroll = {
    dataKaryawan: [],
    dataTransaksi: [],
    dataAbsensi: [],
    configGaji: null,
    configPembagian: null,
    kalkulasiGaji: [],
    dataTHR: {}, // saldo tabungan THR { karyawanId: { saldo, updatedAt } }
    psaReal: null, // ringkasan PSA riil BULAN KALENDER berjalan (informasi saja, lihat _hitungPSAdariRekap)

    // FITUR BARU: periode "belum dibayar" sekarang PER KARYAWAN: { karyawanId: { mulai,
    // terakhirDibayar, terakhirDibayarOleh, terakhirJumlah } }. Diambil dari koleksi
    // payrollPeriode yang doc-id-nya sekarang adalah karyawanId (dulu 1 doc 'global' untuk semua).
    periodeMap: {},
    defaultAwalBulan: null,  // fallback awal periode utk karyawan yang belum pernah dibayar
    periodeSampaiGlobal: null, // hari ini — batas akhir perhitungan, SAMA untuk semua karyawan

    render: function() {
        var html = '<div class="page-enter max-w-7xl">'; // Diperlebar biar muat semua kolom
        html += '  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">';
        html += '    <div>';
        html += '      <h2 class="text-xl font-bold text-gray-800 dark:text-white">Payroll Karyawan</h2>';
        html += '      <p class="text-sm text-slate-500 dark:text-slate-400">Gaji & pembagian hasil dihitung otomatis per karyawan, akumulasi sejak masing-masing terakhir dibayarkan</p>';
        html += '    </div>';
        html += '    <button onclick="AppKeuanganPayroll.init()" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Muat Ulang</button>';
        html += '  </div>';

        html += '  <div id="payroll-content"><div class="flex justify-center py-20"><div class="spinner"></div></div></div>';
        html += '</div>';
        return html;
    },

    init: function() {
        var self = this;
        var role = window.currentRole || 'apotek';

        if (role !== 'keuangan' && role !== 'admin' && role !== 'psa') {
            document.getElementById('payroll-content').innerHTML = '<div class="bg-red-50 text-red-600 p-4 rounded-lg text-center font-semibold">Akses Ditolak. Halaman ini khusus Keuangan/Admin/PSA.</div>';
            return;
        }

        var container = document.getElementById('payroll-content');
        if (container) container.innerHTML = '<div class="flex justify-center py-20"><div class="spinner"></div></div>';

        // FITUR BARU: ambil periode SEMUA karyawan (bukan 1 doc 'global') dulu, supaya kita tahu
        // dari tanggal berapa paling awal kita perlu ambil data transaksi/absensi.
        db.collection('payrollPeriode').get().then(function(periodeSnap) {
            var today = Utils.today(); // FIX: pakai tanggal lokal, bukan UTC
            var defaultAwal = today.slice(0, 7) + '-01'; // fallback: awal bulan berjalan (karyawan yang belum pernah dibayar)
            self.defaultAwalBulan = defaultAwal;
            self.periodeSampaiGlobal = today;

            self.periodeMap = {};
            var earliestMulai = defaultAwal;
            periodeSnap.forEach(function(doc) {
                var d = doc.data();
                var mulai = d.mulai || defaultAwal;
                self.periodeMap[doc.id] = {
                    mulai: mulai,
                    terakhirDibayar: d.terakhirDibayar || null,
                    terakhirDibayarOleh: d.terakhirDibayarOleh || '-',
                    terakhirJumlah: d.terakhirJumlah || 0
                };
                if (mulai < earliestMulai) earliestMulai = mulai;
            });

            // Query transaksi & absensi dari tanggal PALING AWAL di antara seluruh karyawan s/d hari
            // ini (superset) — nanti masing-masing karyawan hanya memakai transaksi sejak periode
            // MULAI miliknya sendiri (lihat _hitungRekapPeriode).
            var pKary = db.collection('karyawan').where('status', '==', 'aktif').get();
            var pTrx = db.collection('transaksi').where('tanggal', '>=', earliestMulai).where('tanggal', '<=', today).get();
            var pAbsen = db.collection('absensi').where('tanggal', '>=', earliestMulai).where('tanggal', '<=', today).get();
            var pCfgGaji = db.collection('pengaturanGaji').doc('global').get();
            var pCfgBagi = db.collection('pengaturanPembagian').doc('global').get();
            var pTHR = db.collection('thrTabungan').get();

            return Promise.all([pKary, pTrx, pAbsen, pCfgGaji, pCfgBagi, pTHR]);
        }).then(function(results) {
            self.dataKaryawan = [];
            results[0].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataKaryawan.push(d); });

            self.dataTransaksi = [];
            results[1].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataTransaksi.push(d); });

            self.dataAbsensi = [];
            results[2].forEach(function(doc) { self.dataAbsensi.push(doc.data()); });

            self.configGaji = results[3].exists ? results[3].data() : { apotek: [], klinik: [] };
            self.configPembagian = results[4].exists ? results[4].data() : {};

            // peta saldo THR tersimpan { karyawanId: { saldo, updatedAt } }
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
    _fmtTgl: function(iso) {
        if (!iso) return '-';
        return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    // FITUR BARU: periode "mulai" milik satu karyawan tertentu (default: awal bulan kalender
    // berjalan kalau karyawan itu belum pernah dibayar / belum punya dokumen payrollPeriode).
    _mulaiKaryawan: function(karyawanId) {
        var p = this.periodeMap[karyawanId];
        return (p && p.mulai) ? p.mulai : this.defaultAwalBulan;
    },

    // FITUR BARU: hitung rekap dokter & total pool HANYA dari transaksi tanggal >= mulaiTgl.
    // Dipakai dua kali: (1) per karyawan dengan periode mulainya masing-masing, dan
    // (2) untuk kartu ringkasan PSA bulan kalender berjalan.
    _hitungRekapPeriode: function(mulaiTgl) {
        var cfg = this.configPembagian || {};
        var nilaiRacikConfig = (cfg.racikObat) ? (cfg.racikObat.nilai || 0) : 0;

        var rekapDokter = {};
        var totalLabaObat = 0, totalPembulatan = 0, totalTuslahKlinik = 0, totalTuslahApotek = 0, totalNilaiRacik = 0, jmlResepLuar = 0;

        this.dataTransaksi.forEach(function(t) {
            if (!t.tanggal || t.tanggal < mulaiTgl) return; // di luar window periode ini

            var omzetObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * i.hargaJual); }, 0) : 0;
            var hppObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * (i.hargaBeli || 0)); }, 0) : 0;
            totalLabaObat += (omzetObat - hppObat);
            totalPembulatan += (t.pembulatan || 0);

            if (t.racikanItems && t.racikanItems.length > 0) {
                totalNilaiRacik += (t.racikanItems.length * nilaiRacikConfig);
            }

            if (t.tipe === 'resep_klinik' && t.dokterId) {
                if (!rekapDokter[t.dokterId]) rekapDokter[t.dokterId] = { jmlResepKlinik: 0, jasaResepLuar: 0 };
                rekapDokter[t.dokterId].jmlResepKlinik += 1;
            } else if (t.tipe === 'resep_luar' && t.dokterId) {
                if (!rekapDokter[t.dokterId]) rekapDokter[t.dokterId] = { jmlResepKlinik: 0, jasaResepLuar: 0 };
                rekapDokter[t.dokterId].jasaResepLuar += (t.jasaResep || 0);
            }
            if (t.tipe === 'resep_luar') jmlResepLuar++;

            if (t.tindakanItems && t.tindakanItems.length > 0) {
                t.tindakanItems.forEach(function(tin) {
                    var labaTindakan = (tin.hargaJual || 0) - (tin.modal || 0);
                    if (tin.kategori === 'klinik') totalTuslahKlinik += labaTindakan;
                    else if (tin.kategori === 'apotek') totalTuslahApotek += labaTindakan;
                });
            }
        });

        return {
            rekapDokter: rekapDokter, totalLabaObat: totalLabaObat, totalPembulatan: totalPembulatan,
            totalTuslahKlinik: totalTuslahKlinik, totalTuslahApotek: totalTuslahApotek,
            totalNilaiRacik: totalNilaiRacik, jmlResepLuar: jmlResepLuar
        };
    },

    // FITUR BARU: turunan rumus PSA (sisa pembagian riil) dari 1 hasil _hitungRekapPeriode.
    _hitungPSAdariRekap: function(rekap, cfg) {
        var self = this;
        var sumPersenSlots = function(slots) {
            var t = 0;
            (slots || []).forEach(function(s) { t += (s.persen || 0); });
            return t;
        };

        var psaResepKlinik = 0;
        if (cfg.resepKlinik && Array.isArray(cfg.resepKlinik)) {
            cfg.resepKlinik.forEach(function(dc) {
                var r = rekap.rekapDokter[dc.dokterId];
                var jml = r ? r.jmlResepKlinik : 0;
                var sisaPerResep = (dc.nilaiResep || 0) - (dc.jm || 0) - (dc.jd || 0) - (dc.poolKaryKlinik || 0) - (dc.poolKaryApotek || 0);
                psaResepKlinik += sisaPerResep * jml;
            });
        }
        var sisaResepLuarPerUnit = cfg.resepLuar ? ((cfg.resepLuar.nilaiResep || 0) - (cfg.resepLuar.potonganDokter || 0)) : 0;
        var psaResepLuar = sisaResepLuarPerUnit * rekap.jmlResepLuar;

        var psaTindakanKlinik = rekap.totalTuslahKlinik * (100 - sumPersenSlots(self._slotArr(cfg.tindakanKlinik))) / 100;
        var psaTindakanApotek = rekap.totalTuslahApotek * (100 - sumPersenSlots(self._slotArr(cfg.tindakanApotek))) / 100;

        var poolOmzetTotal = cfg.tunjanganOmzet ? (rekap.totalLabaObat * (cfg.tunjanganOmzet.persen || 0)) / 100 : 0;
        var psaOmzet = poolOmzetTotal * (100 - sumPersenSlots(cfg.tunjanganOmzet && cfg.tunjanganOmzet.slot)) / 100;

        var psaUM = rekap.totalPembulatan * (100 - sumPersenSlots(cfg.uangMakan && cfg.uangMakan.slot)) / 100;
        var psaRacik = rekap.totalNilaiRacik * (100 - sumPersenSlots(cfg.racikObat && cfg.racikObat.slot)) / 100;

        return {
            resepKlinik: psaResepKlinik, resepLuar: psaResepLuar,
            tindakanKlinik: psaTindakanKlinik, tindakanApotek: psaTindakanApotek,
            omzet: psaOmzet, uangMakan: psaUM, racikObat: psaRacik,
            total: psaResepKlinik + psaResepLuar + psaTindakanKlinik + psaTindakanApotek + psaOmzet + psaUM + psaRacik
        };
    },

    _hitungPayrollInner: function() {
        var self = this;
        this.kalkulasiGaji = [];
        var cfg = this.configPembagian || {};

        // 1. KARTU RINGKASAN PSA — sekarang murni informasi BULAN KALENDER BERJALAN, TIDAK lagi
        //    terikat ke periode pembayaran (karena tiap karyawan sekarang punya periode sendiri-sendiri).
        var rekapBulanIni = this._hitungRekapPeriode(this.defaultAwalBulan);
        this.psaReal = this._hitungPSAdariRekap(rekapBulanIni, cfg);

        // 2. PROSES PER KARYAWAN — masing-masing pakai window akumulasi SENDIRI (sejak terakhir
        //    dia dibayarkan), bukan 1 window global untuk semua orang. Ini yang membuat dokter
        //    yang dibayar per hari praktek bisa dibayarkan sendiri tanpa ikut karyawan lain.
        this.dataKaryawan.forEach(function(k) {
            var mulaiK = self._mulaiKaryawan(k.id);
            var rekap = self._hitungRekapPeriode(mulaiK);
            var rekapDokter = rekap.rekapDokter;
            var depKey = (k.departemen || '').toLowerCase();

            // Gaji Pokok
            var gajiPokok = 0;
            var cfgGajiDep = self.configGaji[depKey] || [];
            var gajiCfg = cfgGajiDep.find(function(g) { return g.karyawanId === k.id; });
            if (gajiCfg) gajiPokok = gajiCfg.gajiPokok || 0;

            // Hari Kerja (hanya dalam window periode karyawan ybs.)
            var hadir = self.dataAbsensi.filter(function(a) {
                return (a.userId === k.userId || a.namaKaryawan === k.nama) && a.tanggal >= mulaiK;
            }).length;

            // Jasa Medis (JM) & Jasa Dokter (JD) - Hanya untuk Dokter Klinik
            var jasaMedis = 0, jasaDokter = 0, jasaResepLuar = 0;
            if (rekapDokter[k.id]) {
                jasaResepLuar = rekapDokter[k.id].jasaResepLuar || 0;
                if (cfg.resepKlinik && Array.isArray(cfg.resepKlinik)) {
                    var docConfig = cfg.resepKlinik.find(function(dc) { return dc.dokterId === k.id; });
                    if (docConfig && rekapDokter[k.id].jmlResepKlinik > 0) {
                        jasaMedis = (docConfig.jm || 0) * rekapDokter[k.id].jmlResepKlinik;
                        jasaDokter = (docConfig.jd || 0) * rekapDokter[k.id].jmlResepKlinik;
                    }
                }
            }

            // Bagian Pool Resep (Klinik & Apotek) — lihat catatan skema THR di versi sebelumnya
            var bagPoolKlinik = 0, bagPoolApotek = 0, thrPoolKlinik = 0, thrPoolApotek = 0;
            if (cfg.resepKlinik) {
                cfg.resepKlinik.forEach(function(dc) {
                    var r = rekapDokter[dc.dokterId];
                    if (r && r.jmlResepKlinik > 0) {
                        var slotKlinik = (dc.slotKaryKlinik || []).find(function(s) { return s.karyawanId === k.id; });
                        if (slotKlinik) {
                            var totalPoolK = (dc.poolKaryKlinik || 0) * r.jmlResepKlinik;
                            var hasilThrK = totalPoolK * ((dc.thrPersenKlinik || 0) / 100);
                            var sisaCashK = totalPoolK - hasilThrK;
                            bagPoolKlinik += sisaCashK * (slotKlinik.persen / 100);
                            if (slotKlinik.isTHR) thrPoolKlinik += hasilThrK * (slotKlinik.persen / 100);
                        }

                        var slotApotek = (dc.slotKaryApotek || []).find(function(s) { return s.karyawanId === k.id; });
                        if (slotApotek) {
                            var totalPoolA = (dc.poolKaryApotek || 0) * r.jmlResepKlinik;
                            var hasilThrA = totalPoolA * ((dc.thrPersenApotek || 0) / 100);
                            var sisaCashA = totalPoolA - hasilThrA;
                            bagPoolApotek += sisaCashA * (slotApotek.persen / 100);
                            if (slotApotek.isTHR) thrPoolApotek += hasilThrA * (slotApotek.persen / 100);
                        }
                    }
                });
            }

            // Bagian Tuslah/Tindakan
            // FIX: sebelumnya HANYA mengecek SATU pool (Klinik ATAU Apotek),
            // dipilih berdasarkan field departemen karyawan itu sendiri
            // (k.departemen). Ini salah: pool mana yang berlaku seharusnya
            // ditentukan oleh DI POOL MANA karyawan tsb DIMASUKKAN sebagai
            // slot di pengaturan Pembagian Hasil (Tindakan Klinik / Tindakan
            // Apotek) — BUKAN dari departemen karyawan itu sendiri. Akibatnya
            // karyawan dengan departemen selain "Klinik" (misalnya "Dokter")
            // yang dimasukkan ke slot "Tindakan Klinik (Tuslah)" TIDAK PERNAH
            // dicek ke situ — kode malah mengecek slot "Tindakan Apotek" (yang
            // tidak diisi untuknya), jadi tuslahnya selalu 0 walau sudah
            // diset persennya di Pembagian Hasil. Sekarang: cek KEDUA pool
            // secara independen, sama seperti pola bagPoolKlinik/bagPoolApotek
            // di atas (yang sudah benar tidak bergantung pada departemen).
            var bagTuslah = 0, thrTuslah = 0;

            var slotsTindakanKlinik     = self._slotArr(cfg.tindakanKlinik);
            var persenThrTindakanKlinik = self._persenTHR(cfg.tindakanKlinik);
            var mySlotTindakanKlinik    = slotsTindakanKlinik.find(function(s) { return s.karyawanId === k.id; });
            if (mySlotTindakanKlinik && mySlotTindakanKlinik.persen > 0) {
                var hasilThrTK = rekap.totalTuslahKlinik * (persenThrTindakanKlinik / 100);
                var sisaCashTK = rekap.totalTuslahKlinik - hasilThrTK;
                bagTuslah += (sisaCashTK * mySlotTindakanKlinik.persen) / 100;
                if (mySlotTindakanKlinik.isTHR) thrTuslah += (hasilThrTK * mySlotTindakanKlinik.persen) / 100;
            }

            var slotsTindakanApotek     = self._slotArr(cfg.tindakanApotek);
            var persenThrTindakanApotek = self._persenTHR(cfg.tindakanApotek);
            var mySlotTindakanApotek    = slotsTindakanApotek.find(function(s) { return s.karyawanId === k.id; });
            if (mySlotTindakanApotek && mySlotTindakanApotek.persen > 0) {
                var hasilThrTA = rekap.totalTuslahApotek * (persenThrTindakanApotek / 100);
                var sisaCashTA = rekap.totalTuslahApotek - hasilThrTA;
                bagTuslah += (sisaCashTA * mySlotTindakanApotek.persen) / 100;
                if (mySlotTindakanApotek.isTHR) thrTuslah += (hasilThrTA * mySlotTindakanApotek.persen) / 100;
            }

            // Tunjangan Omzet
            var bagOmzet = 0;
            if (cfg.tunjanganOmzet && cfg.tunjanganOmzet.persen > 0) {
                var poolOmzet = (rekap.totalLabaObat * cfg.tunjanganOmzet.persen) / 100;
                var mySlotOmzet = self._slotArr(cfg.tunjanganOmzet).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotOmzet) bagOmzet = (poolOmzet * mySlotOmzet.persen) / 100;
            }

            // Uang Makan
            var bagUM = 0;
            if (cfg.uangMakan) {
                var mySlotUM = self._slotArr(cfg.uangMakan).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotUM) bagUM = (rekap.totalPembulatan * mySlotUM.persen) / 100;
            }

            // Transport (nilai tetap dari pengaturan, tidak berbasis akumulasi transaksi)
            var bagTransport = 0;
            if (cfg.transport) {
                var mySlotTr = self._slotArr(cfg.transport).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotTr) bagTransport = ((cfg.transport.total || 0) * mySlotTr.persen) / 100;
            }

            // Racik Obat
            var bagRacik = 0;
            if (cfg.racikObat) {
                var mySlotRacik = self._slotArr(cfg.racikObat).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotRacik) bagRacik = (rekap.totalNilaiRacik * mySlotRacik.persen) / 100;
            }

            // Total pendapatan TUNAI dalam window periode karyawan ini (porsi THR tidak ikut tunai)
            var totalPendapatan = gajiPokok + jasaMedis + jasaDokter + jasaResepLuar + bagPoolKlinik + bagPoolApotek + bagTuslah + bagOmzet + bagUM + bagTransport + bagRacik;

            var thrBulanIni = thrPoolKlinik + thrPoolApotek + thrTuslah;
            var thrTersimpan = self.dataTHR[k.id] || {};
            var thrSaldoSebelum = thrTersimpan.saldo || 0;

            self.kalkulasiGaji.push({
                karyawanId: k.id, nama: k.nama, departemen: k.departemen, jabatan: k.jabatan,
                // FITUR BARU: periode akumulasi MILIK KARYAWAN INI SENDIRI, dipakai saat cetak slip
                // & saat tombol "Bayarkan" di barisnya ditekan.
                periodeMulai: mulaiK, periodeSampai: self.periodeSampaiGlobal,
                hariKerja: hadir, gajiPokok: gajiPokok,
                jasaMedis: jasaMedis, jasaDokter: jasaDokter, jasaResepLuar: jasaResepLuar,
                bagPoolKlinik: bagPoolKlinik, bagPoolApotek: bagPoolApotek, bagTuslah: bagTuslah,
                bagOmzet: bagOmzet, bagUM: bagUM, bagTransport: bagTransport, bagRacik: bagRacik,
                thrBulanIni: thrBulanIni, thrSaldoSebelum: thrSaldoSebelum,
                thrSaldoProyeksi: thrSaldoSebelum + thrBulanIni, thrSudahDibayarkan: false,
                tunjanganLain: 0, potKasbon: 0, potWisata: 0,
                totalPendapatan: totalPendapatan, totalGaji: totalPendapatan
            });
        });

        self.renderTable();
    },

    renderTable: function() {
        var container = document.getElementById('payroll-content');
        var html = '';

        // FITUR BARU: banner sekarang menjelaskan bahwa periode berjalan sendiri-sendiri per karyawan
        // (lihat kolom "Periode" di tiap baris), bukan 1 periode bersama seperti sebelumnya.
        html += '<div class="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-4 mb-4">';
        html += '  <p class="text-sm font-semibold text-primary-800 dark:text-primary-300">Periode akumulasi berjalan sendiri-sendiri per karyawan</p>';
        html += '  <p class="text-xs text-primary-600 dark:text-primary-400">Tiap karyawan dihitung sejak dia SENDIRI terakhir dibayarkan (lihat kolom Periode). Cocok untuk dokter yang dibayar per hari praktek — tekan "Bayarkan" di barisnya kapan saja tanpa memengaruhi karyawan lain, atau pakai "Bayarkan Semua" di bawah untuk membayar seluruhnya sekaligus.</p>';
        html += '</div>';

        // Kartu Ringkasan Sisa Pembagian PSA Riil — sekarang murni info BULAN KALENDER BERJALAN
        var psa = this.psaReal || {};
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-4">';
        html += '  <h3 class="font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2"><i data-lucide="landmark" class="w-5 h-5 text-slate-500"></i> Sisa Pembagian PSA Riil (Bulan Kalender Berjalan)</h3>';
        html += '  <p class="text-xs text-slate-400 mb-4">Angka informasi bulan berjalan saja — TIDAK terikat ke periode pembayaran masing-masing karyawan di tabel bawah.</p>';
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
        html += '<th class="px-2 py-3 text-left">Periode</th>';
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
            html += '<tr><td colspan="20" class="text-center py-6 text-slate-400">Tidak ada karyawan aktif.</td></tr>';
        } else {
            this.kalkulasiGaji.forEach(function(k, idx) {
                html += '<tr class="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">';
                html += '<td class="px-3 py-2 sticky left-0 z-10 bg-white dark:bg-slate-800"><p class="font-medium text-gray-800 dark:text-white">' + Utils.escapeHtml(k.nama) + '</p><p class="text-[10px] text-slate-400">' + Utils.escapeHtml(k.departemen || '-') + '</p></td>';
                html += '<td class="px-2 py-2 text-left text-slate-500 dark:text-slate-400"><span class="text-[10px]">sejak</span><br>' + AppKeuanganPayroll._fmtTgl(k.periodeMulai) + '</td>';
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

                html += '<td class="px-2 py-2 text-right bg-amber-50/50 dark:bg-amber-900/10">';
                html += '<span class="font-semibold text-amber-700 dark:text-amber-400">' + Utils.formatRupiah(k.thrSaldoProyeksi) + '</span>';
                if (k.thrBulanIni > 0) html += '<p class="text-[10px] text-amber-500">+' + Utils.formatRupiah(k.thrBulanIni) + ' periode ini</p>';
                html += '</td>';
                html += '<td class="px-2 py-2 text-center bg-amber-50/50 dark:bg-amber-900/10">';
                if (k.thrSaldoProyeksi > 0) {
                    html += '<button onclick="AppKeuanganPayroll.bayarTHR(' + idx + ')" class="text-[10px] bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded font-semibold">Bayarkan &amp; Reset</button>';
                } else {
                    html += '<span class="text-[10px] text-slate-300">-</span>';
                }
                html += '</td>';

                // Manual Inputs
                html += '<td class="px-1 py-1 text-right"><input type="number" id="tunjangan-' + idx + '" value="0" min="0" oninput="AppKeuanganPayroll.updateTotal(' + idx + ')" class="w-20 px-1 py-1 border border-slate-300 dark:bg-slate-700 dark:text-white rounded text-xs text-right"></td>';
                html += '<td class="px-1 py-1 text-right"><input type="number" id="kasbon-' + idx + '" value="0" min="0" oninput="AppKeuanganPayroll.updateTotal(' + idx + ')" class="w-20 px-1 py-1 border border-red-300 dark:bg-slate-700 dark:text-white rounded text-xs text-right"></td>';
                html += '<td class="px-1 py-1 text-right"><input type="number" id="wisata-' + idx + '" value="0" min="0" oninput="AppKeuanganPayroll.updateTotal(' + idx + ')" class="w-20 px-1 py-1 border border-red-300 dark:bg-slate-700 dark:text-white rounded text-xs text-right"></td>';

                html += '<td class="px-3 py-2 text-right font-bold text-emerald-600" id="total-' + idx + '">' + Utils.formatRupiah(k.totalGaji) + '</td>';
                html += '<td class="px-2 py-2 text-center">';
                html += '<div class="flex flex-col gap-1 items-stretch">';
                html += '<button onclick="AppKeuanganPayroll.cetakSlip(' + idx + ')" class="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded">Cetak</button>';
                // FITUR BARU: tombol "Bayarkan" PER KARYAWAN — hanya membayar & mereset periode
                // karyawan ini sendiri, karyawan lain tidak terpengaruh sama sekali.
                if (k.totalGaji > 0) {
                    html += '<button onclick="AppKeuanganPayroll.bayarkanSatuKaryawan(' + idx + ')" class="text-[10px] bg-primary-600 hover:bg-primary-700 text-white px-2 py-1 rounded font-semibold">Bayarkan</button>';
                } else {
                    html += '<span class="text-[10px] text-slate-300">Belum ada</span>';
                }
                html += '</div>';
                html += '</td>';
                html += '</tr>';
            });
        }

        html += '</tbody></table></div></div>';

        var totalSemua = this.kalkulasiGaji.reduce(function(sum, k) { return sum + (k.totalGaji || 0); }, 0);
        html += '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 mt-4">';
        html += '  <p class="text-sm text-slate-500 dark:text-slate-400 sm:mr-auto">Total akan dibayarkan (semua karyawan): <span class="font-bold text-emerald-600">' + Utils.formatRupiah(totalSemua) + '</span></p>';
        html += '  <button onclick="AppKeuanganPayroll.bayarkanPayroll()" class="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm flex items-center gap-2"><i data-lucide="banknote" class="w-4 h-4"></i> Bayarkan Semua</button>';
        html += '</div>';

        container.innerHTML = html;
        lucide.createIcons();
    },

    updateTotal: function(idx) {
        var tunjanganEl = document.getElementById('tunjangan-' + idx);
        var kasbonEl = document.getElementById('kasbon-' + idx);
        var wisataEl = document.getElementById('wisata-' + idx);
        if (parseFloat(tunjanganEl.value) < 0) tunjanganEl.value = 0;
        if (parseFloat(kasbonEl.value) < 0) kasbonEl.value = 0;
        if (parseFloat(wisataEl.value) < 0) wisataEl.value = 0;
        var tunjangan = parseFloat(tunjanganEl.value) || 0;
        var kasbon = parseFloat(kasbonEl.value) || 0;
        var wisata = parseFloat(wisataEl.value) || 0;

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
        var bulan = this._fmtTgl(k.periodeMulai) + ' - ' + this._fmtTgl(k.periodeSampai);
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

    // FITUR BARU: "Bayarkan" PER KARYAWAN — membayar pendapatan SATU karyawan (baris tabel) yang
    // sudah terakumulasi sejak dia sendiri terakhir dibayarkan, lalu mereset HANYA periode
    // karyawan ini (payrollPeriode/{karyawanId}). Karyawan lain sama sekali tidak terpengaruh —
    // inilah yang memungkinkan dokter dibayar per hari praktek tanpa menunggu jadwal bulanan.
    bayarkanSatuKaryawan: function(idx) {
        var self = this;
        var k = this.kalkulasiGaji[idx];
        if (!k) return;

        this._isPayingSatu = this._isPayingSatu || {};
        if (this._isPayingSatu[k.karyawanId]) return; // cegah klik dobel

        if (!k.totalGaji || k.totalGaji <= 0) {
            Utils.toast('Tidak ada pendapatan untuk dibayarkan pada periode ini.', 'info');
            return;
        }
        if (!confirm('Bayarkan pendapatan ' + k.nama + ' periode ' + this._fmtTgl(k.periodeMulai) + ' s/d ' + this._fmtTgl(k.periodeSampai) + ' senilai ' + Utils.formatRupiah(k.totalGaji) + '?\n\nSetelah dibayarkan, akumulasi ' + k.nama + ' akan direset ke Rp 0. Karyawan lain TIDAK terpengaruh.')) return;

        this._isPayingSatu[k.karyawanId] = true;
        Utils.toast('Memproses pembayaran ' + k.nama + '...', 'info');

        var todayStr = this.periodeSampaiGlobal;
        var bulanBayar = todayStr.slice(0, 7);
        var besok = new Date(todayStr + 'T00:00:00');
        besok.setDate(besok.getDate() + 1);
        // FIX: sebelumnya toISOString() (UTC) membuat besokStr malah SAMA dengan
        // todayStr (mundur 1 hari) karena tengah malam WIB = jam 17:00 UTC hari
        // sebelumnya. Utils.dateStr() ambil dari komponen tanggal lokal Date object.
        var besokStr = Utils.dateStr(besok);

        var batch = db.batch();

        var histRef = db.collection('payrollHistory').doc();
        batch.set(histRef, {
            bulan: bulanBayar,
            periodeMulai: k.periodeMulai, periodeSampai: k.periodeSampai,
            karyawanId: k.karyawanId, namaKaryawan: k.nama, departemen: k.departemen,
            hariKerja: k.hariKerja, gajiPokok: k.gajiPokok,
            jasaMedis: k.jasaMedis, jasaDokter: k.jasaDokter,
            bagPoolKlinik: k.bagPoolKlinik, bagPoolApotek: k.bagPoolApotek, bagTuslah: k.bagTuslah,
            bagOmzet: k.bagOmzet, bagUM: k.bagUM, bagTransport: k.bagTransport, bagRacik: k.bagRacik,
            thrBulanIni: k.thrBulanIni || 0,
            tunjanganLain: k.tunjanganLain, potKasbon: k.potKasbon, potWisata: k.potWisata,
            totalGaji: k.totalGaji, status: 'paid',
            diprosesOleh: window.currentUserName || 'Keuangan',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (k.thrBulanIni > 0) {
            var thrRef = db.collection('thrTabungan').doc(k.karyawanId);
            batch.set(thrRef, {
                karyawanId: k.karyawanId, namaKaryawan: k.nama,
                saldo: firebase.firestore.FieldValue.increment(k.thrBulanIni),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        var periodeRef = db.collection('payrollPeriode').doc(k.karyawanId);
        batch.set(periodeRef, {
            mulai: besokStr,
            terakhirDibayar: firebase.firestore.FieldValue.serverTimestamp(),
            terakhirDibayarOleh: window.currentUserName || 'Keuangan',
            terakhirJumlah: k.totalGaji,
            terakhirPeriodeMulai: k.periodeMulai,
            terakhirPeriodeSampai: k.periodeSampai
        }, { merge: true });

        batch.commit().then(function() {
            Utils.toast('Gaji ' + k.nama + ' berhasil dibayarkan! ' + Utils.formatRupiah(k.totalGaji) + ' tercatat sebagai beban gaji karyawan.', 'success');
            AuditLog.catat({
                aksi: 'bayar', modul: 'Payroll', koleksi: 'payrollHistory', targetId: k.karyawanId,
                deskripsi: 'Bayarkan payroll individual: ' + k.nama + ' periode ' + k.periodeMulai + ' s/d ' + k.periodeSampai,
                nominal: k.totalGaji
            });
            self._isPayingSatu[k.karyawanId] = false;
            self.init();
        }).catch(function(err) {
            self._isPayingSatu[k.karyawanId] = false;
            Utils.toast('Gagal membayarkan gaji ' + k.nama + ': ' + err.message, 'error');
        });
    },

    // "Bayarkan Semua" — membayar SELURUH karyawan sekaligus. Setiap karyawan tetap direset
    // sesuai periodenya SENDIRI-SENDIRI (payrollPeriode/{karyawanId}), bukan 1 dokumen global lagi.
    bayarkanPayroll: function() {
        var self = this;
        if (this._isPaying) return; // cegah klik dobel sebelum batch.commit() sebelumnya selesai
        var totalPayroll = this.kalkulasiGaji.reduce(function(sum, k) { return sum + (k.totalGaji || 0); }, 0);

        if (totalPayroll <= 0) {
            Utils.toast('Tidak ada pendapatan untuk dibayarkan pada periode ini.', 'info');
            return;
        }
        if (!confirm('Bayarkan seluruh pendapatan SEMUA karyawan (' + this.kalkulasiGaji.length + ' orang) senilai ' + Utils.formatRupiah(totalPayroll) + '?\n\nMasing-masing karyawan punya periode akumulasi sendiri-sendiri; setelah dibayarkan, periode masing-masing akan direset ke Rp 0 dan tercatat sebagai beban gaji karyawan.')) return;

        this._isPaying = true;
        Utils.toast('Memproses pembayaran payroll semua karyawan...', 'info');

        var todayStr = this.periodeSampaiGlobal;
        var bulanBayar = todayStr.slice(0, 7);
        var besok = new Date(todayStr + 'T00:00:00');
        besok.setDate(besok.getDate() + 1);
        // FIX: sebelumnya toISOString() (UTC) membuat besokStr malah SAMA dengan
        // todayStr (mundur 1 hari) karena tengah malam WIB = jam 17:00 UTC hari
        // sebelumnya. Utils.dateStr() ambil dari komponen tanggal lokal Date object.
        var besokStr = Utils.dateStr(besok);

        var batch = db.batch();
        this.kalkulasiGaji.forEach(function(k) {
            var ref = db.collection('payrollHistory').doc();
            batch.set(ref, {
                bulan: bulanBayar,
                periodeMulai: k.periodeMulai, periodeSampai: k.periodeSampai,
                karyawanId: k.karyawanId, namaKaryawan: k.nama, departemen: k.departemen,
                hariKerja: k.hariKerja, gajiPokok: k.gajiPokok,
                jasaMedis: k.jasaMedis, jasaDokter: k.jasaDokter,
                bagPoolKlinik: k.bagPoolKlinik, bagPoolApotek: k.bagPoolApotek, bagTuslah: k.bagTuslah,
                bagOmzet: k.bagOmzet, bagUM: k.bagUM, bagTransport: k.bagTransport, bagRacik: k.bagRacik,
                thrBulanIni: k.thrBulanIni || 0,
                tunjanganLain: k.tunjanganLain, potKasbon: k.potKasbon, potWisata: k.potWisata,
                totalGaji: k.totalGaji, status: 'paid',
                diprosesOleh: window.currentUserName || 'Keuangan',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (k.thrBulanIni > 0) {
                var thrRef = db.collection('thrTabungan').doc(k.karyawanId);
                batch.set(thrRef, {
                    karyawanId: k.karyawanId, namaKaryawan: k.nama,
                    saldo: firebase.firestore.FieldValue.increment(k.thrBulanIni),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            // FITUR BARU: reset periode PER KARYAWAN, bukan 1 dokumen 'global' lagi.
            var periodeRef = db.collection('payrollPeriode').doc(k.karyawanId);
            batch.set(periodeRef, {
                mulai: besokStr,
                terakhirDibayar: firebase.firestore.FieldValue.serverTimestamp(),
                terakhirDibayarOleh: window.currentUserName || 'Keuangan',
                terakhirJumlah: k.totalGaji,
                terakhirPeriodeMulai: k.periodeMulai,
                terakhirPeriodeSampai: k.periodeSampai
            }, { merge: true });
        });

        batch.commit().then(function() {
            Utils.toast('Payroll semua karyawan berhasil dibayarkan! Total ' + Utils.formatRupiah(totalPayroll) + ' tercatat sebagai beban gaji karyawan.', 'success');
            AuditLog.catat({
                aksi: 'bayar', modul: 'Payroll', koleksi: 'payrollHistory', targetId: bulanBayar,
                deskripsi: 'Bayarkan payroll (semua) untuk ' + self.kalkulasiGaji.length + ' karyawan',
                nominal: totalPayroll
            });
            self._isPaying = false;
            self.init();
        }).catch(function(err) {
            self._isPaying = false;
            Utils.toast('Gagal membayarkan payroll: ' + err.message, 'error');
        });
    },

    // Tombol "Bayarkan & Reset" THR — mencairkan tabungan THR karyawan ke 0
    // dan mencatat riwayat pembayarannya untuk jejak audit.
    bayarTHR: function(idx) {
        var self = this;
        var k = this.kalkulasiGaji[idx];
        if (!k || k.thrSaldoProyeksi <= 0) return;

        var bulan = (this.periodeSampaiGlobal || Utils.today()).slice(0, 7); // FIX: pakai tanggal lokal, bukan UTC
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
            AuditLog.catat({
                aksi: 'bayar', modul: 'Payroll - THR', koleksi: 'thrPembayaranHistory', targetId: k.karyawanId,
                deskripsi: 'Bayar THR: ' + k.nama, nominal: k.thrSaldoProyeksi
            });
            self.init();
        }).catch(function(err) {
            Utils.toast('Gagal memproses THR: ' + err.message, 'error');
        });
    }
};
