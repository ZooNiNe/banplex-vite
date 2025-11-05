// cypress.config.js

// 👇 Ganti semua 'import' menjadi 'require'
const { defineConfig } = require("cypress");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// 👇 Baca file serviceAccount.json dengan cara Node.js (CommonJS)
// Ini adalah cara yang lebih tradisional dan tidak butuh 'await'
const pathToServiceAccount = path.resolve(__dirname, 'serviceAccount.json');
const serviceAccount = JSON.parse(fs.readFileSync(pathToServiceAccount, 'utf8'));

// Inisialisasi Firebase Admin
// (Perhatikan, kita tidak pakai .default lagi karena cara membacanya berbeda)
if (admin.apps.length === 0) { // Mencegah inisialisasi ganda
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// 👇 Gunakan module.exports alih-alih 'export default'
module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    setupNodeEvents(on, config) {
      // Implementasikan 'task' di sini
      on("task", {
        async customLogin(email) {
          try {
            let user;
            try {
              user = await admin.auth().getUserByEmail(email);
            } catch (error) {
              if (error.code === 'auth/user-not-found') {
                user = await admin.auth().createUser({ email });
              } else {
                throw error;
              }
            }
            const customToken = await admin.auth().createCustomToken(user.uid);
            return customToken;
          } catch (error) {
            console.error("Firebase customLogin task error:", error);
            return null;
          }
        },
      });
    },
  },
});