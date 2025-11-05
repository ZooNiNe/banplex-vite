Module Checklist
js/config.js: ✅ Hanya konstanta, tidak ada side-effects.

js/firebase.js: ✅ Hanya inisialisasi & referensi, tidak ada logika UI.

js/state.js: ⚠️ Sebagian besar murni, tetapi beberapa fungsi utilitas form tidak diekspor.

js/utils/helpers.js: ✅ Murni fungsi utilitas.

js/utils/auth.js: ✅ Terisolasi untuk otentikasi.

js/utils/form.js: ❌ Kritis: Berisi banyak fungsi utilitas tetapi tidak ada yang diekspor.

js/utils/ui.js: ❌ Kritis: Melanggar aturan layering dengan mengimpor dari js/pages/pengeluaran.js dan js/pages/crud.js.

js/pages/pemasukan.js: ✅ Memenuhi invariant dengan mengimpor _calculateAndCacheDashboardTotals dari js/pages/dashboard.js.

js/router.js: ⚠️ Mengimpor modul yang tidak ada (sampah.js).

js/main.js: ⚠️ Sedikit pelanggaran layering dengan mengimpor langsung dari L4 (pages/dashboard.js).