// cypress/e2e/2-auth.cy.js

describe('Tes Alur Autentikasi', () => {
    beforeEach(() => {
        cy.visit('/');
        cy.login("test.user@example.com");
      });
          
    it('Setelah login, harusnya menampilkan halaman Dashboard dan bisa logout', () => {
      // Kita tidak butuh cy.pause() lagi!
  
      // Langkah 1: Verifikasi bahwa kita sudah berada di halaman Dashboard.
      cy.get('#page-label-name', { timeout: 10000 }).should('contain', 'Dashboard');
  
      // Langkah 2: Verifikasi bahwa nama pengguna muncul di sidebar.
      cy.get('.profile-name-sm').should('not.be.empty');
  
      // Langkah 3: Uji alur logout.
      cy.contains('Pengaturan').click();
      cy.get('button[data-action="auth-action"]').contains('Keluar').click();
  
// Klik tombol 'Keluar' yang pertama.
cy.get('button[data-action="auth-action"]').contains('Keluar').click();

// 👇 TAMBAHKAN DUA BARIS INI UNTUK DEBUGGING 👇
cy.log('--- TES DIJEDA, PERIKSA MODAL KONFIRMASI SEKARANG ---');
cy.pause();
// ===============================================

// Baris ini yang sebelumnya gagal
cy.get('#confirm-btn').contains('Keluar').click();

      // Langkah 5: Verifikasi bahwa kita sudah kembali ke halaman login.
      cy.contains('Selamat Datang di BanPlex').should('be.visible');
    });
  });