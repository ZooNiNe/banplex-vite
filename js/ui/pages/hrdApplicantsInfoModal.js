import { emit } from '../../state/eventBus.js';

function createInfoIconSVG() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
    `;
}

function createHrdInfoButton(infoKey, extraClass = '') {
    if (!infoKey) return '';
    const className = ['btn-icon', 'btn-icon--info', extraClass].filter(Boolean).join(' ');
    return `
        <button type="button" class="${className}" data-action="show-hrd-info" data-info-key="${infoKey}" title="Klik untuk info lebih lanjut">
            ${createInfoIconSVG()}
        </button>
    `;
}

function createIlustration(iconName) {
    const icons = {
        clipboard: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
        users: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        globe: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
    };
    return `<div class="modal-info-ilustration">${icons[iconName] || icons['clipboard']}</div>`;
}

function getHrdInfoModalContent(key) {
    let title = 'Informasi';
    let contentHTML = '';

    switch (key) {
        case 'status':
            title = 'Penjelasan Status Aplikasi';
            contentHTML = `
                <div class="modal-info-list">
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Lamaran Diterima</h3>
                            <p><strong>Deskripsi:</strong> Lamaran kandidat (CV, portofolio, dll.) telah diterima oleh sistem atau tim HRD. Ini adalah tahap paling awal.</p>
                            <p><strong>Tindakan Lanjutan:</strong> Belum ada. Lamaran menunggu untuk ditinjau (Screening).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('search')}
                        <div>
                            <h3>Screening</h3>
                            <p><strong>Deskripsi:</strong> Tim HRD sedang meninjau lamaran untuk mencocokkan kualifikasi kandidat dengan persyaratan pekerjaan (pengalaman, pendidikan, skills).</p>
                            <p><strong>Tindakan Lanjutan:</strong> Jika lolos, kandidat akan dihubungi untuk 'Interview HR'. Jika tidak, status akan diubah menjadi 'Ditolak'.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>Interview HR</h3>
                            <p><strong>Deskripsi:</strong> Kandidat melakukan wawancara dengan tim HRD. Fokusnya adalah pada perkenalan, latar belakang, soft skills, dan kecocokan budaya (cultural fit).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>Interview User</h3>
                            <p><strong>Deskripsi:</strong> Kandidat melakukan wawancara dengan calon atasan langsung (user) atau manajer departemen terkait. Fokusnya adalah pada hard skills dan kemampuan teknis.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Psikotes</h3>
                            <p><strong>Deskripsi:</strong> Kandidat mengerjakan serangkaian tes psikologi untuk menilai kepribadian, kemampuan kognitif, dan gaya kerja.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('check')}
                        <div>
                            <h3>Offering</h3>
                            <p><strong>Deskripsi:</strong> Perusahaan mengajukan penawaran kerja resmi (offering letter) yang berisi rincian gaji, tunjangan, dan tanggal mulai.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('check')}
                        <div>
                            <h3>Diterima</h3>
                            <p><strong>Deskripsi:</strong> Kandidat telah menerima penawaran kerja. Proses rekrutmen selesai.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('x')}
                        <div>
                            <h3>Ditolak</h3>
                            <p><strong>Deskripsi:</strong> Kandidat tidak lolos di salah satu tahap (Screening, Interview, Tes, dll.).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('x')}
                        <div>
                            <h3>Daftar Hitam (Blacklist)</h3>
                            <p><strong>Deskripsi:</strong> Kandidat tidak akan diproses untuk lowongan apapun di masa depan karena alasan serius (misal: pemalsuan data, perilaku tidak profesional, dll.).</p>
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'sumber':
            title = 'Penjelasan Sumber Lowongan';
            contentHTML = `
                <div class="modal-info-list">
                    <div class="modal-info-item">
                        ${createIlustration('globe')}
                        <div>
                            <h3>Website Karir</h3>
                            <p><strong>Deskripsi:</strong> Kandidat melamar langsung melalui halaman karir di website resmi perusahaan Anda.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Job Portal (Jobstreet, etc)</h3>
                            <p><strong>Deskripsi:</strong> Lamaran datang dari platform pencari kerja pihak ketiga seperti Jobstreet, Glints, Kalibrr, dan sejenisnya.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>LinkedIn</h3>
                            <p><strong>Deskripsi:</strong> Lamaran datang dari platform LinkedIn, baik melalui fitur "Easy Apply" atau dihubungi langsung oleh perekrut (sourced).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('globe')}
                        <div>
                            <h3>Media Sosial (IG, FB, etc)</h3>
                            <p><strong>Deskripsi:</strong> Kandidat menemukan info lowongan dan melamar melalui platform media sosial seperti Instagram, Facebook, Twitter (X), atau TikTok.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>Referral Karyawan</h3>
                            <p><strong>Deskripsi:</strong> Kandidat direkomendasikan oleh karyawan internal yang sudah bekerja di perusahaan.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Job Fair</h3>
                            <p><strong>Deskripsi:</strong> Lamaran diterima secara fisik (atau digital) saat acara bursa kerja (Job Fair).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('search')}
                        <div>
                            <h3>Lainnya</h3>
                            <p><strong>Deskripsi:</strong> Sumber lain yang tidak termasuk dalam kategori di atas (misal: walk-in, lamaran via email umum, dll.).</p>
                        </div>
                    </div>
                </div>
            `;
            break;
        default:
            contentHTML = `
                <div class="modal-info-list">
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Panduan Informasi</h3>
                            <p>Data penjelasan tidak ditemukan untuk kategori tersebut.</p>
                        </div>
                    </div>
                </div>
            `;
            break;
    }

    contentHTML = `
        <div class="modal-info-content">
            ${contentHTML}
            <footer class="modal-credit">
                Sumber Informasi: Proses Bisnis Internal HRD
            </footer>
        </div>
    `;

    return { title, contentHTML };
}

function showHrdInfoModal(key) {
    const { title, contentHTML } = getHrdInfoModalContent(key);
    emit('ui.modal.create', 'formView', {
        title,
        content: contentHTML,
        footer: '',
        layoutClass: 'modal-large',
    });
}

export { createHrdInfoButton, showHrdInfoModal };
