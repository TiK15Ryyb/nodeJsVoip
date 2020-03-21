$(document).ready(function() {
  $("#startBtn").click(function() {
    $(this).hide();
    startTalking();
  });

  $('#posX').on('change keyup', function() {
    setLocationX(this.value);
  });
  $('#posY').on('change keyup', function() {
    setLocationY(this.value);
  });

  var micaudio = document.getElementById("micaudio");
  var micctx = micaudio.getContext("2d");
  micctx.fillStyle = "#FF0000";

  var incaudio = document.getElementById("incaudio");
  var incctx = incaudio.getContext("2d");
  incctx.fillStyle = "#FF0000";

  onMicRawAudio = function(audioData, soundcardSampleRate) {
    //Data right after mic input
    micctx.clearRect(0, 0, micaudio.width, micaudio.height);
    for (var i = 0; i < audioData.length; i++) {
      micctx.fillRect(i, audioData[i] * 100 + 100, 1, 1);
    }
    return audioData;
  };

  onUserDecompressedAudio = function(audioData, userId, sampleRate, bitRate, posX) {
    //Called when user audiodata coming from the client
    incctx.clearRect(0, 0, incaudio.width, incaudio.height);
    for (var i = 0; i < audioData.length; i++) {
      incctx.fillRect(i, audioData[i] * 100 + 100, 1, 1);
    }
    return audioData;
  };
});
