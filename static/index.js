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
    const topTrackTitle = document.getElementById('top-track-title');
    const topTrackArtist = document.getElementById('top-track-artist');
    const topTrackImage = document.getElementById('top-track-image');
    const topTrackLink = document.getElementById('top-track-link');
    
    resultsContainer.style.display = 'block';
    

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

    // Disable button during submission
    function setButtonState(disabled) {
        submitMoodButton.disabled = disabled;
        submitMoodButton.textContent = disabled ? 'Processing...' : 'Submit';
    }

    submitMoodButton.addEventListener('click', async () => {
        const moodInput = moodInputBox.value.trim();

        try {
            validateMoodInput(moodInput);
            setButtonState(true);
            
            await submitMood(moodInput, setButtonState);
            
            //Clear input after successful submission
            moodInputBox.value = '';
            
        } catch (error) {
            alert(error.message);
            setButtonState(false); //reset button state on error
        }
    });

    //Sumit on enter key
    moodInputBox.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            submitMoodButton.click();
        }
    });
});