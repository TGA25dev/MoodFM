let spotifyTrackId = null;
let deezerTrackId = null;
let currentCoverImage = '';

// Global translation cache
let currentTranslations = null;

// Escape HTML to prevent XSS
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

//Url validation
function isSafeUrl(url) {
    try {
        const u = new URL(url, window.location.origin);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
}

// Returns a promise that resolves to the current translations object
function getCurrentTranslations() {
    const currentLang = localStorage.getItem('moodFmLang') ||
        (navigator.language.startsWith('fr') ? 'fr' : 'en');
    // If already loaded, return cached
    if (currentTranslations && currentTranslations._lang === currentLang) {
        return Promise.resolve(currentTranslations);
    }
    return fetch(`/static/langs/${currentLang}.json`)
        .then(response => response.json())
        .then(translations => {
            translations._lang = currentLang; // Mark the language
            currentTranslations = translations;
            return translations;
        });
}

function showToast(message, type = 'info', options = {}) {
    const container = document.getElementById('toaster-container');
    if (!container) return;

    // Icons for each type
    const icons = {
        success: '<i class="fas fa-check-circle toaster-icon"></i>',
        error: '<i class="fas fa-times-circle toaster-icon"></i>',
        info: '<i class="fas fa-info-circle toaster-icon"></i>'
    };

    // Create toaster element
    const toast = document.createElement('div');
    toast.className = `toaster ${type}`;
    toast.innerHTML = `
        ${icons[type] || icons.info}
        <span></span>
        <button class="toaster-close" aria-label="Close">&times;</button>
    `;
    toast.querySelector('span').textContent = message;

    // Remove on click
    toast.querySelector('.toaster-close').onclick = () => removeToast(toast);

    // Remove after timeout
    const timeout = options.timeout || 3500;
    setTimeout(() => removeToast(toast), timeout);

    // Remove with animation
    function removeToast(toastEl) {
        toastEl.style.animation = 'toaster-out 0.3s forwards';
        setTimeout(() => container.removeChild(toastEl), 300);
    }

    container.appendChild(toast);
}
// Show welcome toast only once
if (!localStorage.getItem('welcomeToastShown')) {
    getCurrentTranslations().then(translations => {
        showToast(getNestedTranslation(translations, 'toast.welcome'), 'info');
        localStorage.setItem('welcomeToastShown', 'true');
    });
}

async function fetch_best_music(mood, setButtonState) {
    //Reset UI from shared mode
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) resultsContainer.classList.remove('shared-mode');

    const streamingLinks = document.getElementById('streaming-links');
    if (streamingLinks) streamingLinks.style.display = 'flex';

    const actionButtons = document.querySelector('.action-buttons');
    if (actionButtons) {
        Array.from(actionButtons.children).forEach(child => {
            // Hide "Try By Yourself" button in normal mode
            if (child.classList.contains('try-by-yourself-button')) {
                child.style.display = 'none';
            } else {
                child.style.display = 'inline-block';
            }
        });
    }

    const perfectTrackTitle = document.getElementById('perfectTrackTitle');
    if (perfectTrackTitle) perfectTrackTitle.style.display = '';

    const moodConfidence = document.getElementById('mood-confidence');
    if (moodConfidence) moodConfidence.style.display = '';

    const sharedHeader = document.getElementById('shared-header');
    if (sharedHeader) sharedHeader.style.display = 'none';

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
        document.body.classList.add('popup-open'); // Block scrolling
        resultsOverlay.classList.add('show');

        const sharedHeader = document.getElementById('shared-header');
        if (sharedHeader) sharedHeader.style.display = 'none';
        
        // Set track info
        topTrackTitle.textContent = data.spotify?.name || 'Unknown Title';
        topTrackArtist.textContent = data.spotify?.artist || 'Unknown Artist';

        if (data.spotify?.id !== undefined && data.spotify.id !== null) {
            spotifyTrackId = data.spotify.id;
        }

        if (data.deezer?.id !== undefined && data.deezer.id !== null) {
            deezerTrackId = data.deezer.id;
        }
        const moodNameElements = document.querySelectorAll('.mood-name, #mood-name');
        moodNameElements.forEach(el => {
            if (el) {
                el.textContent = translatedMood;
            }
        });
        
        if (data.spotify?.cover_image) {
            topTrackImage.src = data.spotify.cover_image;
            topTrackImage.style.display = 'block';
            currentCoverImage = data.spotify.cover_image;
        } else {
            topTrackImage.style.display = 'none'; // Hide image if not available
            currentCoverImage = '';
        }
        
        topTrackImage.alt = `${data.spotify?.name || 'Unknown'} by ${data.spotify?.artist || 'Unknown'}`;
        
        const existingWrapper = document.querySelector('.track-image-wrapper');
        if (existingWrapper) {
            const imageParent = existingWrapper.parentNode;
            const image = existingWrapper.querySelector('#top-track-image');
            if (image && imageParent) {
                // Remove the old wrapper and put the image back directly
                imageParent.replaceChild(image, existingWrapper);
            }
        }
        
        //create a fresh wrapper
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'track-image-wrapper';
        const playButton = document.createElement('div');
        playButton.className = 'track-play-button';
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        
        const imageParent = topTrackImage.parentNode;

        imageParent.replaceChild(imageWrapper, topTrackImage);
        imageWrapper.appendChild(topTrackImage);
        imageWrapper.appendChild(playButton);
        
        //New audio element
        let audioPreview = document.getElementById('audio-preview');
        if (!audioPreview) {
            audioPreview = document.createElement('audio');
            audioPreview.id = 'audio-preview';
            document.body.appendChild(audioPreview);
        } else {
            // Reset the audio element for new songs
            audioPreview.pause();
            audioPreview.currentTime = 0;
            audioPreview.src = ''; // Clear source
            audioPreview.load(); // Reload to clear any pending operations
        }
        
        if (data.deezer?.preview) {
          
            audioPreview.src = data.deezer.preview;
            audioPreview.load();
            playButton.style.display = 'flex';
            
            // Add click event for play/pause
            let isPlaying = false;

            const playPauseHandler = (e) => {
                e.stopPropagation();
                
                if (isPlaying) {
                    audioPreview.pause();
                    playButton.innerHTML = '<i class="fas fa-play"></i>';
                    isPlaying = false;
                } else {
                    // Preload audio before playing
                    audioPreview.load();
                    
                    const playPromise = audioPreview.play();
                    
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            playButton.innerHTML = '<i class="fas fa-pause"></i>';
                            isPlaying = true;
                        }).catch(err => {
                            console.error('Error playing audio:', err);
                            // Show play button if play fails
                            playButton.innerHTML = '<i class="fas fa-play"></i>';
                            isPlaying = false;
                        });
                    }
                }
            };
            
            // Add click handler just to the play button
            playButton.onclick = playPauseHandler;
            
            // Reset play button when audio ends
            audioPreview.addEventListener('ended', () => {
                isPlaying = false;
                playButton.innerHTML = '<i class="fas fa-play"></i>';
            });
        } else {
            playButton.style.display = 'none';
        }
        
        // Set streaming links
        if (data.spotify?.url && isSafeUrl(data.spotify.url)) {
            spotifyLink.href = data.spotify.url;
            spotifyLink.style.display = 'inline-flex';
        } else {
            spotifyLink.style.display = 'none';
        }
        
        const trackName = data.spotify?.name || '';
        const artistName = data.spotify?.artist || '';
        const searchQuery = encodeURIComponent(`${trackName} ${artistName}`);
        
        if (data.ytb_music?.url && isSafeUrl(data.ytb_music.url)) {
            youtubeLink.href = data.ytb_music.url;
        } else {
            youtubeLink.href = `https://www.youtube.com/results?search_query=${searchQuery}`;
        }
        
        if (data.deezer?.url && isSafeUrl(data.deezer.url)) {
            deezerLink.href = data.deezer.url;
        } else {
            deezerLink.href = `https://www.deezer.com/search/${searchQuery}`;
        }

        if (data.apple_music?.url && isSafeUrl(data.apple_music.url)) {
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

        if (error.message && error.message.toLowerCase().includes('rate limit')) {
            getCurrentTranslations().then(translations => {
                showToast(getNestedTranslation(translations, 'toast.rateLimitExceeded') || 'Too many requests. Please try again later.', 'error', { timeout: 5000 });
            });
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
            // Moderation or temp ban error handling
            if (
                errorData &&
                errorData.error &&
                (
                    errorData.error.toLowerCase().includes('harmful') ||
                    errorData.error.toLowerCase().includes('moderation') ||
                    errorData.error.toLowerCase().includes('rephrase') ||
                    errorData.error.toLowerCase().includes('temporarily banned')
                )
            ) {
                getCurrentTranslations().then(translations => {
                    let msg;
                    if (errorData.error.toLowerCase().includes('temporarily banned')) {
                        msg = getNestedTranslation(translations, 'toast.tempBan') ||
                              "Too many flagged messages. You're banned for 10 minutes.";
                    } else {
                        msg = getNestedTranslation(translations, 'toast.moderationFailed') ||
                              'Only good vibes are allowed here. Please rephrase your input.';
                    }
                    showToast(msg, 'error', { timeout: 5000 });
                });
                setButtonState(false);
                return;
            }
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
            window.open(data.rickroll_url, '_blank') || window.location.assign(data.rickroll_url);

        } else if (data.skibidi_url) {
            const newWindow = window.open(data.skibidi_url, '_blank');
            
            // Check if popup was blocked
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                // If blocked, redirect the current page instead
                window.location.href = data.skibidi_url;
            }
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
    let isInputFocused = false;
    
    moodInputBox.addEventListener('focus', () => {
        moodInputBox.placeholder = ''; //Clear plaholder text
        clearTimeout(typeEffectTimer); // Clear the animation when focused
        isInputFocused = true;
        
        // Ensure container stays visible when focusing on input
        submitContainer.classList.remove('hidden');
    });

    //Resume typing animation when user leaves input
    moodInputBox.addEventListener('blur', () => {
        isInputFocused = false;
        
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
        
        if (disabled) {
            findAnotherButton.textContent = 'Finding another song...';
            showLoading('Finding another song...');
        } else {
            // Get current language
            const currentLang = localStorage.getItem('moodFmLang') || 
                            (navigator.language.startsWith('fr') ? 'fr' : 'en');
            
            fetch(`/static/langs/${currentLang}.json`)
                .then(response => response.json())
                .then(translations => {
                    const buttonText = getNestedTranslation(translations, "results.findAnotherButton") || 'Find Another Song';
                    findAnotherButton.textContent = buttonText;
                })
                .catch(err => {
                    console.error('Error getting button translation:', err);
                    findAnotherButton.textContent = 'Find Another Song';
                });
            
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
            showToast(error.message, 'error', { timeout: 5000 });
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
            getCurrentTranslations().then(translations => {
                showToast(getNestedTranslation(translations, 'toast.findAnotherFailed'), 'error', { timeout: 5000 });
            });
            setFindAnotherButtonState(false);
        }
    });

    // Function to close the results popup
    function closeResultsPopup() {
        const resultsContainer = document.getElementById('results-container');
        const resultsOverlay = document.getElementById('results-overlay');

        if (window.location.pathname === '/shared') {
            window.history.replaceState({}, '', '/');
        }

        if (resultsContainer) resultsContainer.classList.remove('shared-mode');
        
        // Stop audio playback when closing the popup
        const audioPreview = document.getElementById('audio-preview');
        if (audioPreview) {
            audioPreview.pause();
            audioPreview.currentTime = 0;
            // Remove the source
            audioPreview.src = '';
            // Reset play button
            const playButton = document.querySelector('.track-play-button');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-play"></i>';
            }
        }
        
        // Remove the show class to hide the popup
        resultsContainer.classList.remove('show');
        resultsOverlay.classList.remove('show');
        document.body.classList.remove('popup-open');
    }

    //Close button click
    document.getElementById('close-button').addEventListener('click', closeResultsPopup);

    //Overlay click
    document.getElementById('results-overlay').addEventListener('click', closeResultsPopup);
    
    // ESC key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27) {
            const resultsContainer = document.getElementById('results-container');
            if (resultsContainer && resultsContainer.classList.contains('show')) {
                closeResultsPopup();
            }
        }
    });

    // Hide search box on scroll
    const submitContainer = document.getElementById('submit-container');
    let lastScrollPosition = 0;
    let scrollThreshold = 100;
    
    // Modify the scroll event handler to check for input focus
    window.addEventListener('scroll', () => {
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        const goUpLink = document.getElementById('go-up-link');
        
        // Only hide if input is not focused and we've scrolled enough
        if (currentScrollPosition > scrollThreshold && !isInputFocused) {
            submitContainer.classList.add('hidden');
            goUpLink.classList.add('show'); // Show the go-up button
        } else {
            submitContainer.classList.remove('hidden');
            goUpLink.classList.remove('show'); //Hide the go-up button
        }
        
        lastScrollPosition = currentScrollPosition;
    });

    //Stats data management
    let statsData = {
        today: null,
        month: null,
        ever: null
    };
    let currentPeriod = 'today';
    let statsContainerRevealed = false;
    const moodChart = document.getElementById('mood-chart');
    const statsLoadingText = document.getElementById('stats-loading-text');
    
    //Hide chart and show loader by default
    if (moodChart) moodChart.style.display = 'none';
    if (statsLoadingText) statsLoadingText.style.display = 'block';
    
    // Fetch stats for a specific period
    async function fetchStatsForPeriod(period) {
        try {
            const response = await fetch(`/stats?period=${period}`);
            if (!response.ok) throw new Error('Failed to fetch stats');
            const data = await response.json();
            return data.stats || {};
        } catch (error) {
            console.error(`Error fetching ${period} stats:`, error);
            return null;
        }
    }
    
    async function loadAllStats() {
        const periods = ['today', 'month', 'ever'];
        const promises = periods.map(period => fetchStatsForPeriod(period));
        
        try {
            const results = await Promise.all(promises);
            periods.forEach((period, index) => {
                statsData[period] = results[index];
            });
            
            if (statsContainerRevealed) {
                if (moodChart) moodChart.style.display = 'flex';
                if (statsData[currentPeriod]) {
                    animateMoodBars(statsData[currentPeriod]);
                }
            }
        } catch (error) {
            console.error('Error loading stats:', error);
            if (statsLoadingText) {
                getCurrentTranslations().then(translations => {
                    const errorText = getNestedTranslation(translations, 'stats.loadError') || 'Failed to load stats.';
                    statsLoadingText.textContent = errorText;
                    setTimeout(() => {
                        statsLoadingText.classList.add('out');
                        setTimeout(() => {
                            statsLoadingText.style.display = 'none';
                            statsLoadingText.classList.remove('out');
                        }, 500);
                    }, 1500);
                });
            }
        }
    }
    
    function switchStatsPeriod(period) {
        if (period === currentPeriod) return;
        
        currentPeriod = period;
        
        document.querySelectorAll('.time-bubble').forEach(bubble => {
            bubble.classList.remove('active');
            if (bubble.dataset.period === period) {
                bubble.classList.add('active');
            }
        });
            
        // Show loading state
        const activeBubble = document.querySelector(`.time-bubble[data-period="${period}"]`);
        if (activeBubble) {
            activeBubble.classList.add('loading');
        }
            
        if (statsData[period]) {
            setTimeout(() => {
                animateMoodBars(statsData[period]);
                if (activeBubble) {
                    activeBubble.classList.remove('loading');
                }
            }, 300);
        } else {
            // Fetch data for this period
            fetchStatsForPeriod(period).then(data => {
                statsData[period] = data;
                if (data && statsContainerRevealed) {
                    animateMoodBars(data);
                }
                if (activeBubble) {
                    activeBubble.classList.remove('loading');
                }
            });
        }
    }
    
function animateMoodBars(stats) {
    if (statsLoadingText && statsLoadingText.style.display !== 'none') {
        setTimeout(() => {
            statsLoadingText.classList.add('out');
            setTimeout(() => {
                statsLoadingText.style.display = 'none';
                statsLoadingText.classList.remove('out');
            }, 500);
        }, 200);
    }
    
    if (!stats || Object.keys(stats).length === 0) {
        //If no stats, show empty bars with zero values
        document.querySelectorAll('.mood-bar').forEach((bar) => {
            const barEl = bar.querySelector('.bar');
            const valueEl = bar.querySelector('.bar-value');
            
            if (barEl && valueEl) {
                barEl.style.height = "8px"; // Minimum height
                valueEl.textContent = "0";
                bar.removeAttribute('data-percentage');
            }
        });
        
        // Show the chart even with empty data
        if (moodChart) moodChart.style.display = 'flex';
        return;
    }
    
    const moodOrder = [
        { key: "joy", name: "Happy" },
        { key: "sad", name: "Sad" },
        { key: "surprised", name: "Surprised" },
        { key: "scared", name: "Scared" },
        { key: "angry", name: "Angry" },
        { key: "disgusted", name: "Disgusted" }
    ];
    
    const moodValues = moodOrder.map(m => stats[m.key]?.count || 0);
    const max = Math.max(...moodValues, 1);
    const totalEntries = moodValues.reduce((sum, val) => sum + val, 0);
    
    const minBarHeight = 30;
    const maxBarHeight = 180;
    const baseHeight = 8;
    
    //Animate bars
    document.querySelectorAll('.mood-bar').forEach((bar, i) => {
        const val = moodValues[i];
        const barEl = bar.querySelector('.bar');
        const valueEl = bar.querySelector('.bar-value');
        
        if (!barEl || !valueEl) return;  // Safety check 
        
        //Calculate percentage for data attribute
        const percentage = totalEntries > 0 ? Math.round((val / totalEntries) * 100) : 0;
        bar.setAttribute('data-percentage', percentage + '%');
        
        // Collapse animation
        barEl.style.height = baseHeight + "px";
        valueEl.textContent = "0";
        
        //expand animation
        setTimeout(() => {
            let barHeight;
            
            if (val === 0) {
                barHeight = baseHeight; //minimum height for zero values
            } else if (val === max) {
                barHeight = maxBarHeight; // maximum height for the largest value
            } else {
                //use square root scaling, better for small values
                const scaleFactor = Math.sqrt(val / max);
                barHeight = baseHeight + scaleFactor * (maxBarHeight - baseHeight);
                
                barHeight = Math.max(barHeight, minBarHeight);
            }
            
            barEl.style.height = barHeight + "px";
            
            // Animate number counting
            animateValue(valueEl, 0, val, 600);
        }, 100 + i * 120);
    });
    
    // Show the chart
    if (moodChart) moodChart.style.display = 'flex';
}
    // Function to animate number counting
    function animateValue(element, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const current = Math.floor(progress * (end - start) + start);
            element.textContent = current;
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }
    
    // Stats period switching event listeners
    document.querySelectorAll('.time-bubble').forEach(bubble => {
        bubble.addEventListener('click', function() {
            const period = this.dataset.period;
            if (period) {
                switchStatsPeriod(period);
            }
        });
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

    sr.reveal('#stats-container', {
        delay: 500,
        origin: 'bottom',
        afterReveal: function() {
            statsContainerRevealed = true;
            if (moodChart) moodChart.style.display = 'flex';
            
            if (statsData[currentPeriod]) {
                animateMoodBars(statsData[currentPeriod]);
            } else {
                animateMoodBars(null);
                
                // Check if we need to fetch data
                if (statsData[currentPeriod] === null) {
                    fetchStatsForPeriod(currentPeriod).then(data => {
                        statsData[currentPeriod] = data;
                        if (data) {
                            animateMoodBars(data);
                        }
                    });
                }
            }
        }
    });
    
    // Mobile menu functionality
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileDropdown = document.getElementById('mobile-dropdown-content');

    if (mobileMenuButton && mobileDropdown) {
        mobileMenuButton.addEventListener('click', function() {
            mobileDropdown.classList.toggle('show');
        });
        
        // Close mobile dropdown when clicking elsewhere
        document.addEventListener('click', function(event) {
            if (!event.target.closest('#mobile-nav')) {
                mobileDropdown.classList.remove('show');
            }
        });
        
        // Close mobile dropdown when a link is clicked
        const mobileLinks = mobileDropdown.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', function() {
                mobileDropdown.classList.remove('show');
            });
        });
        
        const mobileLangOptions = mobileDropdown.querySelectorAll('.lang-option');
        mobileLangOptions.forEach(option => {
            option.addEventListener('click', function(event) {
                event.preventDefault();
                const lang = this.getAttribute('data-lang');
                if (lang) {

                    const currentLangEl = document.getElementById('current-lang');
                    if (currentLangEl) {
                        currentLangEl.textContent = lang.toUpperCase();
                    }
                    
                    // Save the language preference to localStorage
                    localStorage.setItem('moodFmLang', lang);
                    
                    const langChangeEvent = new CustomEvent('languageSelect', {
                        detail: { language: lang }
                    });
                    document.dispatchEvent(langChangeEvent);

                    
                    const allLangOptions = document.querySelectorAll('.lang-option');
                    allLangOptions.forEach(opt => {
                        opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
                    });
                    
                    // Close the mobile dropdown
                    mobileDropdown.classList.remove('show');
                    
                    if (typeof updatePageTranslations === 'function') {
                        updatePageTranslations(lang);
                    } else {
                        //reload the page to apply translations
                        window.location.reload();
                    }
                }
            });
        });
    }

    // Share button functionality
    document.getElementById('share-result-button').addEventListener('click', function() {
        console.log('Sharing song:');
        console.log('Spotify Track ID:', spotifyTrackId);
        console.log('Deezer Track ID:', deezerTrackId);

        let moodKey = lastProcessedMood;
        

        if (!spotifyTrackId && !deezerTrackId) {
            console.warn('No track ID available for sharing');
            getCurrentTranslations().then(translations => {
                showToast(getNestedTranslation(translations, 'toast.noSongToShare'), 'error', { timeout: 5000 });
            });
            return;
        }
        //TODO: Almos done !, maybe fix scroll enable on normal po up shown and immprove a bit shared poup, if lazy just add infos in the infos sections and ship

        //Create a custom url for sharing
        let shareUrl = '';
        if (deezerTrackId) {
            shareUrl = `https://moodfm.pronotif.tech/shared?mood=${encodeURIComponent(moodKey)}&provider=deezer&id=${encodeURIComponent(deezerTrackId)}&cover=${encodeURIComponent(currentCoverImage)}`;
        } else if (spotifyTrackId) {
            shareUrl = `https://moodfm.pronotif.tech/shared?mood=${encodeURIComponent(moodKey)}&provider=spotify&id=${encodeURIComponent(spotifyTrackId)}&cover=${encodeURIComponent(currentCoverImage)}`;
        } else {
            console.warn('No track ID available for sharing');
            getCurrentTranslations().then(translations => {
                showToast(getNestedTranslation(translations, 'toast.noSongToShare'), 'error', { timeout: 5000 });
            });
            return;
        }

        console.log('Share URL:', shareUrl);

        getCurrentTranslations().then(translations => {
            const shareTitle = getNestedTranslation(translations, 'share.title') || 'Check out this song!';
            let shareText = getNestedTranslation(translations, 'share.text') ||
                `I found this song based on my mood thanks to MoodFM: ${document.getElementById('top-track-title').textContent} by ${document.getElementById('top-track-artist').textContent}`;

            // Replace placeholders if present
            const songTitle = document.getElementById('top-track-title').textContent;
            const songArtist = document.getElementById('top-track-artist').textContent;
            shareText = shareText.replace('{{title}}', songTitle).replace('{{artist}}', songArtist);

            const shareData = {
                title: shareTitle,
                text: shareText,
                url: shareUrl
            };

            if (navigator.share && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            navigator.share(shareData)
                .then(() => console.log('Share successful'))
                .catch(err => console.error('Error sharing:', err));
            } else {
            console.warn('Web Share API not supported in this browser');
            // Fallback: Copy the link to clipboard
            navigator.clipboard.writeText(shareUrl)
                .then(() => {
                console.log('Link copied to clipboard');
                showToast(getNestedTranslation(translations, 'toast.linkCopied'), 'success');
                })
                .catch(err => {
                console.error('Error copying link:', err);
                showToast(getNestedTranslation(translations, 'toast.copyFailed'), 'error', { timeout: 5000 });
                });
            }
        });
});

    // Check if path is /shared and show the website
    if (window.location.pathname === '/shared') {
        // Remove overlays/popups if present
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.remove('show');
        const resultsOverlay = document.getElementById('results-overlay');
        if (resultsOverlay) resultsOverlay.classList.remove('show');
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) resultsContainer.classList.remove('show');
        document.body.classList.remove('popup-open');

        // Parse provider and id from URL
        const params = new URLSearchParams(window.location.search);
        const provider = params.get('provider');
        const id = params.get('id');
        const mood = params.get('mood') || 'unknown';

        if (provider && id) {
            fetch(`/shared-lookup?mood=${encodeURIComponent(mood)}&provider=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}`)
                .then(response => {
                    if (!response.ok) throw new Error('Failed to fetch shared song');
                    return response.json();
                })
                .then(data => {
                    console.log('Shared song data:', data);
                    document.body.classList.add('popup-open'); //Block scrolling

                    // Show the results popup
                    const resultsContainer = document.getElementById('results-container');
                    if (resultsContainer) {
                        resultsContainer.classList.add('shared-mode');
                    }

                    const resultsOverlay = document.getElementById('results-overlay');
                    resultsContainer.classList.add('show');
                    resultsOverlay.classList.add('show');

                    const perfectTrackTitle = document.getElementById('perfectTrackTitle');
                    if (perfectTrackTitle) {
                        perfectTrackTitle.style.display = 'none'; // Hide the "Perfect Track" title
                    }

                    // Fill in title, artist, cover
                    const topTrackTitle = document.getElementById('top-track-title');
                    const topTrackArtist = document.getElementById('top-track-artist');
                    const topTrackImage = document.getElementById('top-track-image');

                    topTrackTitle.textContent = data.name || data.title || 'Unknown Title';
                    topTrackArtist.textContent = data.artist || data.artist || 'Unknown Artist';

                    const existingWrapper = document.querySelector('.track-image-wrapper');
                    if (existingWrapper) {
                        const imageParent = existingWrapper.parentNode;
                        const image = existingWrapper.querySelector('#top-track-image');
                        if (image && imageParent) {
                            imageParent.replaceChild(image, existingWrapper);
                        }
                    }

                    // Create new wrapper and play button
                    const imageWrapper = document.createElement('div');
                    imageWrapper.className = 'track-image-wrapper';
                    const playButton = document.createElement('div');
                    playButton.className = 'track-play-button';
                    playButton.innerHTML = '<i class="fas fa-play"></i>';

                    const imageParent = topTrackImage.parentNode;
                    imageParent.replaceChild(imageWrapper, topTrackImage);
                    imageWrapper.appendChild(topTrackImage);
                    imageWrapper.appendChild(playButton);

                    if (data.cover_image) {
                        topTrackImage.src = data.cover_image;
                        topTrackImage.style.display = 'block';
                    } else {
                        topTrackImage.style.display = 'none';
                    }
                    topTrackImage.alt = `${topTrackTitle.textContent} by ${topTrackArtist.textContent}`;

                    // Get streaming link elements
                    const spotifyLink = document.getElementById('spotify-link');
                    const youtubeLink = document.getElementById('youtube-link');
                    const deezerLink = document.getElementById('deezer-link');
                    const appleMusicLink = document.getElementById('apple-music-link');
                    const searchQuery = encodeURIComponent(`${topTrackTitle} ${topTrackArtist}`);

                    // Set streaming links SPOTIFY
                    if (data.spotify_url && isSafeUrl(data.spotify_url)) {
                        spotifyLink.href = data.spotify_url;
                        spotifyLink.style.display = 'inline-flex';
                    } else {
                        spotifyLink.style.display = 'none';
                    }

                    //YTB MUSIC
                    if (data.youtube_url && isSafeUrl(data.youtube_url)) {
                        youtubeLink.href = data.youtube_url;
                    } else {
                        youtubeLink.href = `https://www.youtube.com/results?search_query=${searchQuery}`;
                    }

                    //DEEZER
                    if (data.deezer_url && isSafeUrl(data.deezer_url)) {
                        deezerLink.href = data.deezer_url;
                    } else {
                        deezerLink.href = `https://www.deezer.com/search/${searchQuery}`;
                    }

                    //APPLE MUSIC
                    if (data.apple_music_url && isSafeUrl(data.apple_music_url)) {
                        appleMusicLink.href = data.apple_music_url;
                    } else {
                        appleMusicLink.href = `https://music.apple.com/search?term=${searchQuery}`;
                    }




                    //ide action buttons
                    const actionButtons = document.querySelector('.action-buttons');
                    if (actionButtons) {
                        const tryButton = actionButtons.querySelector('.try-by-yourself-button');
                        Array.from(actionButtons.children).forEach(child => {
                            if (child !== tryButton) {
                                child.style.display = 'none';
                            } else {
                                child.style.display = 'block';
                            }
                        });
                    }
                    const moodConfidence = document.getElementById('mood-confidence');
                    const sharedHeader = document.getElementById('shared-header');
                    
                    if (sharedHeader) sharedHeader.style.display = 'flex'; 
                        const sharedHeaderSubtitle = document.getElementById('shared-header-subtitle');
                        if (sharedHeaderSubtitle) {
                            const sharedHighlight = sharedHeaderSubtitle.querySelector('.shared-highlight');
                            if (sharedHighlight) {
                                if (sharedHeaderSubtitle) {
                                    const sharedHighlight = sharedHeaderSubtitle.querySelector('.shared-highlight');
                                    if (sharedHighlight) {
                                        getCurrentTranslations().then(translations => {
                                            let moodTranslated = getNestedTranslation(translations, `feelings.${data.mood}`) || data.mood;
                                            let subtitle = getNestedTranslation(translations, 'shared.headerSubtitle') || 'Someone felt <i>{{mood}}</i> and thought of you!';
                                            subtitle = subtitle.replace('{{mood}}', `<i>${escapeHTML(moodTranslated)}</i>`);
                                            sharedHighlight.innerHTML = subtitle;
                                        });
                                    }
                                }
                            }
                        }

                    if (moodConfidence) moodConfidence.style.display = 'none';

                    //Play preview if available
                    let audioPreview = document.getElementById('audio-preview');
                    if (!audioPreview) {
                        audioPreview = document.createElement('audio');
                        audioPreview.id = 'audio-preview';
                        document.body.appendChild(audioPreview);
                    } else {
                        audioPreview.pause();
                        audioPreview.currentTime = 0;
                        audioPreview.src = '';
                        audioPreview.load();
                    }

                    if (data.preview) {
                        audioPreview.src = data.preview;
                        audioPreview.load();
                        playButton.style.display = 'flex';

                        let isPlaying = false;
                        playButton.onclick = (e) => {
                            e.stopPropagation();
                            if (isPlaying) {
                                audioPreview.pause();
                                playButton.innerHTML = '<i class="fas fa-play"></i>';
                                isPlaying = false;
                            } else {
                                audioPreview.load();
                                audioPreview.play().then(() => {
                                    playButton.innerHTML = '<i class="fas fa-pause"></i>';
                                    isPlaying = true;
                                }).catch(err => {
                                    playButton.innerHTML = '<i class="fas fa-play"></i>';
                                    isPlaying = false;
                                });
                            }
                        };
                        audioPreview.addEventListener('ended', () => {
                            isPlaying = false;
                            playButton.innerHTML = '<i class="fas fa-play"></i>';
                        });
                    } else {
                        playButton.style.display = 'none';
                    }

                })
                .catch(error => {
                    console.error('Error loading shared song:', error);
                    getCurrentTranslations().then(translations => {
                        showToast(getNestedTranslation(translations, 'toast.sharedSongLoadFailed'), 'error', { timeout: 5000 });
                    });
                });
        } else {
            console.log('No provider or id found in shared URL');
            getCurrentTranslations().then(translations => {
                showToast(getNestedTranslation(translations, 'toast.sharedSongLoadFailed'), 'error', { timeout: 5000 });
            });
        }
    }

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

document.getElementById('try-by-yourself-button').addEventListener('click', function() {

    if (window.location.pathname === '/shared') { // Reset URL to home
        window.history.replaceState({}, '', '/');
    }
    // Hide results popup
    document.getElementById('results-container').classList.remove('show');
    document.getElementById('results-overlay').classList.remove('show');
    document.body.classList.remove('popup-open');
    // Scroll to input
    document.getElementById('mood_input_box').focus();
});