
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW enregistré avec succès:', reg.scope);
    }).catch(err => {
      console.warn('Erreur enregistrement SW:', err);
    });
  });
}
