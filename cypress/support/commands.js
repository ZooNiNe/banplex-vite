Cypress.Commands.add("login", (email) => {
    cy.task("customLogin", email).then((token) => {
      cy.window().then((win) => {
        const { auth, signInWithCustomToken } = win.cypressAuth;
        return signInWithCustomToken(auth, token);
      });
    });
  });