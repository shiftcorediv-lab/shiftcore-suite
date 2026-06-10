const RoleplayTimer = (function () {
  let totalSeconds = 300;
  let remainingSeconds = 300;
  let timerId = null;

  function init() {
    const display = document.getElementById('timerDisplay');
    const message = document.getElementById('timerMessage');

    document.querySelectorAll('.timer-preset').forEach((button) => {
      button.addEventListener('click', () => {
        const minutes = Number(button.dataset.minutes);
        setMinutes(minutes);
      });
    });

    document.getElementById('timerStartButton').addEventListener('click', start);
    document.getElementById('timerPauseButton').addEventListener('click', pause);
    document.getElementById('timerResetButton').addEventListener('click', reset);

    updateDisplay(display);
    message.textContent = '';
  }

  function setMinutes(minutes) {
    pause();
    totalSeconds = minutes * 60;
    remainingSeconds = totalSeconds;
    document.getElementById('timerMessage').textContent = '';
    updateDisplay(document.getElementById('timerDisplay'));
  }

  function start() {
    if (timerId) return;

    document.getElementById('timerMessage').textContent = '';

    timerId = setInterval(() => {
      remainingSeconds -= 1;
      updateDisplay(document.getElementById('timerDisplay'));

      if (remainingSeconds <= 0) {
        pause();
        remainingSeconds = 0;
        updateDisplay(document.getElementById('timerDisplay'));
        document.getElementById('timerMessage').textContent = '時間終了！振り返りに進んでください。';
      }
    }, 1000);
  }

  function pause() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function reset() {
    pause();
    remainingSeconds = totalSeconds;
    document.getElementById('timerMessage').textContent = '';
    updateDisplay(document.getElementById('timerDisplay'));
  }

  function updateDisplay(display) {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return {
    init
  };
})();
