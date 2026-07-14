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

    // FITUR BARU (Laporan Bayangan): dipakai utk hitung Payroll Real-Time & Hutang Jatuh Tempo
    dataKaryawan: [],
    configGaji: null,
    configPembagian: null,
    dataHutangBelumLunas: [],
    endDate: null,

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
        this.bulanDipilih = bulan; // dipakai lagi di renderReport() utk Proyeksi & Tren Harian
        var startDate = bulan + '-01';
        var endDate = bulan + '-31';
        this.endDate = endDate; // dipakai lagi di renderReport() utk filter Hutang Jatuh Tempo

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

        // FITUR BARU (Laporan Bayangan): data tambahan utk hitung Payroll REAL-TIME (akrual, pakai
        // formula sama seperti js/keuangan/payroll.js tapi jendelanya dipatok ke bulan kalender
        // berjalan, BUKAN "sejak terakhir dibayar") + daftar hutang usaha yg masih berjalan (utk
        // difilter jatuh tempo <= akhir bulan ini).
        var pKaryawan = db.collection('karyawan').where('status', '==', 'aktif').get();
        var pCfgGaji = db.collection('pengaturanGaji').doc('global').get();
        var pCfgBagi = db.collection('pengaturanPembagian').doc('global').get();
        var pHutang = db.collection('pembelian').where('statusPelunasan', '!=', 'lunas').get();

        Promise.all([pTrx, pKeluar, pBeli, pPayroll, pTrxPrev, pMasuk, pKaryawan, pCfgGaji, pCfgBagi, pHutang]).then(function(results) {
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

            // FITUR BARU (Laporan Bayangan)
            self.dataKaryawan = [];
            results[6].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataKaryawan.push(d); });
            self.configGaji = results[7].exists ? results[7].data() : { apotek: [], klinik: [] };
            self.configPembagian = results[8].exists ? results[8].data() : {};
            self.dataHutangBelumLunas = [];
            results[9].forEach(function(doc) { var d = doc.data(); d.id = doc.id; self.dataHutangBelumLunas.push(d); });

            self.renderReport();
        }).catch(function(err) {
            Utils.toast('Gagal memuat laporan: ' + err.message, 'error');
            console.error(err);
        });
    },

    // ================================================================
    // LAPORAN BAYANGAN (Real-Time) — helper functions
    // ================================================================
    // CATATAN PENTING: rumus di bawah ini SENGAJA meniru persis
    // js/keuangan/payroll.js (_hitungRekapPeriode, _hitungPayrollInner,
    // _slotArr, _persenTHR) supaya angka "Payroll Real-Time" di sini
    // konsisten dengan Payroll module. Kalau formula pembagian hasil di
    // payroll.js diubah, bagian ini JUGA HARUS diupdate biar tetap sinkron.
    //
    // Bedanya dengan payroll.js: di sana jendela akumulasi tiap karyawan
    // dimulai dari "terakhir dia dibayarkan" (bisa lintas bulan). Di sini
    // jendelanya dipatok SAMA UNTUK SEMUA KARYAWAN = tanggal 1 s/d akhir
    // bulan yang dipilih di Laporan Keuangan (pakai this.dataTransaksi yg
    // sudah difilter ke bulan itu), karena tujuannya murni melihat beban
    // bulan berjalan, bukan menghitung nominal yang harus dibayarkan.
    // Format tanggal singkat "31 Jul 2026" utk label di kartu Laporan Bayangan.
    _fmtTglSingkat: function(iso) {
        if (!iso) return '-';
        // endDate disimpan sbg 'YYYY-MM-31' (lihat init()) yang bisa saja tanggal tidak valid
        // utk bulan ybs (mis. Februari) — Date akan otomatis "meluber" ke bulan berikutnya,
        // jadi dipotong dulu ke tanggal akhir bulan yg valid.
        var parts = iso.split('-');
        var d = new Date(parseInt(parts[0]), parseInt(parts[1]), 0); // hari terakhir bulan tsb
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    _slotArr: function(section) {
        if (!section) return [];
        if (Array.isArray(section)) return section;
        return Array.isArray(section.slot) ? section.slot : [];
    },
    _persenTHR: function(section) {
        if (!section || Array.isArray(section)) return 0;
        return section.persenTHR || 0;
    },

    _hitungRekapBulanIniUntukPayroll: function() {
        var cfg = this.configPembagian || {};
        var nilaiRacikConfig = (cfg.racikObat) ? (cfg.racikObat.nilai || 0) : 0;

        var rekapDokter = {};
        var totalLabaObat = 0, totalPembulatan = 0, totalTuslahKlinik = 0, totalTuslahApotek = 0, totalNilaiRacik = 0, jmlResepLuar = 0;

        // this.dataTransaksi sudah difilter ke bulan berjalan (lihat init()), jadi tidak perlu
        // filter tanggal lagi di sini seperti di payroll.js punya (yang jendelanya per-karyawan).
        this.dataTransaksi.forEach(function(t) {
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

    // Total beban payroll REAL-TIME (akrual) seluruh karyawan aktif, bulan kalender berjalan
    // s/d hari ini, TERLEPAS dari sudah/belum ditekan tombol "Bayarkan" di modul Payroll.
    // THR sengaja TIDAK diikutkan (sama seperti totalGaji di payroll.js), supaya apple-to-apple
    // dengan "Beban Payroll" versi kas (payrollHistory) di laporan resmi di atas.
    _hitungPayrollRealtime: function() {
        var self = this;
        var cfg = this.configPembagian || {};
        var rekap = this._hitungRekapBulanIniUntukPayroll();
        var rekapDokter = rekap.rekapDokter;
        var totalGajiPokok = 0, totalTunjanganJasa = 0;

        (this.dataKaryawan || []).forEach(function(k) {
            var depKey = (k.departemen || '').toLowerCase();
            var cfgGajiDep = (self.configGaji && self.configGaji[depKey]) || [];
            var gajiCfg = cfgGajiDep.find(function(g) { return g.karyawanId === k.id; });
            var gajiPokok = gajiCfg ? (gajiCfg.gajiPokok || 0) : 0;

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

            var bagPoolKlinik = 0, bagPoolApotek = 0;
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
                        }
                        var slotApotek = (dc.slotKaryApotek || []).find(function(s) { return s.karyawanId === k.id; });
                        if (slotApotek) {
                            var totalPoolA = (dc.poolKaryApotek || 0) * r.jmlResepKlinik;
                            var hasilThrA = totalPoolA * ((dc.thrPersenApotek || 0) / 100);
                            var sisaCashA = totalPoolA - hasilThrA;
                            bagPoolApotek += sisaCashA * (slotApotek.persen / 100);
                        }
                    }
                });
            }

            var bagTuslah = 0;
            var slotsTindakanKlinik = self._slotArr(cfg.tindakanKlinik);
            var persenThrTindakanKlinik = self._persenTHR(cfg.tindakanKlinik);
            var mySlotTindakanKlinik = slotsTindakanKlinik.find(function(s) { return s.karyawanId === k.id; });
            if (mySlotTindakanKlinik && mySlotTindakanKlinik.persen > 0) {
                var hasilThrTK = rekap.totalTuslahKlinik * (persenThrTindakanKlinik / 100);
                var sisaCashTK = rekap.totalTuslahKlinik - hasilThrTK;
                bagTuslah += (sisaCashTK * mySlotTindakanKlinik.persen) / 100;
            }
            var slotsTindakanApotek = self._slotArr(cfg.tindakanApotek);
            var persenThrTindakanApotek = self._persenTHR(cfg.tindakanApotek);
            var mySlotTindakanApotek = slotsTindakanApotek.find(function(s) { return s.karyawanId === k.id; });
            if (mySlotTindakanApotek && mySlotTindakanApotek.persen > 0) {
                var hasilThrTA = rekap.totalTuslahApotek * (persenThrTindakanApotek / 100);
                var sisaCashTA = rekap.totalTuslahApotek - hasilThrTA;
                bagTuslah += (sisaCashTA * mySlotTindakanApotek.persen) / 100;
            }

            var bagOmzet = 0;
            if (cfg.tunjanganOmzet && cfg.tunjanganOmzet.persen > 0) {
                var poolOmzet = (rekap.totalLabaObat * cfg.tunjanganOmzet.persen) / 100;
                var mySlotOmzet = self._slotArr(cfg.tunjanganOmzet).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotOmzet) bagOmzet = (poolOmzet * mySlotOmzet.persen) / 100;
            }

            var bagUM = 0;
            if (cfg.uangMakan) {
                var mySlotUM = self._slotArr(cfg.uangMakan).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotUM) bagUM = (rekap.totalPembulatan * mySlotUM.persen) / 100;
            }

            var bagTransport = 0;
            if (cfg.transport) {
                var mySlotTr = self._slotArr(cfg.transport).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotTr) bagTransport = ((cfg.transport.total || 0) * mySlotTr.persen) / 100;
            }

            var bagRacik = 0;
            if (cfg.racikObat) {
                var mySlotRacik = self._slotArr(cfg.racikObat).find(function(s) { return s.karyawanId === k.id; });
                if (mySlotRacik) bagRacik = (rekap.totalNilaiRacik * mySlotRacik.persen) / 100;
            }

            totalGajiPokok += gajiPokok;
            totalTunjanganJasa += jasaMedis + jasaDokter + jasaResepLuar + bagPoolKlinik + bagPoolApotek + bagTuslah + bagOmzet + bagUM + bagTransport + bagRacik;
        });

        return { totalGajiPokok: totalGajiPokok, totalTunjanganJasa: totalTunjanganJasa, total: totalGajiPokok + totalTunjanganJasa };
    },

    // Hitung total hari dalam bulan yg dipilih & berapa hari yg "berjalan" (utk run-rate proyeksi):
    // - Bulan berjalan (sama dgn bulan kalender hari ini)  -> hariBerjalan = tanggal hari ini
    // - Bulan yg sudah lewat (sudah selesai)                -> hariBerjalan = hariDalamBulan (penuh, proyeksi = aktual)
    // - Bulan yg belum terjadi (dipilih maju ke depan)      -> hariBerjalan = 0 (proyeksi disembunyikan)
    _rekapHariBulanIni: function() {
        var parts = (this.bulanDipilih || '').split('-');
        var tahunSel = parseInt(parts[0]), bulanSel = parseInt(parts[1]);
        var hariDalamBulan = new Date(tahunSel, bulanSel, 0).getDate();

        var todayObj = new Date();
        var todayBulanStr = todayObj.getFullYear() + '-' + String(todayObj.getMonth() + 1).padStart(2, '0');

        var hariBerjalan;
        if (this.bulanDipilih === todayBulanStr) {
            hariBerjalan = todayObj.getDate();
        } else if (this.bulanDipilih < todayBulanStr) {
            hariBerjalan = hariDalamBulan;
        } else {
            hariBerjalan = 0;
        }
        return { hariDalamBulan: hariDalamBulan, hariBerjalan: hariBerjalan };
    },

    // Rangkai series kumulatif "Laba Bersih Bayangan" per hari (hari 1 s/d hariBerjalan), utk mini
    // grafik tren. Laba Kotor & Pemasukan Lain dihitung PRESIS dari transaksi/kasMasuk per tanggal;
    // beban akrual (payroll realtime + operasional + hutang jatuh tempo) diinterpolasi linear (lihat
    // catatan di renderReport()). Juga mendeteksi hari pertama nilai kumulatif >= 0 ("hari breakeven").
    _hitungTrenHarian: function(hariBerjalan, totalBebanAkrualFinal, totalPemasukanLainFinal) {
        if (!hariBerjalan || hariBerjalan <= 0) return { series: [], hariBreakeven: null };

        var bebanPerHari = totalBebanAkrualFinal / hariBerjalan;

        // Pre-hitung laba kotor & pemasukan lain PER HARI (bukan kumulatif dulu)
        var labaKotorPerHari = {};
        this.dataTransaksi.forEach(function(t) {
            if (!t.tanggal) return;
            var tgl = parseInt(t.tanggal.split('-')[2], 10);
            var omzetObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * i.hargaJual); }, 0) : 0;
            var hppObat = t.items ? t.items.reduce(function(s, i) { return s + (i.jumlah * (i.hargaBeli || 0)); }, 0) : 0;
            var laba = (omzetObat - hppObat) + (t.totalRacik || 0) + (t.totalTindakan || 0) + (t.jasaResep || 0);
            labaKotorPerHari[tgl] = (labaKotorPerHari[tgl] || 0) + laba;
        });
        var pemasukanLainPerHari = {};
        this.dataPemasukanLain.forEach(function(m) {
            if (!m.tanggal) return;
            var tgl = parseInt(m.tanggal.split('-')[2], 10);
            pemasukanLainPerHari[tgl] = (pemasukanLainPerHari[tgl] || 0) + (m.jumlah || 0);
        });

        var series = [];
        var kumulatif = 0;
        var hariBreakeven = null;
        for (var d = 1; d <= hariBerjalan; d++) {
            kumulatif += (labaKotorPerHari[d] || 0) + (pemasukanLainPerHari[d] || 0) - bebanPerHari;
            series.push({ hari: d, nilai: kumulatif });
            if (hariBreakeven === null && kumulatif >= 0) hariBreakeven = d;
        }
        return { series: series, hariBreakeven: hariBreakeven };
    },

    // Bikin SVG line-chart sederhana (vanilla, tanpa library) dari series {hari, nilai}.
    _svgTrenHarian: function(tren) {
        var series = tren.series;
        if (!series || series.length === 0) {
            return '<p class="text-xs text-slate-400 text-center py-8">Belum ada data hari berjalan untuk digambar.</p>';
        }
        var W = 600, H = 180, padX = 10, padY = 16;
        var nilaiArr = series.map(function(p) { return p.nilai; });
        var minV = Math.min(0, Math.min.apply(null, nilaiArr));
        var maxV = Math.max(0, Math.max.apply(null, nilaiArr));
        if (minV === maxV) { minV -= 1; maxV += 1; } // hindari divide-by-zero kalau semua nilai sama

        var xForHari = function(h) {
            if (series.length === 1) return padX;
            return padX + ((h - series[0].hari) / (series[series.length - 1].hari - series[0].hari)) * (W - padX * 2);
        };
        var yForNilai = function(v) {
            return H - padY - ((v - minV) / (maxV - minV)) * (H - padY * 2);
        };

        var pathD = series.map(function(p, i) {
            return (i === 0 ? 'M' : 'L') + xForHari(p.hari).toFixed(1) + ',' + yForNilai(p.nilai).toFixed(1);
        }).join(' ');

        var yZero = yForNilai(0);
        var last = series[series.length - 1];
        var lastColor = last.nilai >= 0 ? '#10b981' : '#ef4444';

        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-40" preserveAspectRatio="none">';
        // garis nol (breakeven line)
        svg += '<line x1="' + padX + '" y1="' + yZero.toFixed(1) + '" x2="' + (W - padX) + '" y2="' + yZero.toFixed(1) + '" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,4" />';
        svg += '<path d="' + pathD + '" fill="none" stroke="' + lastColor + '" stroke-width="2.5" />';
        // titik di hari terakhir
        svg += '<circle cx="' + xForHari(last.hari).toFixed(1) + '" cy="' + yForNilai(last.nilai).toFixed(1) + '" r="4" fill="' + lastColor + '" />';
        // marker breakeven (kalau ada & bukan hari pertama)
        if (tren.hariBreakeven && tren.hariBreakeven > series[0].hari) {
            var titikBreak = series.find(function(p) { return p.hari === tren.hariBreakeven; });
            if (titikBreak) {
                svg += '<circle cx="' + xForHari(titikBreak.hari).toFixed(1) + '" cy="' + yForNilai(titikBreak.nilai).toFixed(1) + '" r="4" fill="#0ea5e9" stroke="white" stroke-width="1.5" />';
            }
        }
        svg += '</svg>';
        return svg;
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

        // ============================================================
        // FITUR BARU: LAPORAN KEUANGAN BAYANGAN (Real-Time / Akrual)
        // ============================================================
        // Beda dengan "Laba Bersih" di atas (basis KAS — payroll baru kehitung
        // begitu tombol "Bayarkan" ditekan), laporan ini basis AKRUAL:
        // 1) Payroll dihitung REAL-TIME pakai formula sama seperti modul Payroll,
        //    walau belum pernah dibayarkan sepeser pun bulan ini.
        // 2) Hutang usaha yang jatuh tempo s/d akhir bulan ini ikut dikurangi,
        //    walau belum dibayar.
        // Tujuannya: PSA bisa lihat untung/rugi SESUNGGUHNYA kapan saja di
        // tengah bulan, tanpa nunggu payroll & hutang benar-benar cair.
        var payrollRealtime = this._hitungPayrollRealtime();

        var hutangJatuhTempoBulanIni = 0;
        var daftarHutangJatuhTempo = (this.dataHutangBelumLunas || []).filter(function(h) {
            return h.jatuhTempo && h.jatuhTempo <= self.endDate;
        });
        daftarHutangJatuhTempo.forEach(function(h) { hutangJatuhTempoBulanIni += h.totalHarga || 0; });

        var labaBersihBayangan = totalLabaKotor - totalOperasional - payrollRealtime.total + totalPemasukanLain - hutangJatuhTempoBulanIni;
        var selisihVsResmi = labaBersihBayangan - labaBersih; // kewajiban yg blm cair tapi sudah kehitung di sini

        // ============================================================
        // FITUR BARU: PROYEKSI AKHIR BULAN (run-rate)
        // ============================================================
        // Komponen yg BERSKALA dgn aktivitas (Laba Kotor, Tunjangan&Jasa realtime, Biaya
        // Operasional, Pemasukan Lain) diproyeksikan pakai run-rate harian: (nilai s/d hari ini /
        // hari berjalan) x total hari sebulan. Komponen yg SUDAH FIX untuk sebulan penuh (Gaji
        // Pokok — nilai flat, bukan per-hari; Hutang Jatuh Tempo — sudah pasti sesuai faktur riil)
        // TIDAK ikut di-scale, karena nilainya memang tidak bertambah sebanding jumlah hari.
        var rekapTgl = this._rekapHariBulanIni();
        var hariDalamBulan = rekapTgl.hariDalamBulan;
        var hariBerjalan = rekapTgl.hariBerjalan;

        var proyeksiLabaBersihBayangan = null;
        if (hariBerjalan > 0) {
            var faktorProyeksi = hariDalamBulan / hariBerjalan;
            var proyeksiLabaKotor = totalLabaKotor * faktorProyeksi;
            var proyeksiTunjanganJasa = payrollRealtime.totalTunjanganJasa * faktorProyeksi;
            var proyeksiOperasional = totalOperasional * faktorProyeksi;
            var proyeksiPemasukanLain = totalPemasukanLain * faktorProyeksi;
            proyeksiLabaBersihBayangan = proyeksiLabaKotor - payrollRealtime.totalGajiPokok - proyeksiTunjanganJasa - proyeksiOperasional + proyeksiPemasukanLain - hutangJatuhTempoBulanIni;
        }

        // ============================================================
        // FITUR BARU: TREN HARIAN (mini grafik kumulatif s/d hari ini)
        // ============================================================
        // CATATAN: demi kecepatan (tidak menjalankan ulang formula payroll & mengambil data
        // per-hari), beban akrual (payroll realtime + operasional + hutang jatuh tempo) di grafik
        // ini diinterpolasi LINEAR sepanjang hari berjalan. Angka akhir (hari terakhir) tetap
        // sama persis dgn labaBersihBayangan di kartu utama; hari-hari sebelumnya adalah estimasi
        // visual untuk melihat TREN/pola, bukan angka akrual presisi per-hari.
        var totalBebanAkrualFinal = payrollRealtime.total + totalOperasional + hutangJatuhTempoBulanIni;
        var trenHarian = this._hitungTrenHarian(hariBerjalan, totalBebanAkrualFinal, totalPemasukanLain);

        // Simpan ringkasan supaya bisa dipakai fungsi export tanpa hitung ulang
        this.summary = {
            totalOmzet: totalOmzet, totalHPP: totalHPP, totalLabaKotor: totalLabaKotor,
            totalTindakan: totalTindakan, totalRacik: totalRacik, totalJasaResep: totalJasaResep,
            cashMasuk: cashMasuk, transferMasuk: transferMasuk, qrisMasuk: qrisMasuk,
            totalOperasional: totalOperasional, totalBeliTunai: totalBeliTunai, totalBeliKredit: totalBeliKredit,
            totalGajiPokok: totalGajiPokok, totalTunjanganJasa: totalTunjanganJasa, totalBebanPayroll: totalBebanPayroll,
            totalPemasukanLain: totalPemasukanLain,
            totalKasKeluar: totalKasKeluar, labaBersih: labaBersih,
            marginLabaKotor: marginLabaKotor, marginLabaBersih: marginLabaBersih, pertumbuhanOmzet: pertumbuhanOmzet,
            // FITUR BARU: Laporan Bayangan
            payrollRealtimeGajiPokok: payrollRealtime.totalGajiPokok,
            payrollRealtimeTunjanganJasa: payrollRealtime.totalTunjanganJasa,
            payrollRealtimeTotal: payrollRealtime.total,
            hutangJatuhTempoBulanIni: hutangJatuhTempoBulanIni,
            daftarHutangJatuhTempo: daftarHutangJatuhTempo,
            labaBersihBayangan: labaBersihBayangan,
            selisihVsResmi: selisihVsResmi,
            // FITUR BARU: Proyeksi Akhir Bulan & Tren Harian
            hariBerjalan: hariBerjalan, hariDalamBulan: hariDalamBulan,
            proyeksiLabaBersihBayangan: proyeksiLabaBersihBayangan
        };

        // FITUR BARU: simpan status ringkas ke Firestore supaya sidebar (js/app.js) bisa
        // menampilkan badge titik merah/hijau di menu "Lap. Keuangan" TANPA harus menjalankan
        // ulang seluruh kalkulasi ini di setiap halaman. Hanya ditulis kalau bulan yg sedang
        // dilihat adalah BULAN KALENDER BERJALAN (supaya badge tidak menampilkan status bulan lama).
        var todayObjBadge = new Date();
        var todayBulanBadge = todayObjBadge.getFullYear() + '-' + String(todayObjBadge.getMonth() + 1).padStart(2, '0');
        if (this.bulanDipilih === todayBulanBadge) {
            db.collection('pengaturan').doc('statusBayangan').set({
                bulan: this.bulanDipilih,
                labaBersihBayangan: labaBersihBayangan,
                proyeksiLabaBersihBayangan: proyeksiLabaBersihBayangan,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(function(err) { console.error('Gagal simpan status badge:', err); });
        }


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

        // ============================================================
        // Kartu 4: LAPORAN KEUANGAN BAYANGAN (Real-Time / Akrual)
        // ============================================================
        var isUntung = labaBersihBayangan >= 0;
        var badgeBayangan = isUntung
            ? '<span class="text-xs font-bold bg-emerald-500 text-white px-3 py-1 rounded-full">SUDAH UNTUNG</span>'
            : '<span class="text-xs font-bold bg-red-500 text-white px-3 py-1 rounded-full animate-pulse">MASIH MINUS</span>';

        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border-2 border-primary-200 dark:border-primary-800 p-5 mb-6">';
        html += '  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">';
        html += '    <h3 class="font-bold text-gray-800 dark:text-white flex items-center gap-2"><i data-lucide="ghost" class="w-5 h-5 text-primary-500"></i> Laporan Keuangan Bayangan (Real-Time)</h3>';
        html += '    ' + badgeBayangan;
        html += '  </div>';
        html += '  <p class="text-xs text-slate-400 dark:text-slate-500 mb-4">Estimasi laba PSA sesungguhnya — payroll dihitung real-time (walau belum ditekan "Bayarkan") & hutang yang jatuh tempo bulan ini ikut dikurangi, walau belum dibayar.</p>';

        html += '  <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">';
        html += '    <div class="space-y-2 text-sm">';
        html += '      <div class="flex justify-between"><span class="text-slate-500">Laba Kotor</span><span class="font-semibold text-gray-800 dark:text-white">' + Utils.formatRupiah(totalLabaKotor) + '</span></div>';
        html += '      <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Gaji Pokok (real-time)</span><span class="text-red-500">' + Utils.formatRupiah(payrollRealtime.totalGajiPokok) + '</span></div>';
        html += '      <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Tunjangan & Jasa (real-time)</span><span class="text-red-500">' + Utils.formatRupiah(payrollRealtime.totalTunjanganJasa) + '</span></div>';
        html += '      <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Biaya Operasional Lain</span><span class="text-red-500">' + Utils.formatRupiah(totalOperasional) + '</span></div>';
        if (totalPemasukanLain > 0) {
            html += '      <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">+ Pemasukan Lain</span><span class="text-emerald-500">' + Utils.formatRupiah(totalPemasukanLain) + '</span></div>';
        }
        html += '      <div class="flex justify-between pl-4 text-xs"><span class="text-slate-400">- Hutang Jatuh Tempo (s/d ' + this._fmtTglSingkat(this.endDate) + ')</span><span class="text-red-500">' + Utils.formatRupiah(hutangJatuhTempoBulanIni) + '</span></div>';
        html += '      <div class="flex justify-between border-t-2 border-slate-200 pt-3 mt-2"><span class="font-bold text-gray-800 dark:text-white">LABA BERSIH BAYANGAN</span><span class="font-bold text-lg ' + (isUntung ? 'text-emerald-600' : 'text-red-600') + '">' + Utils.formatRupiah(labaBersihBayangan) + '</span></div>';
        html += '    </div>';

        html += '    <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 text-sm space-y-2">';
        html += '      <div class="flex justify-between"><span class="text-slate-500">Laba Bersih resmi (basis kas)</span><span class="font-semibold text-gray-700 dark:text-slate-300">' + Utils.formatRupiah(labaBersih) + '</span></div>';
        html += '      <div class="flex justify-between"><span class="text-slate-500">Laba Bersih Bayangan (basis akrual)</span><span class="font-semibold ' + (isUntung ? 'text-emerald-600' : 'text-red-600') + '">' + Utils.formatRupiah(labaBersihBayangan) + '</span></div>';
        html += '      <div class="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span class="text-slate-500">Selisih</span><span class="font-bold ' + (selisihVsResmi <= 0 ? 'text-red-500' : 'text-emerald-500') + '">' + (selisihVsResmi > 0 ? '+' : '') + Utils.formatRupiah(selisihVsResmi) + '</span></div>';
        html += '      <p class="text-xs text-slate-400 pt-1">Selisih ini adalah kewajiban (payroll + hutang) yang sudah harus dihitung tapi belum tentu sudah cair sebagai kas.</p>';
        if (daftarHutangJatuhTempo.length > 0) {
            html += '      <p class="text-xs text-amber-600 dark:text-amber-400 pt-1 font-medium">' + daftarHutangJatuhTempo.length + ' faktur hutang jatuh tempo s/d akhir bulan ini, lihat detail di modul Hutang Usaha.</p>';
        }
        html += '    </div>';
        html += '  </div>';
        html += '</div>';

        // ============================================================
        // Kartu 5: PROYEKSI AKHIR BULAN + TREN HARIAN
        // ============================================================
        html += '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 mb-6">';
        html += '  <h3 class="font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-1"><i data-lucide="trending-up" class="w-5 h-5 text-primary-500"></i> Proyeksi Akhir Bulan & Tren Harian</h3>';

        if (hariBerjalan <= 0) {
            html += '  <p class="text-xs text-slate-400 py-4">Bulan ini belum berjalan, proyeksi belum bisa dihitung.</p>';
        } else {
            var proyeksiUntung = proyeksiLabaBersihBayangan >= 0;
            html += '  <p class="text-xs text-slate-400 dark:text-slate-500 mb-4">Estimasi hasil akhir bulan kalau ritme ' + hariBerjalan + ' hari terakhir berlanjut sampai tanggal ' + hariDalamBulan + '. Garis putus-putus = titik impas (Rp 0). Titik biru = hari pertama posisi sudah &ge; 0.</p>';

            html += '  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">';
            html += '    <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">';
            html += '      <p class="text-xs text-slate-400">Posisi Hari Ini (hari ke-' + hariBerjalan + ')</p>';
            html += '      <p class="font-bold ' + (isUntung ? 'text-emerald-600' : 'text-red-600') + '">' + Utils.formatRupiah(labaBersihBayangan) + '</p>';
            html += '    </div>';
            html += '    <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">';
            html += '      <p class="text-xs text-slate-400">Proyeksi s/d Akhir Bulan (hari ke-' + hariDalamBulan + ')</p>';
            html += '      <p class="font-bold ' + (proyeksiUntung ? 'text-emerald-600' : 'text-red-600') + '">' + Utils.formatRupiah(proyeksiLabaBersihBayangan) + '</p>';
            html += '    </div>';
            html += '    <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">';
            html += '      <p class="text-xs text-slate-400">Hari Breakeven Bulan Ini</p>';
            html += '      <p class="font-bold text-gray-700 dark:text-slate-300">' + (trenHarian.hariBreakeven ? 'Tanggal ' + trenHarian.hariBreakeven : (isUntung ? 'Sejak awal bulan' : 'Belum tercapai')) + '</p>';
            html += '    </div>';
            html += '  </div>';

            html += '  <div class="border border-slate-100 dark:border-slate-700 rounded-lg p-2">';
            html += this._svgTrenHarian(trenHarian);
            html += '  </div>';
            html += '  <p class="text-[11px] text-slate-400 mt-2">*Garis tren adalah estimasi visual (beban payroll & operasional diinterpolasi rata harian), bukan angka akrual presisi per-hari. Angka hari terakhir = sama persis dgn "Laba Bersih Bayangan" di kartu atas.</p>';
        }
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

        // FITUR BARU: sheet Laporan Bayangan (Real-Time / Akrual)
        var bayangan = [
            ['LAPORAN KEUANGAN BAYANGAN (Real-Time / Akrual)'], ['Periode: ' + bulan], [],
            ['Laba Kotor', s.totalLabaKotor],
            ['Gaji Pokok (real-time)', -s.payrollRealtimeGajiPokok],
            ['Tunjangan & Jasa (real-time)', -s.payrollRealtimeTunjanganJasa],
            ['Biaya Operasional Lain', -s.totalOperasional],
            ['Pemasukan Lain', s.totalPemasukanLain || 0],
            ['Hutang Jatuh Tempo Bulan Ini', -s.hutangJatuhTempoBulanIni],
            ['LABA BERSIH BAYANGAN (hari ke-' + s.hariBerjalan + ' dari ' + s.hariDalamBulan + ')', s.labaBersihBayangan], [],
            ['Laba Bersih resmi (basis kas)', s.labaBersih],
            ['Selisih (kewajiban blm cair)', s.selisihVsResmi], [],
            ['PROYEKSI AKHIR BULAN (run-rate, hari ke-' + s.hariDalamBulan + ')', s.proyeksiLabaBersihBayangan]
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bayangan), 'Laporan Bayangan');

        if (s.daftarHutangJatuhTempo && s.daftarHutangJatuhTempo.length > 0) {
            var hutangRows = [['No. Faktur', 'Supplier', 'Jatuh Tempo', 'Status', 'Total Hutang']];
            s.daftarHutangJatuhTempo.forEach(function(h) {
                hutangRows.push([h.noFaktur || '-', h.supplier || '-', h.jatuhTempo || '-', h.statusPelunasan || '-', h.totalHarga || 0]);
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hutangRows), 'Hutang Jatuh Tempo');
        }

        XLSX.writeFile(wb, 'Laporan_Keuangan_' + bulan + '.xlsx');
        Utils.toast('Laporan berhasil diexport ke Excel!', 'success');
    }
};
