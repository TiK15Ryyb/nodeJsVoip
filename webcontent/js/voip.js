var socketIO = io();

var soundcardSampleRate = null; //Sample rate from the soundcard (is set at mic access)
var mySampleRate = 12000; //Samplerate outgoing audio (common: 8000, 12000, 16000, 24000, 32000, 48000)
var myBitRate = 16; //8,16,32 - outgoing bitrate
var myMinGain = 3 / 100; //min Audiolvl
var micAccessAllowed = false; //Is set to true if user granted access
var chunkSize = 1024;

var downSampleWorker = new Worker("./js/voipWorker.js");
var upSampleWorker = new Worker("./js/voipWorker.js");

var socketConnected = false; //is true if client is connected
var steamBuffer = {}; //Buffers incomeing audio
var steamPos = {};

var oscillator;
var X_LOCATION = 5;
var Y_LOCATION = 5;

function hasGetUserMedia() {
  return !!(
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia
  );
}

socketIO.on("connect", function(socket) {
  console.log("socket connected!");
  socketConnected = true;

  socketIO.on("d", function(data) {
    if (micAccessAllowed) {
      var audioData = onUserCompressedAudio(
        data["a"],
        data["sid"],
        data["s"],
        data["b"]
      );
      upSampleWorker.postMessage({
        inc: true,
        inDataArrayBuffer: audioData, //Audio data
        outSampleRate: soundcardSampleRate,
        outChunkSize: chunkSize,
        socketId: data["sid"],
        inSampleRate: data["s"],
        inBitRate: data["b"],
        p: data["p"],
        x: data["x"],
        y: data["y"]
      });
    }
  });

  socketIO.on("clients", function(cnt) {
    $("#clients").text(cnt);
  });
});

socketIO.on("disconnect", function() {
  console.log("socket disconnected!");
  socketConnected = false;
});

downSampleWorker.addEventListener(
  "message",
  function(e) {
    if (socketConnected) {
      var data = e.data;
      var audioData = onMicCompressedAudio(
        data[0].buffer,
        mySampleRate,
        myBitRate
      );
      socketIO.emit("d", {
        a: audioData, //Audio data
        s: mySampleRate,
        b: myBitRate,
        p: data[1],
        x: X_LOCATION,
        y: Y_LOCATION
      });
    }
  },
  false
);

upSampleWorker.addEventListener(
  "message",
  function(e) {
    var data = e.data;
    var clientId = data[0];
    var voiceData = onUserDecompressedAudio(
      data[1],
      clientId,
      soundcardSampleRate
    );
    if (typeof steamBuffer[clientId] === "undefined") {
      steamPos[clientId] = [];
      steamBuffer[clientId] = [];
    }
    if (steamBuffer[clientId].length > 5) steamBuffer[clientId].splice(0, 1); //If to much audio is inc for some reason... remove
    steamPos[clientId] = [data[2], data[3]];
    steamBuffer[clientId].push(voiceData);
  },
  false
);

function setLocationX(x) {
  X_LOCATION = x;
}

function setLocationY(x) {
  Y_LOCATION = x;
}

function startTalking() {
  if (hasGetUserMedia()) {
    var context = new window.AudioContext() || new window.webkitAudioContext();
    soundcardSampleRate = context.sampleRate;
    navigator.getUserMedia =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;
    navigator.getUserMedia(
      { audio: true },
      function(stream) {
        micAccessAllowed = true;
        var liveSource = context.createMediaStreamSource(stream);

        oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = 440; // value in hertz

        // create a ScriptProcessorNode
        if (!context.createScriptProcessor) {
          node = context.createJavaScriptNode(chunkSize, 1, 1);
        } else {
          node = context.createScriptProcessor(chunkSize, 1, 2);
        }

        node.onaudioprocess = function(e) {
          var inData = e.inputBuffer.getChannelData(0);
          var outDataL = e.outputBuffer.getChannelData(0);
          var outDataR = e.outputBuffer.getChannelData(1);

          inData = onMicRawAudio(inData, soundcardSampleRate); //API Function to change audio data

          downSampleWorker.postMessage({
            //Downsample client mic data
            inc: false, //its audio from the client so false
            inDataArrayBuffer: inData,
            inSampleRate: soundcardSampleRate,
            outSampleRate: mySampleRate,
            outBitRate: myBitRate,
            minGain: myMinGain,
            outChunkSize: chunkSize
          });

          var allSilence = true;
          for (var c in steamBuffer) {
            if (steamBuffer[c].length !== 0) {
              allSilence = false;
              break;
            }
          }
          if (allSilence) {
            for (var i in inData) {
              outDataL[i] = 0;
              outDataR[i] = 0;
            }
          } else {
            var div = false; //true if its not the first audio stream
            for (var c in steamBuffer) {
              if (steamBuffer[c].length != 0) {
                for (var i in steamBuffer[c][0]) {
                  var volumeMultiplier = 1.0;
                  var xDistancce = X_LOCATION - steamPos[c][0];
                  if (Math.abs(xDistancce) <= 1) {
                    volumeMultiplier = 1.0;
                  } else {
                    volumeMultiplier = 0.1 * (1 / Math.max(1, Math.abs(xDistancce)));
                  }
                  var left = xDistancce >= 0;
                  var right = xDistancce <= 0;
                  if (div) {

                    outDataL[i] = (left ? 1 : 0.4) * volumeMultiplier * (outDataL[i] + steamBuffer[c][0][i]) / 2;
                    outDataR[i] = (right ? 1 : 0.4) * volumeMultiplier * (outDataR[i] + steamBuffer[c][0][i]) / 2;
                  }
                  //need to muxing audio
                  else {
                    outDataL[i] = (left ? 1 : 0.4) * volumeMultiplier * steamBuffer[c][0][i];
                    outDataR[i] = (right ? 1 : 0.4) * volumeMultiplier * steamBuffer[c][0][i];
                  }
                }
                steamBuffer[c].splice(0, 1); //remove the audio after putting it in buffer
                div = true;
              }
            }
          }
        };

        //Lowpass
        biquadFilter = context.createBiquadFilter();
        biquadFilter.type = "lowpass";
        biquadFilter.frequency.value = 3000;

        oscillator.connect(biquadFilter);
        //oscillator.start();

        liveSource.connect(biquadFilter);

        //Dynamic Compression
        dynCompressor = context.createDynamicsCompressor();
        dynCompressor.threshold.value = -25;
        dynCompressor.knee.value = 9;
        dynCompressor.ratio.value = 8;
        dynCompressor.reduction.value = -20;
        dynCompressor.attack.value = 0.0;
        dynCompressor.release.value = 0.25;

        biquadFilter.connect(dynCompressor); //biquadFilter infront
        dynCompressor.connect(node);

        node.connect(context.destination);
      },
      function(err) {
        console.log(err);
      }
    );
  } else {
    alert("getUserMedia() is not supported in your browser");
  }
}

/* API FUNCTIONS */

var onMicRawAudio = function(audioData, soundcardSampleRate) {
  //Data right after mic input
  return audioData;
};

var onMicCompressedAudio = function(audioData, sampleRate, bitRate) {
  //Mic data after changeing bit / samplerate
  return audioData;
};

var onUserCompressedAudio = function(audioData, userId, sampleRate, bitRate) {
  //Called when user audiodata coming from the client
  return audioData;
};

var onUserDecompressedAudio = function(audioData, userId, sampleRate) {
  //Called when user audiodata coming from the client
  return audioData;
};
