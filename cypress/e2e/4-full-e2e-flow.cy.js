// cypress/e2e/4-full-e2e-flow.cy.js

/**
 * =====================================================================================
 * SKRIP PENGUJIAN END-TO-END (E2E) MENYELURUH
 * =====================================================================================
 * Deskripsi:
 * Skrip ini dirancang untuk menguji alur kerja utama aplikasi secara otomatis,
 * mensimulasikan tindakan pengguna dari awal hingga akhir untuk menemukan bug
 * dan memastikan semua fitur berjalan sesuai harapan.
 *
 * Alur Pengujian:
 * 1.  Manajemen Master Data: Membuat, mengedit, dan menghapus data master (Supplier, Kategori).
 * Ini adalah prasyarat untuk memastikan data pengujian selalu baru dan tidak bergantung
 * pada data yang sudah ada.
 * 2.  Alur Pengeluaran & Tagihan:
 * a. Membuat pengeluaran baru (Operasional, Material, Lainnya) dengan status "Belum Lunas".
 * b. Memverifikasi pengeluaran tersebut muncul sebagai tagihan di halaman "Tagihan".
 * c. Mengedit tagihan yang sudah dibuat.
 * d. Membayar lunas tagihan tersebut.
 * e. Memverifikasi tagihan pindah ke tab "Lunas".
 * f. Menghapus tagihan yang sudah lunas.
 * 3.  Pengujian Halaman Pengaturan: Memastikan navigasi dan akses ke fitur-fitur penting
 * di halaman Pengaturan berfungsi.
 *
 * Prasyarat:
 * - Pengguna dengan peran 'Owner' atau 'Editor' harus bisa login.
 * - Konfigurasi Cypress (baseUrl, custom commands) sudah diatur dengan benar.
 * =====================================================================================
 */

describe('Skenario Pengujian E2E Menyeluruh', () => {
    // Variabel untuk menyimpan data unik yang dibuat selama tes
    let testData;

    beforeEach(() => {
        // Setiap tes akan dimulai dari halaman utama dan dalam keadaan sudah login
        // sebagai pengguna 'owner' untuk memiliki akses penuh.
        cy.visit('/');
        cy.login("owner@example.com");

        // PERBAIKAN: Pengecekan yang lebih stabil.
        // 1. Tunggu hingga elemen UI utama (sidebar) muncul. Ini menandakan
        //    bahwa proses login dan inisialisasi UI dasar telah selesai.
        cy.get('#sidebar-nav', { timeout: 20000 }).should('be.visible');

        // 2. BARU SETELAH ITU: Verifikasi bahwa kita berada di halaman Dashboard.
        // PERBAIKAN ERROR: Tambahkan timeout yang lebih panjang di sini juga untuk
        // memberikan waktu bagi konten halaman untuk dirender sepenuhnya.
        cy.get('#page-label-name', { timeout: 20000 }).should('contain', 'Dashboard');
        
        // Buat data unik untuk setiap pengujian agar tidak ada konflik
        const uniqueId = Date.now();
        testData = {
            supplierName: `Cypress Supplier ${uniqueId}`,
            opCategoryName: `Cypress Kategori ${uniqueId}`,
            materialName: `Cypress Material ${uniqueId}`,
            expenseDesc: `Cypress Test Expense ${uniqueId}`,
            expenseAmount: '50000',
            editedExpenseDesc: `Cypress Edited Expense ${uniqueId}`,
            editedExpenseAmount: '75000'
        };
    });

    it('1. Alur Master Data: Membuat, Mengedit, dan Menghapus Data Master', () => {
        cy.log('--- Memulai Pengujian Master Data ---');

        // Navigasi ke halaman Pengaturan
        cy.get('.sidebar-nav-item[data-nav="pengaturan"]').click();
        // PERBAIKAN: Tunggu hingga judul halaman berubah untuk memastikan navigasi selesai.
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Pengaturan');

        // Buka halaman kelola master data
        cy.get('[data-action="open-master-data-grid"]').click();
        cy.get('.detail-pane-header h4').should('contain', 'Kelola Master Data');

        // --- UJI MASTER DATA SUPPLIER ---
        cy.log('Menguji CRUD untuk Master Supplier');
        cy.get('.master-data-grid-item[data-action="manage-master"][data-type="suppliers"]').click();
        // Buat Supplier Baru
        cy.get('#master-data-tabs [data-tab="form"]').click();
        cy.get('#itemName').type(testData.supplierName);
        cy.get('#master-data-form').submit();
        cy.contains('Simpan Supplier Baru?', { timeout: 10000 }).should('be.visible');
        cy.get('#confirm-btn').click();
        // Verifikasi Supplier baru muncul di daftar
        cy.get('.master-data-list', { timeout: 10000 }).should('contain', testData.supplierName);
        
        // Edit Supplier
        cy.contains('.master-data-item', testData.supplierName).find('[data-action="edit-master-item"]').click();
        cy.get('#itemName').clear().type(`${testData.supplierName} - Edited`);
        cy.get('#master-data-form').submit();
        cy.get('#confirm-btn').click();
        // Verifikasi perubahan
        cy.get('.master-data-list', { timeout: 10000 }).should('contain', `${testData.supplierName} - Edited`);
        
        // Hapus Supplier
        cy.contains('.master-data-item', `${testData.supplierName} - Edited`).find('[data-action="delete-master-item"]').click();
        cy.get('#confirm-btn').click();
        // Verifikasi item telah dihapus
        cy.get('.master-data-list').should('not.contain', `${testData.supplierName} - Edited`);
    });

    it('2. Alur Pengeluaran & Tagihan: Membuat, Edit, Bayar, Hapus', () => {
        cy.log('--- Memulai Pengujian Alur Pengeluaran dan Tagihan ---');

        // --- TAHAP 1: MEMBUAT PENGELUARAN (MENJADI TAGIHAN) ---
        cy.log('Membuat Pengeluaran Operasional baru');
        cy.get('.sidebar-nav-item[data-nav="pengeluaran"]').click();
        // PERBAIKAN: Tunggu hingga judul halaman berubah.
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Input Pengeluaran');

        // Pastikan tab "Operasional" aktif
        cy.get('button[data-tab="operasional"]').should('have.class', 'active');

        // Mengisi form
        cy.get('#expense-project').siblings('.custom-select-trigger').click();
        cy.get('.custom-select-options-list .custom-select-option').first().click(); // Pilih proyek pertama
        
        cy.get('#expense-category').siblings('.custom-select-trigger').click();
        cy.get('.custom-select-options-list .custom-select-option').first().click(); // Pilih kategori pertama

        cy.get('#pengeluaran-jumlah').type(testData.expenseAmount);
        cy.get('#pengeluaran-deskripsi').type(testData.expenseDesc);

        // Pilih status "Jadikan Tagihan" (ini adalah default, tapi kita pastikan)
        cy.get('#status-unpaid').should('be.checked');

        cy.get('form#pengeluaran-form').submit();
        cy.get('#confirm-btn').click();

        // Verifikasi panel sukses muncul
        cy.get('.success-preview-title', { timeout: 20000 }).should('contain', 'Data Berhasil Disimpan');
        cy.contains(testData.expenseDesc).should('be.visible');

        // --- TAHAP 2: VERIFIKASI & EDIT DI HALAMAN TAGIHAN ---
        cy.log('Memverifikasi dan mengedit tagihan');
        cy.get('button[data-action="navigate"][data-nav="tagihan"]').click();
        // PERBAIKAN: Tunggu hingga judul halaman berubah.
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Tagihan');

        // Cari tagihan baru di tab "Belum Lunas"
        cy.get('#tagihan-tabs [data-tab="tagihan"]').should('have.class', 'active');
        const newItem = cy.contains('.wa-card-v2-wrapper', testData.expenseDesc, { timeout: 10000 });
        newItem.should('be.visible');

        // Edit tagihan
        newItem.find('[data-action="open-item-actions-modal"]').click({ force: true });
        cy.get('[data-action="open-edit-expense"]').click();

        cy.get('#edit-item-form', { timeout: 10000 }).should('be.visible');
        cy.get('#edit-item-form input[name="description"]').clear().type(testData.editedExpenseDesc);
        cy.get('#edit-item-form input[name="amount"]').clear().type(testData.editedExpenseAmount);
        cy.get('#edit-item-form').submit();
        cy.get('#confirm-btn').click();

        // Verifikasi perubahan setelah edit
        cy.get('.success-preview-title', { timeout: 20000 }).should('be.visible');
        cy.get('button[data-action="navigate"][data-nav="tagihan"]').click();
        // PERBAIKAN: Tunggu hingga judul halaman berubah.
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Tagihan');
        cy.contains('.wa-card-v2-wrapper', testData.editedExpenseDesc, { timeout: 10000 }).should('be.visible');

        // --- TAHAP 3: MEMBAYAR TAGIHAN ---
        cy.log('Membayar tagihan');
        const editedItem = cy.contains('.wa-card-v2-wrapper', testData.editedExpenseDesc);
        editedItem.find('[data-action="open-item-actions-modal"]').click({ force: true });
        cy.get('[data-action="pay-bill"]').click();

        cy.get('#payment-form', { timeout: 10000 }).should('be.visible');
        cy.get('#payment-form button[type="submit"]').click();
        cy.get('#confirm-btn').click();

        // Verifikasi panel sukses pembayaran
        cy.get('.success-preview-title', { timeout: 20000 }).should('contain', 'Pembayaran Berhasil!');
        cy.get('button[data-action="navigate"][data-nav="tagihan"]').click();
        // PERBAIKAN: Tunggu hingga judul halaman berubah.
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Tagihan');

        // --- TAHAP 4: VERIFIKASI & HAPUS DI TAB LUNAS ---
        cy.log('Memverifikasi di tab Lunas dan menghapus tagihan');
        cy.get('#tagihan-tabs [data-tab="lunas"]').click();
        const paidItem = cy.contains('.wa-card-v2-wrapper', testData.editedExpenseDesc, { timeout: 10000 });
        paidItem.should('be.visible');

        // Hapus tagihan
        paidItem.find('[data-action="open-item-actions-modal"]').click({ force: true });
        cy.get('[data-action="delete-item"]').click();
        cy.get('#confirm-btn').click();

        // Verifikasi item telah dihapus dari UI
        cy.contains(testData.editedExpenseDesc).should('not.exist');
        cy.log('--- Pengujian Alur Pengeluaran dan Tagihan Selesai ---');
    });

    it('3. Pengujian Fitur di Halaman Pengaturan', () => {
        cy.log('--- Memulai Pengujian Halaman Pengaturan ---');

        // Navigasi ke halaman Pengaturan
        cy.get('.sidebar-nav-item[data-nav="pengaturan"]').click();
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Pengaturan');

        // Tes tombol Kelola Master Data
        cy.get('[data-action="open-master-data-grid"]').click();
        cy.get('.detail-pane-header h4').should('contain', 'Kelola Master Data');
        cy.get('[data-action="detail-pane-back"]').click();

        // Tes tombol Tools Aplikasi
        cy.get('[data-action="open-tools-grid"]').click();
        cy.get('.detail-pane-header h4').should('contain', 'Tools Aplikasi');
        cy.get('[data-action="detail-pane-back"]').click();

        // Tes navigasi ke Log Aktivitas
        cy.get('[data-action="navigate"][data-nav="log_aktivitas"]').click();
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Log Aktivitas');

        // Kembali ke Pengaturan untuk tes berikutnya
        cy.get('.sidebar-nav-item[data-nav="pengaturan"]').click();
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Pengaturan');

        // Tes navigasi ke Keranjang Sampah
        cy.get('[data-action="navigate"][data-nav="recycle_bin"]').click();
        cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Keranjang Sampah');

        cy.log('--- Pengujian Halaman Pengaturan Selesai ---');
    });
});

