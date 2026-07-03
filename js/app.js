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

    today: function () {
        return new Date().toISOString().split('T')[0];
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
        if (!confirm('Yakin ingin logout?')) return;
        firebase.auth().signOut()
            .then(function ()  { Utils.toast('Berhasil logout.', 'success'); })
            .catch(function (e){ Utils.toast('Gagal logout: ' + e.message, 'error'); });
    }
};

// ============================================================
// 4. MENU STRUCTURE & ROLE ACCESS
// ============================================================
var menuStructure = {
    utama: [
        { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', module: 'dashboard' }
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
        { id: 'penjualanHarian', label: 'Penjualan Harian',  icon: 'bar-chart-2',   module: 'laporan/penjualanHarian'}
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
        { id: 'users',     label: 'Kelola Users',     icon: 'user-cog',    module: 'pengaturan/users'     }
    ]
};

var roleAccess = {
    klinik:   ['utama', 'klinik', 'manajemen.absensi'],
    apotek:   ['utama', 'apotek', 'laporan.pengeluaran', 'laporan.penjualanHarian', 'manajemen.absensi'],
    // FIX (permintaan user): admin sekarang punya akses penuh (CRUD) ke modul Keuangan,
    // sementara modul Karyawan untuk admin dibuat view-only (lihat js/manajemen/karyawan.js).
    admin:    ['utama', 'klinik', 'apotek', 'laporan', 'manajemen', 'pengaturan.profil', 'pengaturan.tindakan'],
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
                    Utils.toast('Profil akun tidak ditemukan. Hubungi Admin.', 'error');
                    firebase.auth().signOut();
                    return;
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
