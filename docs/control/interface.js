(function () {
  const actions = document.querySelector('.header-actions');
  const help = document.getElementById('panelHelp');
  if (actions && help) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary';
    button.textContent = 'Помощь'; button.onclick = () => help.showModal();
    actions.appendChild(button);
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.getElementById('appView')?.classList.remove('menu-open');
  });
})();
