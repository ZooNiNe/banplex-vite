// cypress/e2e/1-app-load.cy.js

describe('Tes Pemuatan Aplikasi', () => {
  it('Harusnya bisa membuka halaman login dengan benar', () => {
    // Langkah 1: Mengunjungi alamat utama aplikasi (ini akan menggunakan baseUrl dari konfigurasimu)
    cy.visit('/');

    // Langkah 2: Mencari teks 'Selamat Datang di BanPlex'.
    // Ini untuk memastikan halaman yang benar sudah termuat.
    // '.should('be.visible')' berarti teks itu harus terlihat oleh pengguna.
    cy.contains('Selamat Datang di BanPlex').should('be.visible');
  });
});