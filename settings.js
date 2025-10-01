(() => {
  'use strict';

  const root   = document.documentElement;
  const picker = document.getElementById('mainColorPicker');

  function apply(hex){
    root.style.setProperty('--main-color', hex);
    try { localStorage.setItem('d20.main-color', hex); } catch(_) {}
    window.dispatchEvent(new CustomEvent('main-color-changed', { detail: hex }));
  }

  const saved = (() => { try { return localStorage.getItem('d20.main-color'); } catch(_){ return null; } })();
  const cssCurrent = getComputedStyle(root).getPropertyValue('--main-color').trim() || '#9b78dc';
  const start = saved || cssCurrent;

  picker.value = start.startsWith('#') ? start : '#9b78dc';
  apply(start);

  picker.addEventListener('input',  e => apply(e.target.value));
  picker.addEventListener('change', e => apply(e.target.value));
})();
