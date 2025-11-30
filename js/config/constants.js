export const TEAM_ID = 'main';
export const OWNER_EMAIL = 'dq060412@gmail.com';

export const ALL_NAV_LINKS = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'pemasukan', icon: 'account_balance_wallet', label: 'Pemasukan', roles: ['Owner', 'Editor'] },
    { id: 'pengeluaran', icon: 'post_add', label: 'Pengeluaran', roles: ['Owner', 'Editor'] },
    { id: 'mutasi', icon: 'clipboard-list', label: 'Mutasi', roles: ['Owner', 'Editor', 'Viewer'] }, // BARU
    { id: 'absensi', icon: 'person_check', label: 'Absensi', roles: ['Owner', 'Editor'] },
    { id: 'jurnal', icon: 'summarize', label: 'Jurnal', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'stok', icon: 'inventory_2', label: 'Stok', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'tagihan', icon: 'receipt_long', label: 'Tagihan', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'laporan', icon: 'monitoring', label: 'Laporan', roles: ['Owner', 'Viewer', 'Editor'] },
    { id: 'file_storage', icon: 'database', label: 'File Storage', roles: ['Owner', 'Editor'] },
    { id: 'file_storage_form', icon: 'file_plus', label: 'Input File Storage', roles: ['Owner', 'Editor'] },
    { id: 'hrd_applicants', icon: 'users', label: 'Database Pelamar', roles: ['Owner', 'Editor'] },
    { id: 'hrd_applicants_form', icon: 'user-plus', label: 'Input Pelamar', roles: ['Owner', 'Editor'] },
    { id: 'log_aktivitas', icon: 'activity', label: 'Log Aktivitas', roles: ['Owner'] }, // BARU (Pindah dari hidden)
    { id: 'recycle_bin', icon: 'trash-2', label: 'Keranjang Sampah', roles: ['Owner', 'Editor'] }, // BARU (Pindah dari hidden)
    { id: 'pengaturan', icon: 'settings', label: 'Pengaturan', roles: ['Owner', 'Editor', 'Viewer'] },
];

export const BOTTOM_NAV_BY_ROLE = {
    Owner: ['dashboard', 'jurnal', 'tagihan', 'pemasukan', 'pengaturan'],
    Editor: ['dashboard', 'jurnal', 'tagihan', 'pemasukan', 'pengaturan'],
    Viewer: ['dashboard', 'jurnal', 'tagihan', 'laporan', 'pengaturan']
};

export const AUTO_REBASE_TABLES = new Set(['expenses', 'bills', 'incomes', 'funding_sources']);

export const masterDataConfig = {
      'projects': {
          collection: 'projectsCol',
          stateKey: 'projects',
          dbTable: 'projects',
          nameField: 'projectName',
          title: 'Proyek'
      },
      'creditors': {
          collection: 'fundingCreditorsCol',
          stateKey: 'fundingCreditors',
          dbTable: 'funding_creditors',
          nameField: 'creditorName',
          title: 'Kreditur'
      },
      'op-cats': {
          collection: 'opCatsCol',
          stateKey: 'operationalCategories',
          dbTable: 'operational_categories',
          nameField: 'categoryName',
          title: 'Kategori Operasional'
      },
      'other-cats': {
          collection: 'otherCatsCol',
          stateKey: 'otherCategories',
          dbTable: 'other_categories',
          nameField: 'categoryName',
          title: 'Kategori Lainnya'
      },
      'suppliers': {
          collection: 'suppliersCol',
          stateKey: 'suppliers',
          dbTable: 'suppliers',
          nameField: 'supplierName',
          title: 'Supplier'
      },
      'professions': {
          collection: 'professionsCol',
          stateKey: 'professions',
          dbTable: 'professions',
          nameField: 'professionName',
          title: 'Profesi'
      },
      'workers': {
          collection: 'workersCol',
          stateKey: 'workers',
          dbTable: 'workers',
          nameField: 'workerName',
          title: 'Pekerja'
      },
      'staff': {
          collection: 'staffCol',
          stateKey: 'staff',
          dbTable: 'staff',
          nameField: 'staffName',
          title: 'Staf Inti'
      },
      'materials': {
          collection: 'materialsCol',
          stateKey: 'materials',
          dbTable: 'materials',
          nameField: 'materialName',
          title: 'Material'
      },
  };
