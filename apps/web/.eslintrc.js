module.exports = {
  extends: ["@allohq/eslint-config"],
  rules: {
    // App copy intentionally uses natural apostrophes. React escapes text nodes.
    "react/no-unescaped-entities": "off",
    // The visual concept pages include literal CSS-style annotation text.
    "react/jsx-no-comment-textnodes": "off",
  },
};
