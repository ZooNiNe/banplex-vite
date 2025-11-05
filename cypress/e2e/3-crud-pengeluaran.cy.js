// cypress/e2e/3-crud-pengeluaran.cy.js

describe('Tes Alur CRUD (Create, Read, Update, Delete) Pengeluaran', () => {
    beforeEach(() => {
      // Kunjungi halaman DULU
      cy.visit('/');
      // BARU login
      cy.login("owner@example.com");
    });
  
    it('Harusnya bisa membuat pengeluaran operasional dan memverifikasinya di halaman Tagihan', () => {
      // --- LANGKAH JEDA YANG CERDAS ---
      // Tunggu hingga judul halaman 'Dashboard' muncul (maksimal 10 detik).
      // Ini adalah sinyal bahwa aplikasi sudah selesai login dan siap digunakan.
      cy.get('#page-label-name', { timeout: 20000 }).should('contain', 'Dashboard');
  
      const deskripsiUnik = 'Cypress - Beli Kopi ' + Date.now();
      const jumlahPengeluaran = '25000';
  
      // --- TAHAP 1: MEMBUAT PENGELUARAN ---
  
      // 1. Sekarang aman untuk mencari dan mengklik 'Pengeluaran'.
      cy.contains('Pengeluaran').click();
  
      // 2. Verifikasi bahwa kita sudah berada di halaman yang benar.
      cy.get('#page-label-name').should('contain', 'Pengeluaran');
  
      // 3. Pastikan tab "Operasional" aktif.
      cy.get('button[data-tab="operasional"]').should('have.class', 'active');
  
      // 4. Interaksi dengan dropdown kustom untuk memilih Proyek.
      cy.get('#expense-project').siblings('.custom-select-trigger').click();
      cy.get('.custom-select-options-list .custom-select-option').first().click();
  
      // 5. Isi form lainnya.
      cy.get('#pengeluaran-jumlah').type(jumlahPengeluaran);
      cy.get('#pengeluaran-deskripsi').type(deskripsiUnik);
  
      // 6. Klik tombol "Simpan Pengeluaran".
      cy.get('form#pengeluaran-form').submit();
  
      // --- TAHAP 2: VERIFIKASI PEMBUATAN ---
  
      // 7. Tunggu hingga panel konfirmasi muncul.
      cy.contains('Data Berhasil Ditambahkan', { timeout: 20000 }).should('be.visible');
  
      // 8. Cek detail di panel konfirmasi.
      cy.contains(deskripsiUnik).should('be.visible');
      cy.contains('Rp 25.000').should('be.visible');
      
      // --- TAHAP 3: VERIFIKASI DI HALAMAN LAIN ---
  
      // 9. Klik tombol navigasi ke halaman Tagihan.
      cy.get('button[data-action="navigate"][data-nav="tagihan"]').click();
  
      // 10. Pastikan sudah pindah ke halaman Tagihan.
      cy.get('#page-label-name').should('contain', 'Tagihan');
  
      // 11. Cari tagihan baru di daftar.
      cy.contains(deskripsiUnik, { timeout: 20000 }).should('be.visible');
    });
  });