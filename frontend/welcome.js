function selectStep(buttonElement, title, description) {
    // Remove active class from all buttons

    const videoBlock = document.getElementById('videoDetailsBlock');
    const purposeBlock = document.getElementById('purposeDetailsBlock');
    const videoWrapper = document.querySelector('.video-wrapper');
    purposeBlock.style.display = 'none';
    videoBlock.style.display = 'block';
    videoWrapper.style.display = 'flex';


    // Get video source URL
    const newVideoSrc = buttonElement.getAttribute('data-video');

    // Update player and details
    const videoPlayer = document.getElementById('tutorialVideo');
    const videoSource = document.getElementById('videoSource');
    
    videoSource.src = newVideoSrc;
    videoPlayer.load();
    videoPlayer.play();

    document.getElementById('videoTitle').textContent = title;
    document.getElementById('videoDesc').textContent = description;
}

function purpose() {
    const videoBlock = document.getElementById('videoDetailsBlock');
    const purposeBlock = document.getElementById('purposeDetailsBlock');
    const videoWrapper = document.querySelector('.video-wrapper');
    videoBlock.style.display = 'none';
    videoWrapper.style.display = 'none';
    purposeBlock.style.display = 'block';

}