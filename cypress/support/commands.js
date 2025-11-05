// cypress/support/commands.js

Cypress.Commands.add("login", (email) => {
    cy.task("customLogin", email).then((token) => {
      cy.window().then((win) => {
        // Kita tidak perlu menunggu lagi, karena kodenya dijamin ada.
        const { auth, signInWithCustomToken } = win.cypressAuth;
        return signInWithCustomToken(auth, token);
      });
    });
  });