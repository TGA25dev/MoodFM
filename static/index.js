async function fetch_best_music(mood, setButtonState) {
    console.log(`Fetching best music for mood: ${mood}`);
    
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
    const topTrackLink = document.getElementById('top-track-link');
    
    // Show popup with animation and overlay
    resultsContainer.classList.add('show');
    resultsOverlay.classList.add('show');
    

    topTrackTitle.textContent = data.spotify?.name || 'Unknown Title';
    topTrackArtist.textContent = data.spotify?.artist || 'Unknown Artist';
    topTrackLink.href = data.spotify?.url || '#';
    topTrackLink.textContent = 'Listen on Spotify';
    
    // Fix: Use cover_image instead of image
    if (data.spotify?.cover_image) {
        topTrackImage.src = data.spotify.cover_image;
        topTrackImage.style.display = 'block';
    } else {
        topTrackImage.style.display = 'none'; // Hide image if not available
    }
    
    topTrackImage.alt = `${data.spotify?.name || 'Unknown'} by ${data.spotify?.artist || 'Unknown'}`;
    
    if (setButtonState) {
        setButtonState(false); 
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
            await fetch_best_music(data.dominant_mood, setButtonState);
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

document.addEventListener('DOMContentLoaded', () => {
    const submitMoodButton = document.getElementById('submit_mood_button');
    const moodInputBox = document.getElementById('mood_input_box');

    const resultsContainer = document.querySelector('.results-container');
    const topTrackTitle = document.getElementById('top-track-title');
    const topTrackArtist = document.getElementById('top-track-artist');
    const topTrackImage = document.getElementById('top-track-image'); 

    // Store the last processed mood for rerolling
    let lastProcessedMood = null;

    // Dynamic placeholder configuration
    const placeholders = [
        "Just got home, I failed my exam...",
        "I'm going to a party tonight!",
        "I'm so tired, I need to sleep..",
        "That day was awful! I'm fed up with everything !",
        "Its summer, its hot, what an amazing day to go out !!",
        "I just crashed my car, I feel so bad...",
        "That day was amazing! I feel so happy!",
        "I got the job! Didn't think I would!"
    ];

    let currentPlaceholderIndex = 0;
    let currentText = '';
    let isTyping = true;
    let charIndex = 0;

    function typeEffect() {
        const currentPlaceholder = placeholders[currentPlaceholderIndex];
        
        if (isTyping) {
            // Typing phase
            if (charIndex < currentPlaceholder.length) {
                currentText += currentPlaceholder.charAt(charIndex);
                moodInputBox.placeholder = currentText;
                charIndex++;
                setTimeout(typeEffect, 50 + Math.random() * 50); //typing speed
            } else {
                // Wait phase
                isTyping = false;
                setTimeout(typeEffect, 1500); //Wait 2 seconds before deleting
            }
        } else {
            // Deleting phase
            if (currentText.length > 0) {
                currentText = currentText.slice(0, -1);
                moodInputBox.placeholder = currentText;
                setTimeout(typeEffect, 50 + Math.random() * 50); // deletion spee
            } else {

                isTyping = true;
                charIndex = 0;
                currentPlaceholderIndex = (currentPlaceholderIndex + 1) % placeholders.length;
                setTimeout(typeEffect, 500);
            }
        }
    }

    // Start the typing effect
    typeEffect();

    // Pause typing animation when user focuses on input
    moodInputBox.addEventListener('focus', () => {
    });

    //Resume typing animation when user leaves inpu
    moodInputBox.addEventListener('blur', () => {
        if (moodInputBox.value.trim() === '') {
            setTimeout(typeEffect, 1000);
        }
    });

    // Disable button during submission
    function setButtonState(disabled) {
        submitMoodButton.disabled = disabled;
        submitMoodButton.textContent = disabled ? 'Analysing your feelings...' : 'Turn your mood into music ';
    }

    function setFindAnotherButtonState(disabled) {
        const findAnotherButton = document.getElementById('find-another-button');
        findAnotherButton.disabled = disabled;
        findAnotherButton.textContent = disabled ? 'Finding another song...' : 'Find Another Song';
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