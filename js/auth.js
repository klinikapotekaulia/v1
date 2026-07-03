/**
 * js/auth.js
 * Halaman Login (overlay fullscreen) & fungsi Logout
 *
 * PERBAIKAN:
 * - File ini diload SETELAH app.js, sehingga Utils & firebase sudah tersedia
 * - Tombol login menampilkan spinner & disabled saat proses berlangsung
 * - Pesan error Firebase diterjemahkan ke Bahasa Indonesia
 * - Overlay login juga memanggil lucide.createIcons() dengan benar
 */

window.AppAuth = {

    // Terjemahan pesan error Firebase Auth → Bahasa Indonesia
    _translateError: function (code) {
        var messages = {
            'auth/invalid-email':           'Format email tidak valid.',
            'auth/user-disabled':           'Akun ini telah dinonaktifkan.',
            'auth/user-not-found':          'Email tidak terdaftar.',
            'auth/wrong-password':          'Password salah.',
            'auth/invalid-credential':      'Email atau password salah.',
            'auth/too-many-requests':       'Terlalu banyak percobaan. Coba lagi nanti.',
            'auth/network-request-failed':  'Gagal terhubung ke jaringan. Periksa koneksi internet Anda.',
            'auth/operation-not-allowed':   'Metode login ini belum diaktifkan di Firebase.',
            'auth/email-already-in-use':    'Email sudah digunakan akun lain.',
            'auth/weak-password':           'Password terlalu lemah (minimal 6 karakter).'
        };
        return messages[code] || 'Login gagal. Silakan coba lagi.';
    },

    renderLogin: function () {
        // Hapus overlay lama jika ada
        var existing = document.getElementById('login-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'login-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;';
        overlay.className = 'bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4';

        overlay.innerHTML = [
            '<div class="w-full max-w-md">',

                // Logo & Judul
                '<div class="text-center mb-8">',
                    '<img src="icon-512.png" alt="Logo Aulia"',
                        ' class="w-24 h-24 mx-auto mb-4 rounded-2xl shadow-lg object-cover"',
                        ' onerror="this.src=\'icon-192.png\'">',
                    '<h1 class="text-2xl font-bold text-gray-800 dark:text-white">Aulia Apotek Klinik</h1>',
                    '<p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Silakan login untuk melanjutkan</p>',
                '</div>',

                // Card Form
                '<div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">',

                    // Alert error
                    '<div id="login-error"',
                        ' class="hidden mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-center gap-2">',
                        '<i data-lucide="alert-circle" class="w-4 h-4 flex-shrink-0"></i>',
                        '<span id="login-error-msg"></span>',
                    '</div>',

                    // Email
                    '<div class="mb-4">',
                        '<label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>',
                        '<input type="email" id="login-email" autocomplete="email" required',
                            ' class="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600',
                            ' dark:bg-slate-700 dark:text-white rounded-lg text-sm',
                            ' focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"',
                            ' placeholder="admin@aulia.com">',
                    '</div>',

                    // Password
                    '<div class="mb-6">',
                        '<label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>',
                        '<div class="relative">',
                            '<input type="password" id="login-pass" autocomplete="current-password" required',
                                ' class="w-full px-3 py-2.5 pr-10 border border-slate-300 dark:border-slate-600',
                                ' dark:bg-slate-700 dark:text-white rounded-lg text-sm',
                                ' focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"',
                                ' placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">',
                            '<button type="button" id="toggle-pass"',
                                ' class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">',
                                '<i data-lucide="eye" class="w-4 h-4" id="pass-icon"></i>',
                            '</button>',
                        '</div>',
                    '</div>',

                    // Tombol Login
                    '<button type="button" id="btn-login"',
                        ' class="w-full bg-primary-600 hover:bg-primary-700 active:bg-primary-800',
                        ' text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">',
                        '<i data-lucide="log-in" class="w-4 h-4" id="btn-login-icon"></i>',
                        '<span id="btn-login-text">Masuk</span>',
                    '</button>',

                '</div>',

                '<p class="text-center text-xs text-slate-400 mt-5">&copy; 2025 Aulia System. All rights reserved.</p>',

            '</div>'
        ].join('');

        document.body.appendChild(overlay);
        if (window.lucide) lucide.createIcons();

        // ── Event: Toggle password visibility ──
        var toggleBtn  = overlay.querySelector('#toggle-pass');
        var passInput  = overlay.querySelector('#login-pass');
        var passIcon   = overlay.querySelector('#pass-icon');
        if (toggleBtn && passInput) {
            toggleBtn.addEventListener('click', function () {
                var isHidden = passInput.type === 'password';
                passInput.type = isHidden ? 'text' : 'password';
                passIcon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
                if (window.lucide) lucide.createIcons({ el: toggleBtn });
            });
        }

        // ── Event: Login ──
        var btnLogin   = overlay.querySelector('#btn-login');
        var emailInput = overlay.querySelector('#login-email');
        var errorBox   = overlay.querySelector('#login-error');
        var errorMsg   = overlay.querySelector('#login-error-msg');
        var btnText    = overlay.querySelector('#btn-login-text');
        var btnIcon    = overlay.querySelector('#btn-login-icon');

        function showError(msg) {
            if (errorBox && errorMsg) {
                errorMsg.textContent = msg;
                errorBox.classList.remove('hidden');
            }
        }

        function hideError() {
            if (errorBox) errorBox.classList.add('hidden');
        }

        function setLoading(loading) {
            if (!btnLogin) return;
            btnLogin.disabled = loading;
            if (loading) {
                btnText.textContent = 'Memproses...';
                btnIcon.setAttribute('data-lucide', 'loader');
                btnLogin.classList.add('opacity-75', 'cursor-not-allowed');
            } else {
                btnText.textContent = 'Masuk';
                btnIcon.setAttribute('data-lucide', 'log-in');
                btnLogin.classList.remove('opacity-75', 'cursor-not-allowed');
            }
            if (window.lucide) lucide.createIcons({ el: btnLogin });
        }

        function doLogin() {
            hideError();

            var email = (emailInput ? emailInput.value : '').trim();
            var pass  = (passInput  ? passInput.value  : '');

            if (!email) { showError('Email tidak boleh kosong.'); emailInput && emailInput.focus(); return; }
            if (!pass)  { showError('Password tidak boleh kosong.'); passInput  && passInput.focus();  return; }

            setLoading(true);

            firebase.auth().signInWithEmailAndPassword(email, pass)
                .then(function () {
                    // onAuthStateChanged di app.js akan menangani langkah selanjutnya
                    // (fetch profil Firestore → startApp)
                    setLoading(false);
                })
                .catch(function (err) {
                    setLoading(false);
                    var msg = window.AppAuth._translateError(err.code);
                    showError(msg);
                    console.error('[AUTH] Login error:', err.code, err.message);
                });
        }

        if (btnLogin) {
            btnLogin.addEventListener('click', doLogin);
        }

        // Submit dengan Enter di field email atau password
        [emailInput, passInput].forEach(function (inp) {
            if (inp) {
                inp.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') doLogin();
                });
            }
        });

        // Focus ke email input
        setTimeout(function () { if (emailInput) emailInput.focus(); }, 100);
    },

    logout: function () {
        App.logout();
    }
};
