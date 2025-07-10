document.addEventListener('DOMContentLoaded', () => {
    // Get the stored language from localStorage
    const currentLang = localStorage.getItem('moodFmLang') || 
                      (navigator.language.startsWith('fr') ? 'fr' : 'en');
    
    document.documentElement.lang = currentLang;
    
    const subtitle = document.querySelector('.header-subtitle');
    const homeButton = document.querySelector('.home-button');
    
    // Load translations
    fetch(`/static/langs/${currentLang}.json`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${currentLang}.json`);
            }
            return response.json();
        })
        .then(translations => {
            if (translations && translations['404']) {
                if (subtitle && translations['404'].subtitle) {
                    subtitle.innerHTML = translations['404'].subtitle;
                }
                
                if (homeButton && translations['404'].getHomeButton) {
                    homeButton.textContent = translations['404'].getHomeButton;
                }
            }
        })
        .catch(error => {
            console.error('Error loading translations:', error);
        });
});