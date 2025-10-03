class V2Sequencer extends V2WebModule {
  midi = null;

  nTracks = 4;
  nQuarters = 16;

  #version = null;
  #library = null;
  #output = null;

  #notifiers = Object.seal({
    changed: [],
  });

  #notify = null;

  #playButton = null;
  #stopButton = null;

  #volume = Object.seal({
    element: null,
    update: null
  });

  #bpm = Object.seal({
    element: null,
    update: null
  });

  #pads = null;

  #velocity = Object.seal({
    element: null,
    update: null
  });

  #edit = Object.seal({
    track: null,
    quarter: 0
  });

  #run = Object.seal({
    wakeLock: null,
    timer: null,
    quarter: 0
  });

  constructor() {
    super('player');

    this.#notify = new V2WebNotify(this.canvas);

    this.midi = new V2MIDI();
    this.midi.setup((error) => {
      if (error) {
        this.#notify.error(error);
        return;
      }
    });

    V2Web.addButtons(this.canvas, (buttons) => {
      V2Web.addButton(buttons, (e) => {
        e.textContent = 'Reset';
        e.addEventListener('click', () => {
          this.#reset();

          for (const notifier of this.#notifiers.changed)
            notifier();
        });
      });

      V2Web.addButton(buttons, (e) => {
        this.#stopButton = e;
        e.textContent = 'Stop';
        e.disabled = true;

        e.addEventListener('click', () => {
          this.#stop();
        });
      });

      V2Web.addButton(buttons, (e) => {
        this.#playButton = e;
        e.classList.add('is-link');
        e.textContent = 'Play';

        e.addEventListener('click', () => {
          this.#play();
        });
      });
    });


    {
      let range = null;

      this.#volume.update = (number) => {
        if (isNull(number))
          return;

        if (number < 0)
          number = 0;

        else if (number > 127)
          number = 127;

        this.#volume.element.value = number;
        range.value = number;
        this.#output.sendControlChange(V2MIDI.CC.channelVolume, Number(number));
      };

      new V2WebField(this.canvas, (field) => {
        field.addButton((e) => {
          e.classList.add('width-label');
          e.classList.add('has-background-grey-lighter');
          e.classList.add('inactive');
          e.textContent = 'CC 7';
          e.tabIndex = -1;
        });

        field.addButton((e) => {
          e.classList.add('width-text');
          e.classList.add('has-background-light');
          e.classList.add('inactive');
          e.textContent = 'Volume';
          e.tabIndex = -1;
        });

        field.addInput('number', (e) => {
          this.#volume.element = e;
          e.classList.add('width-number');
          e.max = 127;
          e.value = 100;
          e.addEventListener('input', () => {
            this.#volume.update(e.value);
          });
        });
      });

      V2Web.addElement(this.canvas, 'input', (e) => {
        range = e;
        e.classList.add('range');
        e.type = 'range';
        e.max = 127;
        e.value = 100;
        e.addEventListener('input', () => {
          this.#volume.update(e.value);
        });
      });
    }

    {
      let range = null;

      this.#bpm.update = (number, silent = false) => {
        if (isNull(number) || number < 20 || number > 999)
          return;

        if (!silent) {
          for (const notifier of this.#notifiers.changed)
            notifier();
        }

        this.#bpm.element.value = number;
        range.value = number;

        if (this.#run.timer !== null)
          this.#setTimer();
      };

      new V2WebField(this.canvas, (field) => {
        field.addButton((e) => {
          e.classList.add('width-label');
          e.classList.add('has-background-grey-lighter');
          e.classList.add('inactive');
          e.textContent = 'BPM';
        });

        field.addInput('number', (e) => {
          this.#bpm.element = e;
          e.classList.add('width-number');
          e.min = 20;
          e.max = 999;
          e.value = 120;
          e.addEventListener('input', (event) => {
            this.#bpm.update(e.value);
          });
          e.addEventListener('change', () => {
            if (e.value < 20)
              e.value = 20;

            else if (e.value > 999)
              e.value = 999;

            this.#bpm.update(e.value);
          });
        });

        field.addButton((e) => {
          e.textContent = '-';
          e.style.width = '3rem';
          e.addEventListener('click', () => {
            this.#bpm.update(Number(this.#bpm.element.value) - 1);
          });
        });

        field.addButton((e) => {
          e.textContent = '+';
          e.style.width = '3rem';
          e.addEventListener('click', () => {
            this.#bpm.update(Number(this.#bpm.element.value) + 1);
          });
        });
      });

      V2Web.addElement(this.canvas, 'input', (e) => {
        range = e;
        e.type = 'range';
        e.classList.add('range');
        e.min = 20;
        e.max = 999;
        e.value = this.#bpm.element.value;
        e.addEventListener('input', (event) => {
          this.#bpm.update(e.value);
        });
      });
    }

    V2Web.addElement(this.canvas, 'div', (e) => {
      e.classList.add('mt-4');
      e.classList.add('mb-5');

      class Pad {
        element = null;
        velocity = 0;
        active = false;

        constructor(element) {
          this.element = element;
          return Object.seal(this);
        }

        // Changes the brightness of the pad from grey to black, depending on the velocity.
        setVelocity(velocity, quarter) {
          this.velocity = Number(velocity);

          if (this.velocity > 0) {
            this.element.style.backgroundColor = V2Sequencer.getVelocityHSL(this.velocity);

          } else {
            if (Math.floor(quarter / 4) % 2)
              this.element.style.backgroundColor = 'hsl(0, 0%, 96%)';

            else
              this.element.style.backgroundColor = 'hsl(0, 0%, 100%)';
          }
        }
      };

      const rows = [];

      for (let track = 0; track < this.nTracks; track++) {
        new V2WebField(e, (field) => {
          const row = [];

          for (let quarter = 0; quarter < this.nQuarters; quarter++) {
            field.addButton((e, p) => {
              p.classList.add('is-expanded');
              e.classList.add('pad');

              const pad = new Pad(e);
              row[quarter] = pad;
              pad.setVelocity(0, quarter);

              pad.element.addEventListener('mousedown', () => {
                for (const notifier of this.#notifiers.changed)
                  notifier();

                if (pad.velocity === 0) {
                  pad.setVelocity(this.#velocity.element.value, quarter);

                } else {
                  if (this.#edit.track === track && this.#edit.quarter === quarter) {
                    pad.setVelocity(0, quarter);
                    return;
                  }

                  this.#velocity.update(pad.velocity, true);
                }

                this.#edit.track = track;
                this.#edit.quarter = quarter;
              });
            });
          }

          rows[track] = row;
        });
      }

      this.#pads = Object.seal(rows);
      this.#highlightQuarter();
    });

    {
      let range = null;

      this.#velocity.update = (number, suppress = false) => {
        if (isNull(number) || number < 1 || number > 127)
          return;

        this.#velocity.element.value = number;
        range.value = number;

        if (!suppress && this.#edit.track !== null)
          this.#pads[this.#edit.track][this.#edit.quarter].setVelocity(number, this.#edit.quarter);
      };

      new V2WebField(this.canvas, (field) => {
        field.addButton((e) => {
          e.classList.add('width-label');
          e.classList.add('has-background-grey-lighter');
          e.classList.add('inactive');
          e.textContent = 'Velocity';
        });

        field.addInput('number', (e) => {
          this.#velocity.element = e;
          e.classList.add('width-number');
          e.min = 1;
          e.max = 127;
          e.value = 64;
          e.addEventListener('input', (event) => {
            this.#velocity.update(e.value);
          });

          e.addEventListener('change', () => {
            if (e.value < 1)
              e.value = 1;

            else if (e.value > 127)
              e.value = 127;
          });
        });
      });

      V2Web.addElement(this.canvas, 'input', (e) => {
        range = e;
        e.type = 'range';
        e.classList.add('range');
        e.min = 1;
        e.max = 127;
        e.value = 64;
        e.addEventListener('input', (event) => {
          this.#velocity.update(e.value);
        });
      });
    }

    V2Web.addElement(this.canvas, 'div', (e) => {
      this.#version = e;
      e.classList.add('is-flex');
      e.classList.add('is-justify-content-end');
      e.innerHTML = '<a href=' + document.querySelector('link[rel="source"]').href +
        ' target="software">' + document.querySelector('meta[name="name"]').content +
        '</a>, version ' + Number(document.querySelector('meta[name="version"]').content);
    });

    this.attach();

    this.#library = new V2SequencerLibrary(this);
    this.#output = new V2SequencerOutput(this);
    this.#output.assignDevices();

    this.#output.addNotifier('changed', () => {
      for (const notifier of this.#notifiers.changed)
        notifier();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.repeat)
        return;

      if (ev.code === 'Space') {
        ev.preventDefault();

        if (this.#run.timer !== null)
          this.#stop();

        else
          this.#play();
      }
    });

    return Object.seal(this);
  }

  addNotifier(type, handler) {
    this.#notifiers[type].push(handler);
  }

  static getVelocityHSL(velocity) {
    const fraction = 1 - (velocity / 127);
    const brightness = Math.floor(10 + (60 * fraction));
    return 'hsl(0, 0%, ' + brightness + '%)';
  }

  #reset() {
    this.#output.sendSystemReset();

    this.#stop();
    this.#edit.track = null;
    this.#volume.update(100);
    this.#bpm.update(120, true);
    this.#velocity.update(64);

    for (let track = 0; track < this.nTracks; track++)
      for (let quarter = 0; quarter < this.nQuarters; quarter++)
        this.#pads[track][quarter].setVelocity(0, quarter);
  }

  #highlightQuarter(on = true) {
    for (let track = 0; track < this.nTracks; track++) {
      if (on)
        this.#pads[track][this.#run.quarter].element.classList.add('is-focused');

      else
        this.#pads[track][this.#run.quarter].element.classList.remove('is-focused');
    }
  }

  #sendNotesOff() {
    let delay = 0;
    for (let track = 0; track < this.nTracks; track++) {
      const pad = this.#pads[track][this.#run.quarter];
      if (pad.active) {
        this.#output.sendNote(track, 0, delay);
        delay++;
        pad.active = false;
      }
    }
  }

  #sendNotes() {
    // Bug 2023-07, MacOS 13.4.1, Chrome 114: Sending multiple messages without any delay
    // in-between sends invalid MIDI messages to the operating system. Messages with
    // 3 zero bytes are transmitted instead of the original message data. Just queue and
    // delay consecutive messages by one millisecond to work around it.
    let delay = 0;
    for (let track = 0; track < this.nTracks; track++) {
      const pad = this.#pads[track][this.#run.quarter];
      if (pad.velocity > 0) {
        this.#output.sendNote(track, pad.velocity, delay);
        delay++;
        pad.active = true;
      }
    }
  }

  #timerHandler() {
    this.#sendNotesOff();
    this.#highlightQuarter(false);

    this.#run.quarter++;
    if (this.#run.quarter == this.nQuarters)
      this.#run.quarter = 0;

    this.#highlightQuarter();
    this.#sendNotes();
  }

  #setTimer() {
    if (this.#run.timer !== null)
      clearInterval(this.#run.timer);

    const quarterSec = 60 / this.#bpm.element.value;
    this.#run.timer = setInterval(this.#timerHandler.bind(this), quarterSec * 250);
  }

  #play() {
    if (this.#version) {
      this.#version.remove();
      this.#version = null;
    }

    this.#notify.clear();

    this.#playButton.disabled = true;
    this.#stopButton.disabled = false;

    const requestWakeLock = async () => {
      if (navigator.wakeLock) {
        this.#run.wakeLock = await navigator.wakeLock.request('screen');
        this.#run.wakeLock.onrelease = () => {
          this.#stop();
          this.#notify.warn('The playback was paused because the application moved into the background.');
        };
      }

      this.#sendNotes();
      this.#setTimer();
    };

    requestWakeLock();
  }

  #releaseWakeLock() {
    if (!this.#run.wakeLock)
      return;

    this.#run.wakeLock.onrelease = null;
    this.#run.wakeLock.release();
    this.#run.wakeLock = null;
  }

  #cleanupPlay() {
    this.#sendNotesOff();

    this.#highlightQuarter(false);
    this.#run.quarter = 0;
    this.#highlightQuarter();

    this.#output.sendControlChange(V2MIDI.CC.allNotesOff);
  }

  #stop() {
    if (this.#run.timer !== null) {
      clearInterval(this.#run.timer);
      this.#run.timer = null;
    }

    this.#notify.clear();
    this.#playButton.disabled = false;
    this.#stopButton.disabled = true;

    this.#releaseWakeLock();
    this.#cleanupPlay();
  }

  getConfig() {
    const config = {
      bpm: Number(this.#bpm.element.value),
      tracks: [],
      tracksOutput: null
    };

    for (let track = 0; track < this.nTracks; track++) {
      const quarters = [];
      for (let quarter = 0; quarter < this.nQuarters; quarter++)
        quarters.push(this.#pads[track][quarter].velocity);

      config.tracks.push(Object.freeze(quarters));
    }

    config.tracksOutput = this.#output.getConfig();
    return config;
  }

  setConfig(config) {
    this.#edit.track = null;

    if (config.bpm > 0)
      this.#bpm.update(config.bpm, true);

    for (let track = 0; track < this.nTracks; track++)
      for (let quarter = 0; quarter < this.nQuarters; quarter++)
        this.#pads[track][quarter].setVelocity(config.tracks[track][quarter], quarter);

    this.#cleanupPlay();
    this.#output.setConfig(config.tracksOutput);

    if (this.#run.timer !== null)
      this.#sendNotes();
  }
}
