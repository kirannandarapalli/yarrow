(function () {
  let theme = "dark";
  try {
    if (localStorage.getItem("blockee-theme") === "light") theme = "light";
  } catch (err) {
    theme = "dark";
  }
  document.documentElement.dataset.theme = theme;
})();
