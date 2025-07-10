async function fetch_best_music(mood, setButtonState) {
    try {
        console.log(`Fetching best music for mood: ${mood}`);
        
        // Translate mood name if needeeed
        const currentLang = localStorage.getItem('moodFmLang') || 'en';
        let translatedMood = mood;
        
        try {
            const translationResponse = await fetch(`/static/langs/${currentLang}.json`);
            if (translationResponse.ok) {
                const translations = await translationResponse.json();
                //Try to get the translated mood name from feelings section
                const translatedMoodName = getNestedTranslation(translations, `feelings.${mood}`);
                if (translatedMoodName) {
                    translatedMood = translatedMoodName;
                }
            }
        } catch (translationError) {
            console.error('Error fetching mood translations:', translationError);
            // Continue with original mood if translation fails
        }
        
        const response = await fetch('/music', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mood: mood })
                });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        const data = await response.json();
        console.log('Best music data:', data);

        // Update the UI with the best music data
        const resultsContainer = document.querySelector('.results-container');
        const resultsOverlay = document.getElementById('results-overlay');
        const topTrackTitle = document.getElementById('top-track-title');
        const topTrackArtist = document.getElementById('top-track-artist');
        const topTrackImage = document.getElementById('top-track-image');
        
        // Get streaming link elements
        const spotifyLink = document.getElementById('spotify-link');
        const youtubeLink = document.getElementById('youtube-link');
        const deezerLink = document.getElementById('deezer-link');
        const appleMusicLink = document.getElementById('apple-music-link');
        
        // Show popup with animation and overlay
        resultsContainer.classList.add('show');
        resultsOverlay.classList.add('show');
        
        // Set track info
        topTrackTitle.textContent = data.spotify?.name || 'Unknown Title';
        topTrackArtist.textContent = data.spotify?.artist || 'Unknown Artist';
        

        const moodNameElements = document.querySelectorAll('.mood-name, #mood-name');
        moodNameElements.forEach(el => {
            if (el) {
                el.textContent = translatedMood;
            }
        });
        
        if (data.spotify?.cover_image) {
            topTrackImage.src = data.spotify.cover_image;
            topTrackImage.style.display = 'block';
        } else {
            topTrackImage.style.display = 'none'; // Hide image if not available
        }
        
        topTrackImage.alt = `${data.spotify?.name || 'Unknown'} by ${data.spotify?.artist || 'Unknown'}`;
        
        // Set streaming links
        if (data.spotify?.url) {
            spotifyLink.href = data.spotify.url;
            spotifyLink.style.display = 'inline-flex';
        } else {
            spotifyLink.style.display = 'none';
        }
        
        const trackName = data.spotify?.name || '';
        const artistName = data.spotify?.artist || '';
        const searchQuery = encodeURIComponent(`${trackName} ${artistName}`);
        
        if (data.ytb_music?.url) {
            youtubeLink.href = data.ytb_music.url;
        } else {
            youtubeLink.href = `https://www.youtube.com/results?search_query=${searchQuery}`;
        }
        
        if (data.deezer?.url) {
            deezerLink.href = data.deezer.url;
        } else {
            deezerLink.href = `https://www.deezer.com/search/${searchQuery}`;
        }

        if (data.apple_music?.url) {
            appleMusicLink.href = data.apple_music.url;
        } else {
            appleMusicLink.href = `https://music.apple.com/search?term=${searchQuery}`;
        }
        
        if (setButtonState) {
            setButtonState(false); 
        }
        
        hideLoading();
    } catch (error) {
        console.error('Error fetching music:', error);
        hideLoading();
        if (setButtonState) {
            setButtonState(false);
        }
    }
}

function validateMoodInput(input) {
    if (input === '') {
        throw new Error('Please enter a mood before submitting.');
    }
    if (input.length > 100) {
        throw new Error('Mood input is too long. Please limit it to 100 characters.');
    }
}

async function submitMood(moodInput, setButtonState) {
    try {
        console.log(`Submitting mood: ${moodInput}`);
        
        const response = await fetch('/mood', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: moodInput })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Server response:', data);
        
        if (data.dominant_mood) {
            //get current language
            const currentLang = localStorage.getItem('moodFmLang') || 'en';
            
            const moodNameEl = document.getElementById('mood-name');
            const moodScoreEl = document.getElementById('mood-score');
            
            if (moodNameEl && moodScoreEl) {
                const conversationalMood = convertMoodToConversational(data.dominant_mood);
                
                const confidenceScore = data.mood_score;
                
                moodNameEl.textContent = conversationalMood;
                moodScoreEl.textContent = confidenceScore;
                
                fetch(`/static/langs/${currentLang}.json`)
                    .then(response => response.json())
                    .then(translations => {
                        const translation = getNestedTranslation(translations, 'results.confidence');
                        if (translation) {
                            const moodConfidence = document.getElementById('mood-confidence');
                            if (moodConfidence) {
                                let formattedText = translation
                                    .replace('{{mood}}', `<span id="mood-name">${conversationalMood}</span>`)
                                    .replace('{{score}}', `<span id="mood-score">${confidenceScore}</span>`);
                                
                                moodConfidence.innerHTML = formattedText;
                            }
                        }
                    })
                    .catch(err => console.error('Error applying translation:', err));
            }
            
            await fetch_best_music(data.dominant_mood, setButtonState);

        } else if (data.rickroll) {
            open(data.rickroll_url, '_blank');

        } else if (data.skibidi_url) {
            open(data.skibidi_url, '_blank');

        } else {
            console.warn('No dominant mood returned from server');
        }

        return data;
    } catch (error) {
        console.error('Error submitting mood:', error);
        throw error;
    } finally {
        // Reset button state after operation
        setButtonState(false);
    }
}

function getNestedTranslation(obj, path) {
    const keys = path.split('.');
    return keys.reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
}

function convertMoodToConversational(mood) {
    const moodMap = {
        "anger": "angry",
        "disgust": "disgusted",
        "fear": "scared",
        "joy": "happy",
        "sadness": "sad",
        "surprise": "surprised"
    };
    
    return moodMap[mood.toLowerCase()] || mood;
}

document.addEventListener('DOMContentLoaded', () => {
    const submitMoodButton = document.getElementById('submit_mood_button');
    const moodInputBox = document.getElementById('mood_input_box');

    // Store the last processed mood for rerolling
    let lastProcessedMood = null;

    // Dynamic placeholder configuration
    let placeholders = [
        "How do you feel today?",
    ];
    
    // Try to load placeholders from current language
    loadPlaceholdersFromCurrentLanguage();
    
    // Listen for language changes
    document.addEventListener('languageChanged', (event) => {
        loadPlaceholdersFromTranslations(event.detail.translations);
    });

    function loadPlaceholdersFromCurrentLanguage() {
        const currentLang = localStorage.getItem('moodFmLang') || 
                        (navigator.language.startsWith('fr') ? 'fr' : 'en');
        
        fetch(`/static/langs/${currentLang}.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${currentLang}.json`);
                }
                return response.json();
            })
            .then(translations => {
                loadPlaceholdersFromTranslations(translations);
            })
            .catch(error => {
                console.error('Error loading placeholders:', error);
            });
    }
    
    function loadPlaceholdersFromTranslations(translations) {
        const translatedPlaceholders = getNestedTranslation(translations, 'placeholders');
        if (translatedPlaceholders && Array.isArray(translatedPlaceholders) && translatedPlaceholders.length > 0) {
            placeholders = translatedPlaceholders;
            
            // Reset the typing animation
            resetTypingAnimation();
        }
    }

    let currentPlaceholderIndex = Math.floor(Math.random() * placeholders.length);
    let currentText = '';
    let isTyping = true;
    let charIndex = 0;
    let typeEffectTimer = null;

    function resetTypingAnimation() {
        // Clear any existing animation
        clearTimeout(typeEffectTimer);
        
        // Reset animation state
        currentText = '';
        isTyping = true;
        charIndex = 0;
        currentPlaceholderIndex = Math.floor(Math.random() * placeholders.length);
        
        // Start animation again
        typeEffect();
    }

    function typeEffect() {
        const currentPlaceholder = placeholders[currentPlaceholderIndex];
        
        if (isTyping) {
            // Typing phase
            if (charIndex < currentPlaceholder.length) {
                currentText += currentPlaceholder.charAt(charIndex);
                moodInputBox.placeholder = currentText;
                charIndex++;
                typeEffectTimer = setTimeout(typeEffect, 50 + Math.random() * 50); //typing speed
            } else {
                // Wait phase
                isTyping = false;
                typeEffectTimer = setTimeout(typeEffect, 1500); //Wait before deleting
            }
        } else {
            // Deleting phase
            if (currentText.length > 0) {
                currentText = currentText.slice(0, -1);
                moodInputBox.placeholder = currentText;
                typeEffectTimer = setTimeout(typeEffect, 50 + Math.random() * 50); // deletion speed
            } else {
                isTyping = true;
                charIndex = 0;
                
                // Get random placeholder that's different from the current one
                let newIndex;
                do {
                    newIndex = Math.floor(Math.random() * placeholders.length);
                } while (newIndex === currentPlaceholderIndex && placeholders.length > 1);
                
                currentPlaceholderIndex = newIndex;
                typeEffectTimer = setTimeout(typeEffect, 500);
            }
        }
    }

    // Start the typing effect
    typeEffect();

    // Pause typing animation when user focuses on input
    moodInputBox.addEventListener('focus', () => {
        moodInputBox.placeholder = ''; //Clear plaholder text
        clearTimeout(typeEffectTimer); // Clear the animation when focused
    });

    //Resume typing animation when user leaves input
    moodInputBox.addEventListener('blur', () => {
        if (moodInputBox.value.trim() === '') {
            clearTimeout(typeEffectTimer); // Clear any existing animation
            
            // Reset animation state for smooth restart
            currentText = '';
            isTyping = true;
            charIndex = 0;
            
            typeEffectTimer = setTimeout(typeEffect, 1000);
        }
    });

    function setButtonState(disabled) {
        submitMoodButton.disabled = disabled;
        
        if (disabled) {
            submitMoodButton.textContent = 'Analysing your feelings...';
            showLoading();
        } else {

            const currentLang = localStorage.getItem('moodFmLang') || 
                            (navigator.language.startsWith('fr') ? 'fr' : 'en');
            
            fetch(`/static/langs/${currentLang}.json`)
                .then(response => response.json())
                .then(translations => {
                    const buttonText = getNestedTranslation(translations, "submit.button") || 'Turn your mood into music';
                    submitMoodButton.textContent = buttonText;
                })
                .catch(err => {
                    console.error('Error getting button translation:', err);
                    submitMoodButton.textContent = 'Turn your mood into music';
                });
            
            hideLoading();
        }
    }

    function setFindAnotherButtonState(disabled) {
        const findAnotherButton = document.getElementById('find-another-button');
        findAnotherButton.disabled = disabled;
        findAnotherButton.textContent = disabled ? 'Finding another song...' : 'Find Another Song';
        
        if (disabled) {
            showLoading('Finding another song...');
        } else {
            hideLoading();
        }
    }

    submitMoodButton.addEventListener('click', async () => {
        const moodInput = moodInputBox.value.trim();

        try {
            validateMoodInput(moodInput);
            setButtonState(true);
            
            const result = await submitMood(moodInput, setButtonState);
            
            // Store the dominant mood for rerolling
            if (result && result.dominant_mood) {
                lastProcessedMood = result.dominant_mood;
            }
            
            //Clear input after successful submission
            moodInputBox.value = '';
            
        } catch (error) {
            alert(error.message);
            setButtonState(false); //reset button state on error
        }
    });

    //Submit on enter key
    moodInputBox.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            submitMoodButton.click();
        }
    });

    document.getElementById('find-another-button').addEventListener('click', async function() {
        if (!lastProcessedMood) {
            console.warn('No previous mood to reroll');
            return;
        }

        try {
            setFindAnotherButtonState(true);
            
            // Fetch another song with the same mood
            await fetch_best_music(lastProcessedMood, () => setFindAnotherButtonState(false));
            
        } catch (error) {
            console.error('Error finding another song:', error);
            alert('Failed to find another song. Please try again later.');
            setFindAnotherButtonState(false);
        }
    });

    document.getElementById('close-button').addEventListener('click', function() {
        const resultsContainer = document.getElementById('results-container');
        const resultsOverlay = document.getElementById('results-overlay');
        
        // Remove the show class to hide the popup
        resultsContainer.classList.remove('show');
        resultsOverlay.classList.remove('show');
    });

    document.getElementById('results-overlay').addEventListener('click', function() {
        const resultsContainer = document.getElementById('results-container');
        const resultsOverlay = document.getElementById('results-overlay');
        
        resultsContainer.classList.remove('show');
        resultsOverlay.classList.remove('show');
    });

    // Hide search box on scroll
    const submitContainer = document.getElementById('submit-container');
    let lastScrollPosition = 0;
    let scrollThreshold = 100;
    
    window.addEventListener('scroll', () => {
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        const goUpLink = document.getElementById('go-up-link');
        
        // Check if scrolled down more than threshold
        if (currentScrollPosition > scrollThreshold) {
            submitContainer.classList.add('hidden');
            goUpLink.classList.add('show'); // Show the go-up button
        } else {
            submitContainer.classList.remove('hidden');
            goUpLink.classList.remove('show'); //Hide the go-up button
        }
        
        lastScrollPosition = currentScrollPosition;
    });
    
    // Initialize ScrollReveal for sections
    const sr = ScrollReveal({
        origin: 'bottom',
        distance: '30px',
        duration: 1000,
        delay: 100,
        easing: 'ease-out',
        reset: false,
        viewFactor: 0.2,        // Start animation when element is 20% in view
        cleanup: false 
    });
    
    //Animations on scrll
    sr.reveal('#about', {
        delay: 400,
        origin: 'bottom'
    });
    
    sr.reveal('#how-it-works', { 
        delay: 500,
        origin: 'bottom'
    });

    sr.reveal('#go-up-link', { 
        delay: 600,
        origin: 'bottom'
    });
});

// Loading animation control functions
function showLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            const currentLang = localStorage.getItem('moodFmLang') ||
            (navigator.language.startsWith('fr') ? 'fr' : 'en');

            fetch(`/static/langs/${currentLang}.json`)
            .then(response => response.json())
            .then(translations => {
                const translatedMessage =
                getNestedTranslation(translations, 'loader.loadingText') ||
                'Analysing your feelings...';
                loadingText.textContent = translatedMessage;
            })
            .catch(err => {
                console.error('Error loading translation:', err);
                loadingText.textContent = 'Analysing your feelings...';
            });
        }
        loadingOverlay.classList.add('show');
        document.body.classList.add('popup-open');
    }
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('show');
        document.body.classList.remove('popup-open');
    }
}