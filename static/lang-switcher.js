document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const langSwitcher = document.getElementById('lang-switcher');
    const langDropdown = document.getElementById('lang-dropdown-content');
    const currentLangEl = document.getElementById('current-lang');
    const langOptions = document.querySelectorAll('.lang-dropdown-content a');
    
    // Get saved language or default to browser language
    let currentLang = localStorage.getItem('moodFmLang') || 
                    (navigator.language.startsWith('fr') ? 'fr' : 'en');
    
    // Initialize with saved language
    setLanguage(currentLang);
    currentLangEl.textContent = currentLang.toUpperCase();
    
    // Toggle dropdown
    langSwitcher.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking elsewhere
    document.addEventListener('click', () => {
        langDropdown.classList.remove('show');
    });
    
    // Language selection
    langOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            const lang = e.target.getAttribute('data-lang');
            setLanguage(lang);
            currentLangEl.textContent = lang.toUpperCase();
            langDropdown.classList.remove('show');
        });
    });
    
    // Load and apply translations
    function setLanguage(lang) {
        localStorage.setItem('moodFmLang', lang);
        
        fetch(`/static/langs/${lang}.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${lang}.json`);
                }
                return response.json();
            })
            .then(translations => {
                applyTranslations(translations);
                // Dispatch event that language has changed
                const event = new CustomEvent('languageChanged', { detail: { lang, translations } });
                document.dispatchEvent(event);
            })
            .catch(error => {
                console.error('Error loading translations:', error);
            });
    }
    
    function applyTranslations(translations) {
        const elements = document.querySelectorAll('[data-i18n]');
        
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = getNestedTranslation(translations, key);
            
            if (translation) {
                if (element.tagName === 'INPUT') {
                    if (element.getAttribute('placeholder')) {
                        element.setAttribute('placeholder', translation);
                    }
                } else if (key === 'results.confidence') {
                    const moodNameEl = document.getElementById('mood-name');
                    const moodScoreEl = document.getElementById('mood-score');
                    
                    if (moodNameEl && moodScoreEl) {
                        const mood = moodNameEl.textContent;
                        const score = moodScoreEl.textContent;
                        
                        // Replace {{mood}} and {{score}} placeholders
                        let formattedText = translation
                            .replace('{{mood}}', `<span id="mood-name">${mood}</span>`)
                            .replace('{{score}}', `<span id="mood-score">${score}</span>`);
                            
                        element.innerHTML = formattedText;
                    }
                } else {
                    element.textContent = translation;
                }
            }
        });

        const pageTitle = getNestedTranslation(translations, 'page.title');
        if (pageTitle) {
            document.title = pageTitle;
        }
    }
    
    function getNestedTranslation(obj, path) {
        const keys = path.split('.');
        return keys.reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
    }
    
    // Update language checkmarks
    function updateLanguageCheckmarks() {
        // Get all language options
        const langOptions = document.querySelectorAll('.lang-option');
        
        // Get current language
        const currentLang = document.getElementById('current-lang').textContent.toLowerCase();
        
        // Update active class for checkmark visibility
        langOptions.forEach(option => {
            const optionLang = option.getAttribute('data-lang');
            if (optionLang.toLowerCase() === currentLang) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    updateLanguageCheckmarks();
    
    // Language change handler
    document.querySelectorAll('.lang-option').forEach(option => {
        option.addEventListener('click', function(e) {
            
            // Update checkmarks after language change
            setTimeout(updateLanguageCheckmarks, 100);
        });
    });
    
    // Expose getNestedTranslation function globally
    window.getNestedTranslation = getNestedTranslation;
});