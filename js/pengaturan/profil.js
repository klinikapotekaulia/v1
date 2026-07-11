/**
 * js/pengaturan/profil.js
 * Pengaturan Profil Instansi & Pengaturan Struk Kasir (Edit Logo & Konten)
 */

window.AppPengaturanProfil = {
    data: {},
    activeTab: 'profil', // 'profil' atau 'struk'

    render: function() {
        var html = '<div class="page-enter max-w-7xl mx-auto">';
        
        // Header
        html += '  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">';
        html += '    <div>';
        html += '      <h2 class="text-xl font-bold text-gray-800 dark:text-white mb-1">Profil & Pengaturan Struk</h2>';
        html += '      <p class="text-sm text-slate-500 dark:text-slate-400">Kelola identitas instansi dan desain struk cetak kasir Anda</p>';
        html += '    </div>';
        html += '  </div>';

        // Grid Layout: Form Kiri, Live Preview Kanan
        html += '  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">';
        
        // Kiri: Form & Tabs (Col 7)
        html += '    <div class="lg:col-span-7 space-y-6">';
        
        // Tab Navigasi
        html += '      <div class="border-b border-slate-200 dark:border-slate-700 flex gap-4">';
        html += '        <button id="tab-btn-profil" onclick="AppPengaturanProfil.switchTab(\'profil\')" class="pb-3 text-sm font-semibold border-b-2 transition-all px-1 ' + (this.activeTab === 'profil' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white') + '">Profil Instansi</button>';
        html += '        <button id="tab-btn-struk" onclick="AppPengaturanProfil.switchTab(\'struk\')" class="pb-3 text-sm font-semibold border-b-2 transition-all px-1 ' + (this.activeTab === 'struk' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white') + '">Pengaturan Struk</button>';
        html += '      </div>';

        // Container Form (dinamis di-render)
        html += '      <div id="form-container"></div>';
        
        html += '    </div>';

        // Kanan: Live Receipt Preview (Col 5)
        html += '    <div class="lg:col-span-5">';
        html += '      <div class="sticky top-6">';
        html += '        <p class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">';
        html += '          <i data-lucide="eye" class="w-3.5 h-3.5"></i> Live Preview Struk';
        html += '        </p>';
        
        // The thermal receipt paper container
        html += '        <div class="bg-slate-100 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex justify-center shadow-inner">';
        html += '          <div id="receipt-preview-paper" class="w-full max-w-[310px] bg-[#fdfdfd] text-slate-900 border border-slate-300 shadow-md p-4 font-mono text-xs rounded-sm select-none relative overflow-hidden" style="color:#000000 !important; font-family:\'Courier New\', Courier, monospace !important;">';
        
        // Decorative torn paper effect top & bottom
        html += '            <div class="absolute top-0 left-0 right-0 h-1 bg-[radial-gradient(circle,transparent_20%,#f0f0f0_21%,#f0f0f0_34%,transparent_35%,transparent)] bg-[length:8px_8px] bg-repeat-x"></div>';
        
        // Preview content rendered here
        html += '            <div id="receipt-preview-content" class="py-2"></div>';
        
        html += '            <div class="absolute bottom-0 left-0 right-0 h-1 bg-[radial-gradient(circle,transparent_20%,#f0f0f0_21%,#f0f0f0_34%,transparent_35%,transparent)] bg-[length:8px_8px] bg-repeat-x"></div>';
        html += '          </div>';
        html += '        </div>';
        
        html += '      </div>';
        html += '    </div>';

        html += '  </div>'; // End Grid
        html += '</div>'; // End Page
        
        return html;
    },

    init: function() {
        var self = this;
        db.collection('pengaturan').doc('profil').get().then(function(doc) {
            if (doc.exists) {
                self.data = doc.data();
            } else {
                // Default fallback values
                self.data = {
                    nama: 'Aulia Apotek Klinik',
                    alamat: 'Jl. Ahmad Yani No. 45, Kota Sehat',
                    telp: '0812-3456-7890',
                    email: 'info@aulia-apotek.com',
                    
                    // Struk defaults
                    tampilkanLogo: true,
                    logoStrukB64: '', // Kosong = pakai inisial / default logo
                    logoUkuran: 100, // lebar px
                    logoPosisi: 'center', // left, center, right
                    
                    strukHeader1: 'AULIA APOTEK KLINIK',
                    strukHeader2: 'Apotek & Klinik Terpadu 24 Jam',
                    strukHeader3: 'Jl. Ahmad Yani No. 45, Kota Sehat',
                    strukHeader4: 'Telp: 0812-3456-7890',
                    strukHeaderSelesai: '',
                    
                    showPasien: true,
                    showDokter: true,
                    showMetodeBayar: true,
                    
                    strukFooter1: 'Terima Kasih',
                    strukFooter2: 'Semoga Lekas Sembuh',
                    footerStruk: 'Barang yang sudah dibeli tidak dapat ditukar',
                    
                    strukLebar: '80mm',
                    strukUkuranFont: '12px'
                };
            }
            self.ensureDefaultKeys();
            self.renderActiveForm();
            self.updatePreview();
        }).catch(function(err) {
            Utils.toast('Gagal memuat profil: ' + err.message, 'error');
        });
    },

    ensureDefaultKeys: function() {
        var d = this.data;
        if (d.tampilkanLogo === undefined) d.tampilkanLogo = true;
        if (d.logoUkuran === undefined) d.logoUkuran = 100;
        if (d.logoPosisi === undefined) d.logoPosisi = 'center';
        
        if (d.strukHeader1 === undefined) d.strukHeader1 = d.nama || 'AULIA APOTEK KLINIK';
        if (d.strukHeader2 === undefined) d.strukHeader2 = 'Apotek & Klinik Terpadu 24 Jam';
        if (d.strukHeader3 === undefined) d.strukHeader3 = d.alamat || '';
        if (d.strukHeader4 === undefined) d.strukHeader4 = d.telp ? 'Telp: ' + d.telp : '';
        if (d.strukHeaderSelesai === undefined) d.strukHeaderSelesai = '';
        
        if (d.showPasien === undefined) d.showPasien = true;
        if (d.showDokter === undefined) d.showDokter = true;
        if (d.showMetodeBayar === undefined) d.showMetodeBayar = true;
        
        if (d.strukFooter1 === undefined) d.strukFooter1 = 'Terima Kasih';
        if (d.strukFooter2 === undefined) d.strukFooter2 = 'Semoga Lekas Sembuh';
        if (d.footerStruk === undefined) d.footerStruk = d.footerStruk || '';
        
        if (d.strukLebar === undefined) d.strukLebar = '80mm';
        if (d.strukUkuranFont === undefined) d.strukUkuranFont = '12px';
    },

    switchTab: function(tab) {
        this.activeTab = tab;
        
        // Toggle tab styles
        var btnProfil = document.getElementById('tab-btn-profil');
        var btnStruk = document.getElementById('tab-btn-struk');
        
        if (this.activeTab === 'profil') {
            btnProfil.className = 'pb-3 text-sm font-semibold border-b-2 transition-all px-1 border-primary-600 text-primary-600';
            btnStruk.className = 'pb-3 text-sm font-semibold border-b-2 transition-all px-1 border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white';
        } else {
            btnProfil.className = 'pb-3 text-sm font-semibold border-b-2 transition-all px-1 border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white';
            btnStruk.className = 'pb-3 text-sm font-semibold border-b-2 transition-all px-1 border-primary-600 text-primary-600';
        }
        
        this.renderActiveForm();
    },

    renderActiveForm: function() {
        var self = this;
        var container = document.getElementById('form-container');
        if (!container) return;

        var d = this.data;
        var role = window.currentRole || 'apotek';
        var canEdit = (role === 'admin' || role === 'keuangan');
        
        var html = '<form id="form-profil-instansi" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">';
        
        if (this.activeTab === 'profil') {
            // === TAB PROFIL INSTANSI ===
            html += '<div class="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">';
            html += '  <div class="w-16 h-16 bg-gradient-to-tr from-primary-600 to-pink-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">' + (d.nama || 'A').charAt(0) + '</div>';
            html += '  <div class="text-center sm:text-left">';
            html += '    <h3 class="font-bold text-base text-gray-800 dark:text-white">' + Utils.escapeHtml(d.nama || 'Aulia Apotek Klinik') + '</h3>';
            html += '    <p class="text-xs text-slate-400">Silakan lengkapi profil dasar instansi Anda di bawah ini</p>';
            html += '  </div>';
            html += '</div>';

            // Nama Instansi
            html += '<div>';
            html += '  <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nama Instansi *</label>';
            html += '  <input type="text" id="pr-nama" value="' + Utils.escapeHtml(d.nama || '') + '" required ' + (canEdit ? '' : 'readonly') + ' class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm ' + (canEdit ? '' : 'bg-slate-100 cursor-not-allowed') + '" oninput="AppPengaturanProfil.handleInputChange(\'nama\', this.value)">';
            html += '</div>';

            // Alamat
            html += '<div>';
            html += '  <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Alamat Lengkap</label>';
            html += '  <textarea id="pr-alamat" rows="2" ' + (canEdit ? '' : 'readonly') + ' class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm ' + (canEdit ? '' : 'bg-slate-100 cursor-not-allowed') + '" oninput="AppPengaturanProfil.handleInputChange(\'alamat\', this.value)">' + Utils.escapeHtml(d.alamat || '') + '</textarea>';
            html += '</div>';

            // Telp & Email
            html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
            html += '  <div>';
            html += '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">No. Telepon / WA</label>';
            html += '    <input type="text" id="pr-telp" value="' + Utils.escapeHtml(d.telp || '') + '" ' + (canEdit ? '' : 'readonly') + ' class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm ' + (canEdit ? '' : 'bg-slate-100 cursor-not-allowed') + '" placeholder="0812xxxxxxx" oninput="AppPengaturanProfil.handleInputChange(\'telp\', this.value)">';
            html += '  </div>';
            html += '  <div>';
            html += '    <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Email (Opsional)</label>';
            html += '    <input type="email" id="pr-email" value="' + Utils.escapeHtml(d.email || '') + '" ' + (canEdit ? '' : 'readonly') + ' class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm ' + (canEdit ? '' : 'bg-slate-100 cursor-not-allowed') + '" placeholder="info@aulia.com" oninput="AppPengaturanProfil.handleInputChange(\'email\', this.value)">';
            html += '  </div>';
            html += '</div>';
            
        } else {
            // === TAB PENGATURAN STRUK ===
            html += '<div class="space-y-6">';

            // Bagian Logo
            html += '  <div class="border-b border-slate-100 dark:border-slate-700/60 pb-5">';
            html += '    <h3 class="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><i data-lucide="image" class="w-4 h-4 text-primary-500"></i> Logo Struk</h3>';
            
            html += '    <div class="flex flex-col sm:flex-row items-center gap-5">';
            // Preview Logo Uploaded
            html += '      <div id="logo-uploader-preview" class="w-20 h-20 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center p-1.5 overflow-hidden shadow-sm">';
            if (d.logoStrukB64) {
                html += '        <img src="' + d.logoStrukB64 + '" class="max-w-full max-h-full object-contain">';
            } else {
                html += '        <span class="text-[10px] text-slate-400 text-center font-semibold font-sans">No Logo</span>';
            }
            html += '      </div>';
            
            // Upload Controls
            html += '      <div class="flex-1 space-y-2 text-center sm:text-left">';
            html += '        <div class="flex flex-wrap items-center gap-2 justify-center sm:justify-start">';
            html += '          <label class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white text-xs font-semibold rounded-lg cursor-pointer border border-slate-200 dark:border-slate-600 transition flex items-center gap-1.5 ' + (canEdit ? '' : 'opacity-50 cursor-not-allowed') + '">';
            html += '            <i data-lucide="upload" class="w-3.5 h-3.5"></i> Pilih File';
            html += '            <input type="file" id="logo-file-picker" accept="image/png, image/jpeg, image/jpg" class="hidden" ' + (canEdit ? '' : 'disabled') + ' onchange="AppPengaturanProfil.handleLogoUpload(event)">';
            html += '          </label>';
            if (d.logoStrukB64) {
                html += '          <button type="button" onclick="AppPengaturanProfil.removeLogo()" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-xs font-semibold rounded-lg border border-rose-100 dark:border-rose-900/30 transition flex items-center gap-1.5">Hapus Logo</button>';
            }
            html += '        </div>';
            html += '        <p class="text-[10px] text-slate-400 dark:text-slate-500">Mendukung format PNG/JPG. File dikompresi & disimpan langsung di database.</p>';
            html += '      </div>';
            html += '    </div>';

            // Logo layout options
            html += '    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">';
            // Tampilkan Logo Toggle
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Tampilkan Logo</label>';
            html += '        <select id="st-show-logo" onchange="AppPengaturanProfil.handleInputChange(\'tampilkanLogo\', this.value === \'true\')" class="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500">';
            html += '          <option value="true" ' + (d.tampilkanLogo ? 'selected' : '') + '>Ya, Tampilkan</option>';
            html += '          <option value="false" ' + (!d.tampilkanLogo ? 'selected' : '') + '>Tidak</option>';
            html += '        </select>';
            html += '      </div>';
            // Logo Posisi
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Posisi Logo</label>';
            html += '        <select id="st-logo-pos" onchange="AppPengaturanProfil.handleInputChange(\'logoPosisi\', this.value)" class="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500">';
            html += '          <option value="left" ' + (d.logoPosisi === 'left' ? 'selected' : '') + '>Kiri</option>';
            html += '          <option value="center" ' + (d.logoPosisi === 'center' ? 'selected' : '') + '>Tengah</option>';
            html += '          <option value="right" ' + (d.logoPosisi === 'right' ? 'selected' : '') + '>Kanan</option>';
            html += '        </select>';
            html += '      </div>';
            // Logo Ukuran
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Lebar Logo (px)</label>';
            html += '        <input type="number" id="st-logo-size" value="' + d.logoUkuran + '" min="40" max="200" step="10" oninput="AppPengaturanProfil.handleInputChange(\'logoUkuran\', parseInt(this.value, 10))" class="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500">';
            html += '      </div>';
            html += '    </div>';
            html += '  </div>';

            // Bagian Header Konten
            html += '  <div class="border-b border-slate-100 dark:border-slate-700/60 pb-5">';
            html += '    <h3 class="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><i data-lucide="align-center" class="w-4 h-4 text-primary-500"></i> Konten Header Struk</h3>';
            html += '    <div class="space-y-3">';
            
            // Header 1
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Baris 1 (Nama Toko / Utama)</label>';
            html += '        <input type="text" id="st-h1" value="' + Utils.escapeHtml(d.strukHeader1) + '" oninput="AppPengaturanProfil.handleInputChange(\'strukHeader1\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="NAMA APOTEK / KLINIK">';
            html += '      </div>';
            // Header 2
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Baris 2 (Slogan / Sub-header)</label>';
            html += '        <input type="text" id="st-h2" value="' + Utils.escapeHtml(d.strukHeader2) + '" oninput="AppPengaturanProfil.handleInputChange(\'strukHeader2\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="Klinik Pratama & Apotek 24 Jam">';
            html += '      </div>';
            // Header 3
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Baris 3 (Alamat)</label>';
            html += '        <input type="text" id="st-h3" value="' + Utils.escapeHtml(d.strukHeader3) + '" oninput="AppPengaturanProfil.handleInputChange(\'strukHeader3\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="Jl. Raya No. 12">';
            html += '      </div>';
            // Header 4
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Baris 4 (Telepon / Kontak)</label>';
            html += '        <input type="text" id="st-h4" value="' + Utils.escapeHtml(d.strukHeader4) + '" oninput="AppPengaturanProfil.handleInputChange(\'strukHeader4\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="Telp: 0812xxxxxx">';
            html += '      </div>';
            // Header Selesai / Tambahan Akhir
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Teks Tambahan Akhir Header (Opsional)</label>';
            html += '        <input type="text" id="st-h-selesai" value="' + Utils.escapeHtml(d.strukHeaderSelesai) + '" oninput="AppPengaturanProfil.handleInputChange(\'strukHeaderSelesai\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="SIP: 123/DU/2026 atau notes lainnya">';
            html += '      </div>';

            html += '    </div>';
            html += '  </div>';

            // Bagian Detail Transaksi & Body
            html += '  <div class="border-b border-slate-100 dark:border-slate-700/60 pb-5">';
            html += '    <h3 class="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><i data-lucide="check-square" class="w-4 h-4 text-primary-500"></i> Detail Informasi Body</h3>';
            html += '    <div class="space-y-2.5 bg-slate-50 dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">';
            
            // Show Pasien
            html += '      <div class="flex items-center justify-between">';
            html += '        <label for="st-show-pasien" class="text-xs text-slate-600 dark:text-slate-300 font-medium">Tampilkan Nama Pasien</label>';
            html += '        <input type="checkbox" id="st-show-pasien" ' + (d.showPasien ? 'checked' : '') + ' onchange="AppPengaturanProfil.handleInputChange(\'showPasien\', this.checked)" class="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500">';
            html += '      </div>';
            // Show Dokter
            html += '      <div class="flex items-center justify-between">';
            html += '        <label for="st-show-dokter" class="text-xs text-slate-600 dark:text-slate-300 font-medium">Tampilkan Nama Dokter (bila ada)</label>';
            html += '        <input type="checkbox" id="st-show-dokter" ' + (d.showDokter ? 'checked' : '') + ' onchange="AppPengaturanProfil.handleInputChange(\'showDokter\', this.checked)" class="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500">';
            html += '      </div>';
            // Show Metode Pembayaran
            html += '      <div class="flex items-center justify-between">';
            html += '        <label for="st-show-bayar" class="text-xs text-slate-600 dark:text-slate-300 font-medium">Tampilkan Metode Pembayaran (Cash/Transfer/QRIS)</label>';
            html += '        <input type="checkbox" id="st-show-bayar" ' + (d.showMetodeBayar ? 'checked' : '') + ' onchange="AppPengaturanProfil.handleInputChange(\'showMetodeBayar\', this.checked)" class="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500">';
            html += '      </div>';

            html += '    </div>';
            html += '  </div>';

            // Bagian Footer Konten
            html += '  <div class="border-b border-slate-100 dark:border-slate-700/60 pb-5">';
            html += '    <h3 class="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><i data-lucide="message-square" class="w-4 h-4 text-primary-500"></i> Konten Footer Struk</h3>';
            html += '    <div class="space-y-3">';
            
            // Footer 1
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Pesan Salam Utama</label>';
            html += '        <input type="text" id="st-f1" value="' + Utils.escapeHtml(d.strukFooter1) + '" oninput="AppPengaturanProfil.handleInputChange(\'strukFooter1\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="Terima Kasih">';
            html += '      </div>';
            // Footer 2
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Pesan Salam Tambahan</label>';
            html += '        <input type="text" id="st-f2" value="' + Utils.escapeHtml(d.strukFooter2) + '" oninput="AppPengaturanProfil.handleInputChange(\'strukFooter2\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="Semoga Lekas Sembuh">';
            html += '      </div>';
            // Teks Footer Struk Lama
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Keterangan / Aturan Retur Struk</label>';
            html += '        <input type="text" id="st-f-retur" value="' + Utils.escapeHtml(d.footerStruk) + '" oninput="AppPengaturanProfil.handleInputChange(\'footerStruk\', this.value)" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs" placeholder="Barang yang sudah dibeli tidak dapat ditukar">';
            html += '      </div>';

            html += '    </div>';
            html += '  </div>';

            // Kertas & Font
            html += '  <div>';
            html += '    <h3 class="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2"><i data-lucide="printer" class="w-4 h-4 text-primary-500"></i> Dimensi & Format Cetak</h3>';
            html += '    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
            // Lebar Kertas
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Lebar Kertas Cetak</label>';
            html += '        <select id="st-width" onchange="AppPengaturanProfil.handleInputChange(\'strukLebar\', this.value)" class="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:outline-none"> ';
            html += '          <option value="58mm" ' + (d.strukLebar === '58mm' ? 'selected' : '') + '>Kertas Kasir Kecil (58mm)</option>';
            html += '          <option value="80mm" ' + (d.strukLebar === '80mm' ? 'selected' : '') + '>Kertas Standar Thermal (80mm)</option>';
            html += '        </select>';
            html += '      </div>';
            // Ukuran Font
            html += '      <div>';
            html += '        <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Ukuran Font Struk</label>';
            html += '        <select id="st-font" onchange="AppPengaturanProfil.handleInputChange(\'strukUkuranFont\', this.value)" class="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:outline-none"> ';
            html += '          <option value="10px" ' + (d.strukUkuranFont === '10px' ? 'selected' : '') + '>Sangat Kecil (10px)</option>';
            html += '          <option value="11px" ' + (d.strukUkuranFont === '11px' ? 'selected' : '') + '>Kecil (11px)</option>';
            html += '          <option value="12px" ' + (d.strukUkuranFont === '12px' ? 'selected' : '') + '>Normal (12px)</option>';
            html += '          <option value="13px" ' + (d.strukUkuranFont === '13px' ? 'selected' : '') + '>Sedang (13px)</option>';
            html += '          <option value="14px" ' + (d.strukUkuranFont === '14px' ? 'selected' : '') + '>Besar (14px)</option>';
            html += '        </select>';
            html += '      </div>';
            html += '    </div>';
            html += '  </div>';

            html += '</div>';
        }

        // Simpan Button Bar
        if (canEdit) {
            html += '<div class="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">';
            html += '  <button type="submit" class="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow-sm shadow-primary-500/10"><i data-lucide="save" class="w-4 h-4"></i> Simpan Perubahan</button>';
            html += '</div>';
        } else {
            html += '<div class="text-center text-xs text-slate-400 pt-4 border-t border-slate-200 dark:border-slate-700">Hanya Admin/Keuangan yang dapat mengubah data ini.</div>';
        }

        html += '</form>';
        container.innerHTML = html;
        lucide.createIcons();

        // Event handler form submit
        if (canEdit) {
            document.getElementById('form-profil-instansi').addEventListener('submit', function(e) {
                e.preventDefault();
                self.simpan();
            });
        }
    },

    handleInputChange: function(key, value) {
        this.data[key] = value;
        // Jika form utama diubah, update otomatis baris-baris struk yang belum dikustomisasi
        if (this.activeTab === 'profil') {
            if (key === 'nama') {
                this.data.strukHeader1 = value.toUpperCase();
            } else if (key === 'alamat') {
                this.data.strukHeader3 = value;
            } else if (key === 'telp') {
                this.data.strukHeader4 = value ? 'Telp: ' + value : '';
            }
        }
        this.updatePreview();
    },

    handleLogoUpload: function(event) {
        var self = this;
        var file = event.target.files[0];
        if (!file) return;

        // Validasi ukuran < 300KB agar aman disimpan dalam dokumen Firestore
        if (file.size > 300000) {
            Utils.toast('Ukuran file logo terlalu besar. Maksimal 300 KB.', 'warning');
            event.target.value = '';
            return;
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            var b64Data = e.target.result;
            self.data.logoStrukB64 = b64Data;
            
            // Update preview file upload secara lokal
            var previewBox = document.getElementById('logo-uploader-preview');
            if (previewBox) {
                previewBox.innerHTML = '<img src="' + b64Data + '" class="max-w-full max-h-full object-contain">';
            }
            
            // Re-render logo actions
            self.renderActiveForm();
            self.updatePreview();
            Utils.toast('Logo terpilih dan ditambahkan ke preview!', 'success');
        };
        reader.readAsDataURL(file);
    },

    removeLogo: function() {
        this.data.logoStrukB64 = '';
        var previewBox = document.getElementById('logo-uploader-preview');
        if (previewBox) {
            previewBox.innerHTML = '<span class="text-[10px] text-slate-400 text-center font-semibold font-sans">No Logo</span>';
        }
        this.renderActiveForm();
        this.updatePreview();
        Utils.toast('Logo struk dihapus', 'info');
    },

    updatePreview: function() {
        var previewContainer = document.getElementById('receipt-preview-content');
        if (!previewContainer) return;

        var d = this.data;
        var html = '';

        // Apply Font Size on paper
        var paperEl = document.getElementById('receipt-preview-paper');
        if (paperEl) {
            paperEl.style.fontSize = d.strukUkuranFont || '12px';
            // Simulasikan lebar kertas
            if (d.strukLebar === '58mm') {
                paperEl.style.maxWidth = '230px';
            } else {
                paperEl.style.maxWidth = '310px';
            }
        }

        // 1. Logo
        if (d.tampilkanLogo) {
            var alignStyle = 'justify-center';
            if (d.logoPosisi === 'left') alignStyle = 'justify-start';
            if (d.logoPosisi === 'right') alignStyle = 'justify-end';
            
            html += '<div class="flex ' + alignStyle + ' mb-2">';
            if (d.logoStrukB64) {
                html += '  <img src="' + d.logoStrukB64 + '" style="width: ' + (d.logoUkuran || 100) + 'px; height: auto;" class="opacity-90">';
            } else {
                // Mock default icon / initial logo
                html += '  <div class="border border-black rounded-full flex items-center justify-center font-bold text-center" style="width: 44px; height: 44px; border-width: 1.5px; font-size: 18px;">';
                html += '    ' + (d.strukHeader1 || d.nama || 'A').charAt(0);
                html += '  </div>';
            }
            html += '</div>';
        }

        // 2. Header Texts
        if (d.strukHeader1) html += '<h3 class="font-bold text-center uppercase tracking-tight" style="font-size: 1.1em; line-height: 1.3;">' + Utils.escapeHtml(d.strukHeader1) + '</h3>';
        if (d.strukHeader2) html += '<p class="text-center" style="font-size: 0.9em; margin-top: 1px;">' + Utils.escapeHtml(d.strukHeader2) + '</p>';
        if (d.strukHeader3) html += '<p class="text-center" style="font-size: 0.85em; margin-top: 1px;">' + Utils.escapeHtml(d.strukHeader3) + '</p>';
        if (d.strukHeader4) html += '<p class="text-center" style="font-size: 0.85em; margin-top: 1px;">' + Utils.escapeHtml(d.strukHeader4) + '</p>';
        if (d.strukHeaderSelesai) html += '<p class="text-center" style="font-size: 0.8em; margin-top: 2px; font-style: italic;">' + Utils.escapeHtml(d.strukHeaderSelesai) + '</p>';
        
        // Divider
        html += '<div class="text-center my-1 select-none font-bold" style="letter-spacing: -1px; color: #000;">--------------------------------</div>';

        // 3. Metadata Body
        html += '<table class="w-full text-[0.9em]" style="color: #000 !important; border: none !important;">';
        html += '  <tr style="background:transparent!important;"><td class="p-0 border-none" style="width:30%;">No Struk</td><td class="p-0 border-none">: TX-089A12B</td></tr>';
        html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">Tanggal</td><td class="p-0 border-none">: ' + new Date().toLocaleDateString('id-ID') + ' 10:45</td></tr>';
        
        if (d.showPasien) {
            html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">Pasien</td><td class="p-0 border-none">: Budi Santoso</td></tr>';
        }
        if (d.showDokter) {
            html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">Dokter</td><td class="p-0 border-none">: dr. Amanda Safitri</td></tr>';
        }
        if (d.showMetodeBayar) {
            html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">Metode</td><td class="p-0 border-none">: TUNAI (CASH)</td></tr>';
        }
        html += '</table>';
        
        // Divider
        html += '<div class="text-center my-1 select-none font-bold" style="letter-spacing: -1px; color: #000;">--------------------------------</div>';

        // 4. Mock Items
        html += '<table class="w-full text-[0.9em]" style="color: #000 !important; border: none !important;">';
        html += '  <tr style="background:transparent!important;"><td colspan="2" class="p-0 border-none">Paracetamol 500mg Tablet (10 Tab)</td></tr>';
        html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">1 Strip x Rp 15.000</td><td class="text-right p-0 border-none">Rp 15.000</td></tr>';
        html += '  <tr style="background:transparent!important;"><td colspan="2" class="p-0 border-none pt-1">Amoxicillin 500mg Kapsul</td></tr>';
        html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">10 Pcs x Rp 2.500</td><td class="text-right p-0 border-none">Rp 25.000</td></tr>';
        html += '</table>';

        // Divider
        html += '<div class="text-center my-1 select-none font-bold" style="letter-spacing: -1px; color: #000;">--------------------------------</div>';

        // 5. Totals
        html += '<table class="w-full text-[0.9em]" style="color: #000 !important; border: none !important;">';
        html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">Total Obat</td><td class="text-right p-0 border-none">Rp 40.000</td></tr>';
        html += '  <tr style="background:transparent!important;"><td class="p-0 border-none">Jasa Resep</td><td class="text-right p-0 border-none">Rp 5.000</td></tr>';
        html += '  <tr class="font-bold border-none" style="background:transparent!important;"><td class="p-0 border-none">TOTAL AKHIR</td><td class="text-right p-0 border-none">Rp 45.000</td></tr>';
        html += '</table>';

        // Divider
        html += '<div class="text-center my-1 select-none font-bold" style="letter-spacing: -1px; color: #000;">--------------------------------</div>';

        // 6. Footer Messages
        if (d.strukFooter1) html += '<p class="text-center text-[0.9em] font-semibold">' + Utils.escapeHtml(d.strukFooter1) + '</p>';
        if (d.strukFooter2) html += '<p class="text-center text-[0.9em] font-semibold mt-0.5">' + Utils.escapeHtml(d.strukFooter2) + '</p>';
        if (d.footerStruk) html += '<p class="text-center text-[0.8em] mt-1 text-slate-700 italic" style="color: #334155 !important;">* ' + Utils.escapeHtml(d.footerStruk) + ' *</p>';

        previewContainer.innerHTML = html;
    },

    simpan: function() {
        var self = this;
        Utils.toast('Menyimpan...', 'info');
        
        // Simpan langsung seluruh data objek profil
        var dataToSave = Object.assign({}, this.data, {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        db.collection('pengaturan').doc('profil').set(dataToSave, { merge: true })
            .then(function() {
                Utils.toast('Semua perubahan berhasil disimpan!', 'success');
                self.init();
            })
            .catch(function(err) {
                Utils.toast('Gagal menyimpan: ' + err.message, 'error');
            });
    }
};
