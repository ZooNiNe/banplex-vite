/*
 * File: js/ui/pages/jobApplicantFieldMap.js
 * REVISI: Penambahan kunci untuk URL lampiran.
 */

const APPLICANT_FIELD_KEYS = {
    // Data Personal & Kontak
    namaLengkap: ['namaLengkap', 'nama_lengkap', 'nama', 'namaPenerima', 'namaPelamar', 'NAMA', 'NAMA '],
    nik: ['nik', 'NIK', 'noKtp', 'no_ktp'],
    noKk: ['noKk', 'no_kk', 'kk', 'NO KK', 'NO_KK', 'NOMOR KK'],
    email: ['email', 'EMAIL', 'alamatEmail', 'alamat_email'],
    noTelepon: ['noTelepon', 'no_telepon', 'hp', 'noHp', 'phone', 'whatsapp'],
    jenisKelamin: ['jenisKelamin', 'jenis_kelamin', 'gender', 'JENIS KELAMIN'],
    tempatLahir: ['tempatLahir', 'tempat_lahir', 'TEMPAT LAHIR'],
    tanggalLahir: ['tanggalLahir', 'tanggal_lahir', 'tglLahir', 'TANGGAL LAHIR'],
    
    // Data Alamat
    alamatLengkap: ['alamatLengkap', 'alamat', 'alamatKtp', 'ALAMAT'],
    alamatDomisili: ['alamatDomisili', 'domisili', 'alamatSekarang', 'ALAMAT DOMISILI'],
    district: ['district', 'kabupaten', 'kota', 'kabupatenKota'],
    subDistrict: ['subDistrict', 'kecamatan'],
    village: ['village', 'kelurahan', 'desa'],
    hamlet: ['hamlet', 'dusun', 'kampung'],
    rt: ['rt', 'RT'],
    rw: ['rw', 'RW'],

    // Data Lamaran
    posisiDilamar: ['posisiDilamar', 'posisi_dilamar', 'posisi', 'jabatan', 'melamarSebagai'],
    sumberLowongan: ['sumberLowongan', 'sumber_lowongan', 'source', 'dapatInfoDari'],
    statusAplikasi: ['statusAplikasi', 'status_aplikasi', 'applicationStatus', 'status', 'dataStatus'],
    
    // Data Kualifikasi
    pendidikanTerakhir: ['pendidikanTerakhir', 'pendidikan_terakhir', 'pendidikan'],
    jurusan: ['jurusan', 'programStudi', 'major'],
    namaInstitusiPendidikan: ['namaInstitusiPendidikan', 'institusi', 'universitas', 'sekolah', 'kampus'],
    pengalamanKerja: ['pengalamanKerja', 'pengalaman_kerja', 'workExperience', 'pengalaman'],
    skills: ['skills', 'keahlian', 'skill', 'kompetensi'],
    
    // --- BARU: URL Lampiran ---
    urlKtp: ['urlKtp', 'url_ktp', 'linkKtp', 'ktp'],
    urlKk: ['urlKk', 'url_kk', 'linkKk', 'kk'],
    urlPasFoto: ['urlPasFoto', 'url_pas_foto', 'linkPasFoto', 'pasFoto'],
    urlSuratSehat: ['urlSuratSehat', 'url_surat_sehat', 'linkSuratSehat', 'suratSehat'],
    urlLainnya: ['urlLainnya', 'url_lainnya', 'linkLainnya', 'attachments'],

    // Data Internal HRD
    catatanHrd: ['catatanHrd', 'catatan_hrd', 'notes', 'catatan'],
    
    // (Opsional) Bidang lama untuk kompatibilitas
    usiaLengkap: ['usiaLengkap', 'USIA LENGKAP', 'usia_lengkap'],
    umur: ['umur', 'UMUR'],
    namaInstansi: ['namaInstansi', 'instansi', 'NAMA INSTANSI'],
};

export { APPLICANT_FIELD_KEYS };