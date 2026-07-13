/**
 * js/app.js
 * Core: Firebase init, Utils, Theme, Routing, Auth state listener
 *
 * PERBAIKAN UTAMA:
 * - File ini harus di-load SEBELUM auth.js
 * - Utils.toast pakai Snackbar (bukan alert) agar tidak blokir UI
 * - renderSidebar mengisi KEDUA sidebar (desktop + mobile)
 * - Tidak ada duplikat definisi fungsi
 */

// ============================================================
// 1. FIREBASE CONFIG
//    Ganti nilai di bawah dengan konfigurasi project Firebase Anda.
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDXuiTRwHttekv5iy6rk8RJA_pVL25v-U4",
  authDomain: "klinikapotekaulia-61641.firebaseapp.com",
  projectId: "klinikapotekaulia-61641",
  storageBucket: "klinikapotekaulia-61641.firebasestorage.app",
  messagingSenderId: "857781555251",
  appId: "1:857781555251:web:33dbb41f292026f9ef9346"
};

firebase.initializeApp(firebaseConfig);
var db   = firebase.firestore();
var auth = firebase.auth();

// PENTING: aktifkan cache lokal (IndexedDB) Firestore.
// Tanpa ini, SETIAP kali halaman di-refresh / dibuka ulang, semua listener
// (termasuk DataCache) akan mengunduh ulang SELURUH koleksi dari server -
// inilah penyebab utama reads Firestore cepat menembus kuota harian saat
// datanya sudah ribuan dokumen. Dengan persistence aktif, data yang sudah
// pernah diambil disimpan di disk browser; saat dibuka lagi, Firestore SDK
// membaca dari cache lokal dulu dan hanya menarik dari server dokumen yang
// benar-benar berubah sejak terakhir kali dibuka.
db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence: hanya bisa aktif di satu tab pada satu waktu.');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence: browser ini tidak mendukung fitur cache offline.');
    }
});

// Buat juga tersedia sebagai window.db / window.auth
window.db   = db;
window.auth = auth;

// ============================================================
// 2. UTILS
// ============================================================
window.Utils = {

    formatRupiah: function (num) {
        return 'Rp\u00a0' + (Number(num) || 0).toLocaleString('id-ID');
    },

    escapeHtml: function (text) {
        if (text === null || text === undefined) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(text)));
        return div.innerHTML;
    },

    thisMonth: function () {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    },

    // FIX: sebelumnya pakai new Date().toISOString().split('T')[0], yang selalu
    // memakai zona UTC. Untuk WIB (UTC+7), itu membuat "hari ini" baru dianggap
    // berganti jam 07:00 pagi waktu lokal (bukan jam 00:00), sehingga data yang
    // difilter/berdasarkan "hari ini" (dashboard, penjualan harian, rangkuman
    // aktivitas, dst) telat update setiap paginya sampai jam 7. Sekarang ambil
    // dari getFullYear/getMonth/getDate (mengikuti jam lokal perangkat/browser).
    today: function () {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    },

    // Snackbar non-blocking (tidak pakai alert)
    toast: function (msg, type) {
        type = type || 'info';

        // Hapus toast lama jika ada
        var old = document.getElementById('app-toast');
        if (old) old.remove();

        var colors = {
            success: 'bg-green-600',
            error:   'bg-red-600',
            warning: 'bg-amber-500',
            info:    'bg-slate-700'
        };
        var icons = {
            success: 'check-circle',
            error:   'x-circle',
            warning: 'alert-triangle',
            info:    'info'
        };

        var el = document.createElement('div');
        el.id = 'app-toast';
        el.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium max-w-sm w-auto ' + (colors[type] || colors.info);
        el.innerHTML = '<i data-lucide="' + (icons[type] || 'info') + '" class="w-4 h-4 flex-shrink-0"></i><span>' + Utils.escapeHtml(msg) + '</span>';
        document.body.appendChild(el);
        if (window.lucide) lucide.createIcons({ el: el });

        setTimeout(function () { if (el.parentNode) el.remove(); }, 4000);
    },

    showLoading: function (containerId) {
        var el = document.getElementById(containerId);
        if (el) el.innerHTML = '<div class="flex justify-center py-10"><div class="spinner"></div></div>';
    },

    openModal: function (htmlContent) {
        var existing = document.getElementById('global-modal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'global-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
        modal.innerHTML = '<div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">' + htmlContent + '</div>';
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    },

    closeModal: function () {
        var modal = document.getElementById('global-modal');
        if (modal) modal.remove();
    }
};

// ============================================================
// 3. APP — Theme & Logout
// ============================================================
window.App = {

    toggleTheme: function () {
        document.documentElement.classList.toggle('dark');
        var isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    },

    logout: function () {
        var modalContent = 
            '<div class="p-6 text-center">' +
            '  <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 mb-4">' +
            '    <i data-lucide="log-out" class="w-6 h-6"></i>' +
            '  </div>' +
            '  <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Konfirmasi Logout</h3>' +
            '  <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">Apakah Anda yakin ingin keluar dari sistem?</p>' +
            '  <div class="flex justify-center gap-3">' +
            '    <button onclick="Utils.closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg transition">' +
            '      Batal' +
            '    </button>' +
            '    <button onclick="App.confirmLogout()" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition">' +
            '      Ya, Keluar' +
            '    </button>' +
            '  </div>' +
            '</div>';
        Utils.openModal(modalContent);
    },

    confirmLogout: function () {
        Utils.closeModal();
        firebase.auth().signOut()
            .then(function ()  { Utils.toast('Berhasil logout.', 'success'); })
            .catch(function (e){ Utils.toast('Gagal logout: ' + e.message, 'error'); });
    },

    initNetworkStatus: function () {
        var self = this;
        var btn = document.getElementById('btn-network-status');
        var dot = document.getElementById('network-dot');
        var text = document.getElementById('network-text');
        var icon = document.getElementById('network-icon');

        function updateUI() {
            var isOnline = navigator.onLine;
            if (!btn || !dot || !text || !icon) return;

            // Atur ulang class nama style
            dot.className = 'w-2 h-2 rounded-full';
            btn.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-700/50';

            if (isOnline) {
                dot.classList.add('bg-green-500', 'animate-pulse');
                text.textContent = 'Online';
                text.className = 'hidden sm:inline-block text-green-600 dark:text-green-400';
                btn.classList.add('border-green-200', 'dark:border-green-900/30', 'bg-green-50/50', 'dark:bg-green-950/10');
                icon.setAttribute('data-lucide', 'wifi');
                icon.className = 'w-4 h-4 text-green-500 dark:text-green-400';
            } else {
                dot.classList.add('bg-amber-500');
                text.textContent = 'Offline';
                text.className = 'hidden sm:inline-block text-amber-600 dark:text-amber-400 font-bold';
                btn.classList.add('border-amber-200', 'dark:border-amber-900/30', 'bg-amber-50/50', 'dark:bg-amber-950/10', 'animate-pulse');
                icon.setAttribute('data-lucide', 'wifi-off');
                icon.className = 'w-4 h-4 text-amber-500 dark:text-amber-400';
                Utils.toast('Koneksi internet terputus. Bekerja Offline.', 'warning');
            }

            if (window.lucide) {
                lucide.createIcons({ el: btn });
            }
        }

        window.addEventListener('online', function () {
            updateUI();
            Utils.toast('Koneksi internet kembali pulih. Sinkronisasi otomatis aktif.', 'success');
        });
        window.addEventListener('offline', updateUI);

        // Jalankan pengecekan awal
        updateUI();

        // Cek status service worker
        this.swStatus = 'Checking...';
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(function (registration) {
                self.swStatus = 'Aktif (Scope: ' + registration.scope + ')';
            }).catch(function (err) {
                self.swStatus = 'Gagal memuat: ' + err.message;
            });
        } else {
            this.swStatus = 'Tidak didukung oleh browser ini';
        }
    },

    showPwaDetails: function () {
        var isOnline = navigator.onLine;
        var swInfo = this.swStatus || 'Tidak aktif atau belum terdaftar';

        var connectionTitle = isOnline ? 'Tersambung (Online)' : 'Terputus (Offline)';
        var connectionColor = isOnline ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400';
        var connectionBg = isOnline ? 'bg-green-50 dark:bg-green-950/20' : 'bg-amber-50 dark:bg-amber-950/20';
        var connectionIcon = isOnline ? 'wifi' : 'wifi-off';

        var statusDesc = isOnline 
            ? 'Aplikasi terhubung penuh ke Cloud Server. Semua data obat, transaksi, laporan keuangan, dan audit log akan langsung disimpan dan disinkronkan secara realtime.'
            : 'Koneksi internet Anda sedang terganggu atau tidak ada. Berkat <b>Service Worker (PWA)</b> dan <b>Firestore Offline Cache</b>, Anda masih dapat membuka aplikasi, melihat data, dan melakukan input transaksi tertentu secara offline. Transaksi baru Anda akan disimpan sementara di memori browser dan disinkronkan secara otomatis begitu internet terhubung kembali.';

        var html = 
            '<div class="p-6">' +
                '<div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">' +
                    '<div class="flex items-center gap-2">' +
                        '<i data-lucide="zap" class="w-5 h-5 text-primary-500"></i>' +
                        '<h3 class="text-lg font-bold">Status Koneksi & PWA</h3>' +
                    '</div>' +
                    '<button onclick="Utils.closeModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">' +
                        '<i data-lucide="x" class="w-5 h-5"></i>' +
                    '</button>' +
                '</div>' +

                '<div class="space-y-4">' +
                    '<!-- Status Koneksi -->' +
                    '<div class="p-4 rounded-xl ' + connectionBg + ' flex gap-3">' +
                        '<div class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm flex-shrink-0 h-9 w-9 flex items-center justify-center">' +
                            '<i data-lucide="' + connectionIcon + '" class="w-5 h-5 ' + connectionColor + '"></i>' +
                        '</div>' +
                        '<div>' +
                            '<p class="text-sm font-semibold ' + connectionColor + '">' + connectionTitle + '</p>' +
                            '<p class="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">' + statusDesc + '</p>' +
                        '</div>' +
                    '</div>' +

                    '<!-- Service Worker Info -->' +
                    '<div class="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">' +
                        '<div class="flex items-center gap-2 text-sm font-semibold">' +
                            '<i data-lucide="cpu" class="w-4 h-4 text-indigo-500"></i>' +
                            '<span>Service Worker (PWA Engine)</span>' +
                        '</div>' +
                        '<div class="grid grid-cols-3 gap-2 text-xs">' +
                            '<span class="text-slate-400">Status Registrasi:</span>' +
                            '<span class="col-span-2 font-medium text-slate-700 dark:text-slate-300">' + swInfo + '</span>' +

                            '<span class="text-slate-400">Penyimpanan Cache:</span>' +
                            '<span class="col-span-2 font-medium text-slate-700 dark:text-slate-300">Aktif (Shell Cache: aulia-v6)</span>' +

                            '<span class="text-slate-400">Mode Kerja:</span>' +
                            '<span class="col-span-2 font-medium text-slate-700 dark:text-slate-300">Hybrid (Network-First & Offline Fallback)</span>' +
                        '</div>' +
                        '<p class="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-800">' +
                            'Service Worker menyimpan aset statis aplikasi di browser Anda sehingga aplikasi memuat lebih cepat dan tetap dapat dibuka walau offline.' +
                        '</p>' +
                    '</div>' +

                    '<!-- Firestore Cache Info -->' +
                    '<div class="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">' +
                        '<div class="flex items-center gap-2 text-sm font-semibold">' +
                            '<i data-lucide="database" class="w-4 h-4 text-emerald-500"></i>' +
                            '<span>Firestore Offline Persistence</span>' +
                        '</div>' +
                        '<div class="grid grid-cols-3 gap-2 text-xs">' +
                            '<span class="text-slate-400">Status Cache:</span>' +
                            '<span class="col-span-2 font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">' +
                                '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Aktif (IndexedDB)' +
                            '</span>' +

                            '<span class="text-slate-400">Tab Sync:</span>' +
                            '<span class="col-span-2 font-medium text-slate-700 dark:text-slate-300">Diaktifkan (Multi-Tab)</span>' +
                        '</div>' +
                        '<p class="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-800">' +
                            'Penyimpanan database lokal Firestore aktif. Transaksi harian akan tersimpan aman di disk lokal saat offline dan disinkronkan kembali saat online.' +
                        '</p>' +
                    '</div>' +
                '</div>' +

                '<div class="flex justify-end mt-6">' +
                    '<button onclick="Utils.closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition">' +
                        'Tutup' +
                    '</button>' +
                '</div>' +
            '</div>';

        Utils.openModal(html);
    }
};

// ============================================================
// 4. MENU STRUCTURE & ROLE ACCESS
// ============================================================
var menuStructure = {
    utama: [
        { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', module: 'dashboard' },
        { id: 'chat',      label: 'Diskusi & Chat', icon: 'message-square', module: 'chat' }
    ],
    klinik: [
        { id: 'antrian',    label: 'Antrian',     icon: 'list-ordered', module: 'klinik/antrian'    },
        { id: 'rekam-medis',label: 'Rekam Medis', icon: 'file-heart',   module: 'klinik/rekamMedis' },
        { id: 'resep',      label: 'Resep',       icon: 'file-text',    module: 'klinik/resep'      },
        { id: 'pasien',     label: 'Pasien',      icon: 'users',        module: 'klinik/pasien'     }
    ],
    apotek: [
        { id: 'transaksi',   label: 'Transaksi',    icon: 'shopping-cart',   module: 'apotek/transaksi'    },
        { id: 'obat',        label: 'Obat & Stok',  icon: 'pill',            module: 'apotek/obat'         },
        { id: 'pembelian',   label: 'Pembelian',    icon: 'truck',           module: 'apotek/pembelian'    },
        { id: 'stockOpname', label: 'Stok Opname',  icon: 'clipboard-check', module: 'apotek/stockOpname'  },
        { id: 'notifikasi',  label: 'Notifikasi',   icon: 'bell',            module: 'apotek/notifikasi'   },
        { id: 'retur',       label: 'Retur Obat',   icon: 'undo-2',          module: 'apotek/retur'        }
    ],
    laporan: [
        { id: 'hutang',          label: 'Hutang Usaha',      icon: 'file-text',     module: 'laporan/hutang'         },
        { id: 'pengeluaran',     label: 'Pengeluaran',       icon: 'receipt',       module: 'laporan/pengeluaran'    },
        { id: 'piutang',         label: 'Piutang Karyawan',  icon: 'wallet',        module: 'laporan/piutang'        },
        { id: 'penjualanHarian', label: 'Penjualan Harian',  icon: 'bar-chart-2',   module: 'laporan/penjualanHarian'},
        { id: 'auditTrail',      label: 'Audit Trail',       icon: 'history',       module: 'laporan/auditTrail'     }
    ],
    manajemen: [
        { id: 'karyawan', label: 'Karyawan', icon: 'user-check',    module: 'manajemen/karyawan' },
        { id: 'absensi',  label: 'Absensi',  icon: 'calendar-check', module: 'manajemen/absensi' }
    ],
    keuangan: [
        { id: 'payroll',           label: 'Payroll',             icon: 'calculator',     module: 'keuangan/payroll'          },
        { id: 'laporan-keuangan',  label: 'Lap. Keuangan',       icon: 'bar-chart-3',    module: 'keuangan/laporanKeuangan'  },
        { id: 'rangkuman-bulanan', label: 'Rangkuman Aktivitas', icon: 'calendar-range', module: 'keuangan/rangkumanBulanan' },
        { id: 'akuntansi',         label: 'Akuntansi',           icon: 'book-open',      module: 'keuangan/akuntansi'        }
    ],
    pengaturan: [
        { id: 'profil',    label: 'Profil Instansi',  icon: 'building-2',  module: 'pengaturan/profil'    },
        { id: 'pembagian', label: 'Pembagian Hasil',  icon: 'pie-chart',   module: 'pengaturan/pembagian' },
        { id: 'tindakan',  label: 'Master Tindakan',  icon: 'stethoscope', module: 'pengaturan/tindakan'  },
        { id: 'gaji',      label: 'Pengaturan Gaji',  icon: 'wallet',      module: 'pengaturan/gaji'      },
        { id: 'users',     label: 'Kelola Users',     icon: 'user-cog',    module: 'pengaturan/users'     },
        // BARU: pengaturan logo, running text, video YouTube & tema untuk display.html (TV ruang tunggu)
        { id: 'display-antrian', label: 'Display Antrian', icon: 'tv', module: 'pengaturan/displayAntrian' }
    ]
};

var roleAccess = {
    klinik:   ['utama', 'klinik', 'manajemen.absensi'],
    // FIX (permintaan user): role baru khusus akun Dokter. Akses menu sama dengan
    // Klinik, namun di dalam Antrian & Rekam Medis perilakunya dibedakan
    // (lihat js/klinik/antrian.js & js/klinik/rekamMedis.js) — hanya akun Dokter
    // yang bisa membuka & menyimpan Rekam Medis.
    dokter:   ['utama', 'klinik', 'manajemen.absensi'],
    apotek:   ['utama', 'apotek', 'laporan.pengeluaran', 'laporan.penjualanHarian', 'manajemen.absensi'],
    // FIX (permintaan user): admin sekarang punya akses penuh (CRUD) ke modul Keuangan,
    // sementara modul Karyawan untuk admin dibuat view-only (lihat js/manajemen/karyawan.js).
    admin:    ['utama', 'klinik', 'apotek', 'laporan', 'manajemen', 'pengaturan.profil', 'pengaturan.tindakan', 'pengaturan.display-antrian'],
    keuangan: ['utama', 'klinik', 'apotek', 'laporan', 'manajemen', 'keuangan', 'pengaturan']
};

// ============================================================
// 5. RENDER SIDEBAR
// ============================================================
function buildSidebarHtml(role) {
    var allowed = roleAccess[role] || [];

    var sections = [
        { key: 'utama',     title: 'Menu Utama',          icon: 'home'          },
        { key: 'klinik',    title: 'Operasional Klinik',  icon: 'activity'      },
        { key: 'apotek',    title: 'Operasional Apotek',  icon: 'cross'         },
        { key: 'laporan',   title: 'Laporan',             icon: 'file-bar-chart' },
        { key: 'manajemen', title: 'Manajemen',           icon: 'users'         },
        { key: 'keuangan',  title: 'Keuangan',            icon: 'landmark'      },
        { key: 'pengaturan',title: 'Pengaturan',          icon: 'settings'      }
    ];

    var html = '';

    sections.forEach(function (section) {
        var hasSection = allowed.indexOf(section.key) !== -1 ||
            allowed.some(function (a) { return a.indexOf(section.key + '.') === 0; });
        if (!hasSection) return;

        var items = '';
        menuStructure[section.key].forEach(function (menu) {
            var fullKey    = section.key + '.' + menu.id;
            var hasItem    = allowed.indexOf(section.key) !== -1 || allowed.indexOf(fullKey) !== -1;
            if (!hasItem) return;

            items += '<li>' +
                '<button onclick="navigateTo(\'' + menu.module + '\', \'' + menu.label + '\')" ' +
                'class="nav-btn w-full text-left px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 ' +
                'hover:bg-primary-50 dark:hover:bg-slate-700 hover:text-primary-600 dark:hover:text-primary-400 ' +
                'transition-colors flex items-center gap-3" data-page="' + menu.id + '">' +
                '<i data-lucide="' + menu.icon + '" class="w-4 h-4 flex-shrink-0"></i>' +
                '<span>' + menu.label + '</span>' +
                '</button></li>';
        });

        if (!items) return; // bagian ini tidak ada item yang bisa diakses

        html += '<div>' +
            '<p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">' +
            '<i data-lucide="' + section.icon + '" class="w-3.5 h-3.5"></i>' + section.title + '</p>' +
            '<ul class="space-y-0.5">' + items + '</ul></div>';
    });

    return html;
}

function renderSidebar(role) {
    var html = buildSidebarHtml(role);

    var desktopMenu = document.getElementById('sidebar-menu');
    var mobileMenu  = document.getElementById('mobile-sidebar-menu');

    if (desktopMenu) desktopMenu.innerHTML = html;
    if (mobileMenu)  mobileMenu.innerHTML  = html;

    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 6. DYNAMIC SCRIPT LOADER
// ============================================================
var _currentModule  = null;
var _loadedScripts  = {};

function loadScript(url) {
    return new Promise(function (resolve, reject) {
        if (_loadedScripts[url]) { resolve(); return; }
        var script    = document.createElement('script');
        script.src    = url;
        script.onload = function () { _loadedScripts[url] = true; resolve(); };
        script.onerror = function () {
            reject(new Error('Gagal memuat file: ' + url));
        };
        document.head.appendChild(script);
    });
}

window.navigateTo = function (modulePath, title) {
    if (_currentModule && typeof _currentModule.destroy === 'function') {
        try {
            _currentModule.destroy();
        } catch (e) {
            console.error('Error destroying module:', e);
        }
    }
    _currentModule = null;

    document.getElementById('page-title').textContent = title || '';
    document.getElementById('app-content').innerHTML  =
        '<div class="flex justify-center py-20"><div class="spinner"></div></div>';

    // Highlight menu aktif di KEDUA sidebar
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
        btn.classList.remove('bg-primary-50', 'text-primary-600', 'font-semibold',
                             'dark:bg-slate-700', 'dark:text-primary-400');
    });
    var pageId  = modulePath.split('/').pop();
    var actives = document.querySelectorAll('[data-page="' + pageId + '"]');
    actives.forEach(function (btn) {
        btn.classList.add('bg-primary-50', 'text-primary-600', 'font-semibold',
                          'dark:bg-slate-700', 'dark:text-primary-400');
    });

    // Tutup sidebar mobile otomatis
    if (window.innerWidth < 1024) {
        var mobileSidebar = document.getElementById('mobile-sidebar');
        var overlay       = document.getElementById('sidebar-overlay');
        if (mobileSidebar && !mobileSidebar.classList.contains('-translate-x-full')) {
            mobileSidebar.classList.add('-translate-x-full');
            if (overlay) overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    var scriptUrl = 'js/' + modulePath + '.js';
    loadScript(scriptUrl).then(function () {
        // Nama objek modul: "js/apotek/obat" → "AppApotekObat"
        var moduleName = 'App' + modulePath.split('/')
            .map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); })
            .join('');

        var Module = window[moduleName];
        if (!Module || typeof Module.render !== 'function') {
            throw new Error('Objek window.' + moduleName + ' tidak ditemukan atau tidak memiliki fungsi render().');
        }

        _currentModule = Module;
        var content    = document.getElementById('app-content');
        content.innerHTML = Module.render();
        content.classList.add('page-enter');
        setTimeout(function () { content.classList.remove('page-enter'); }, 300);

        if (window.lucide) lucide.createIcons();
        if (typeof Module.init === 'function') Module.init();

    }).catch(function (err) {
        console.error('Gagal load module [' + modulePath + ']:', err);
        document.getElementById('app-content').innerHTML =
            '<div class="text-center py-20">' +
            '<i data-lucide="file-x" class="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4"></i>' +
            '<h3 class="text-lg font-bold text-slate-500 dark:text-slate-400">Halaman Belum Tersedia</h3>' +
            '<p class="text-sm text-slate-400 dark:text-slate-500 mt-2">' + Utils.escapeHtml(err.message) + '</p>' +
            '<p class="text-xs text-slate-300 dark:text-slate-600 mt-1">Path: js/' + modulePath + '.js</p>' +
            '</div>';
        if (window.lucide) lucide.createIcons();
    });
};

// ============================================================
// 7. BOOT APP (dipanggil setelah user terautentikasi)
// ============================================================
function startApp(userRole, userName, userTema) {
    window.currentRole     = userRole;
    window.currentUserName = userName;
    var user = firebase.auth().currentUser;
    if (user) {
        window.currentUid = user.uid;
        window.currentUserEmail = user.email;
    }

    var nameSafe = (userName || 'User').toString().trim() || 'User';
    var roleSafe = (userRole  || 'user').toString().trim() || 'user';

    var elName   = document.getElementById('user-name');
    var elRole   = document.getElementById('user-role');
    var elAvatar = document.getElementById('user-avatar');

    if (elName)   elName.textContent   = nameSafe;
    if (elRole)   elRole.textContent   = roleSafe.charAt(0).toUpperCase() + roleSafe.slice(1);
    if (elAvatar) elAvatar.textContent = (nameSafe.charAt(0) || '?').toUpperCase();

    // FITUR BARU: tema tampilan per-akun (mis. "win98"). Class ditaruh di <body>
    // supaya css/win98.css bisa menimpa tampilan hanya untuk akun ybs.
    document.body.classList.remove('theme-win98');
    if (userTema === 'win98') document.body.classList.add('theme-win98');

    renderSidebar(userRole);
    navigateTo('dashboard', 'Dashboard');
}

// ============================================================
// 8. AUTH STATE LISTENER
//    Ini adalah "permission gate" utama aplikasi.
//    - Jika user login → panggil startApp()
//    - Jika tidak → tampilkan form login via auth.js
// ============================================================
firebase.auth().onAuthStateChanged(function (user) {
    if (user) {
        // Hapus overlay login jika masih ada
        var overlay = document.getElementById('login-overlay');
        if (overlay) overlay.remove();

        // Ambil profil dari Firestore
        db.collection('users').doc(user.uid).get()
            .then(function (doc) {
                if (!doc.exists) {
                    // Cek apakah database benar-benar kosong (tidak ada user sama sekali).
                    // Jika kosong, daftarkan user ini otomatis sebagai Admin pertama (bootstrap).
                    return db.collection('users').limit(1).get()
                        .then(function (snap) {
                            if (snap.empty) {
                                var bootstrapData = {
                                    nama: (user.displayName || user.email || 'Keuangan Aulia').split('@')[0],
                                    email: user.email,
                                    role: 'keuangan',
                                    status: 'aktif',
                                    tema: 'default',
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                };
                                return db.collection('users').doc(user.uid).set(bootstrapData)
                                    .then(function () {
                                        Utils.toast('Database kosong terdeteksi. Akun Anda berhasil di-bootstrap sebagai Keuangan (Owner)!', 'success');
                                        startApp('keuangan', bootstrapData.nama, 'default');
                                    });
                            } else {
                                Utils.toast('Profil akun tidak ditemukan. Hubungi Admin.', 'error');
                                firebase.auth().signOut();
                            }
                        })
                        .catch(function (err) {
                            console.error('[AUTH] Bootstrap check error:', err);
                            Utils.toast('Profil akun tidak ditemukan. Hubungi Admin.', 'error');
                            firebase.auth().signOut();
                        });
                }
                var data = doc.data();
                if (data.status === 'nonaktif') {
                    Utils.toast('Akun Anda dinonaktifkan. Hubungi Admin.', 'error');
                    firebase.auth().signOut();
                    return;
                }
                startApp(data.role || 'apotek', data.nama || user.email || 'User', data.tema || 'default');
            })
            .catch(function (err) {
                Utils.toast('Gagal memuat profil: ' + err.message, 'error');
                firebase.auth().signOut();
            });

    } else {
        // User belum login — tampilkan form login
        // window.AppAuth didefinisikan di auth.js yang diload setelah app.js
        document.body.classList.remove('theme-win98'); // FITUR BARU: reset tema saat logout
        if (window.AppAuth && typeof window.AppAuth.renderLogin === 'function') {
            window.AppAuth.renderLogin();
        }
        // Reset UI navbar
        var elName   = document.getElementById('user-name');
        var elRole   = document.getElementById('user-role');
        var elAvatar = document.getElementById('user-avatar');
        if (elName)   elName.textContent   = 'Tamu';
        if (elRole)   elRole.textContent   = '-';
        if (elAvatar) elAvatar.textContent = '?';
    }
});

// Initialize network status monitoring once DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (window.App && typeof window.App.initNetworkStatus === 'function') {
            window.App.initNetworkStatus();
        }
    });
} else {
    if (window.App && typeof window.App.initNetworkStatus === 'function') {
        window.App.initNetworkStatus();
    }
}
