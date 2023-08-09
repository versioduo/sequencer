// © Kay Sievers <kay@versioduo.com>, 2023
// SPDX-License-Identifier: Apache-2.0

class V2SequencerOutput extends V2WebModule {
  #sequencer = null;
  #tracks = null;

  #notifiers = Object.seal({
    changed: [],
  });

  constructor(sequencer) {
    super('output', 'Output', 'Assign devices and notes to tracks');

    this.#sequencer = sequencer;

    V2Web.addButtons(this.canvas, (buttons) => {
      V2Web.addButton(buttons, (e) => {
        e.textContent = 'Reset';
        e.addEventListener('click', () => {
          this.reset();

          for (const notifier of this.#notifiers.changed)
            notifier();
        });
      });
    });

    const tracks = [];
    for (let i = 0; i < this.#sequencer.nTracks; i++)
      tracks[i] = this.#addTrack(i);
    this.#tracks = Object.seal(tracks);

    const devices = this.#sequencer.midi.getDevices('input');
    for (const track of this.#tracks) {
      track.select.update(devices);
    }

    this.attach();
    return Object.seal(this);
  }

  addNotifier(type, handler) {
    this.#notifiers[type].push(handler);
  }

  #addTrack(trackIndex) {
    const track = Object.seal({
      note: Object.seal({
        element: null,
        update: null
      }),
      channelElement: null,
      select: null,
      device: null,
      deviceName: null
    });

    let text = null;
    let range = null;

    if (trackIndex > 0)
      V2Web.addElement(this.canvas, 'hr');

    V2Web.addElement(this.canvas, 'h3', (e) => {
      e.classList.add('subtitle');
      e.innerText = 'Track ' + (trackIndex + 1);
    });

    track.select = new V2MIDISelect(this.canvas, (e) => {
      e.classList.add('mb-3');
    });

    this.#sequencer.midi.addNotifier('state', (event) => {
      track.select.update(this.#sequencer.midi.getDevices('input'));
      this.#assignDevice(track);
    });

    track.select.addNotifier('select', (selected) => {
      if (selected) {
        this.#copyDevice(selected);

      } else
        track.device = null;

      for (const notifier of this.#notifiers.changed)
        notifier();
    });

    track.select.addNotifier('disconnect', (selected) => {
      track.device = null;
    });

    new V2WebField(this.canvas, (field) => {
      field.addButton((e) => {
        e.classList.add('width-label');
        e.classList.add('has-background-grey-lighter');
        e.classList.add('inactive');
        e.textContent = 'Channel';
        e.tabIndex = -1;
      });

      field.addElement('span', (e) => {
        e.classList.add('select');

        V2Web.addElement(e, 'select', (select) => {
          track.channelElement = select;

          for (let i = 1; i < 17; i++) {
            V2Web.addElement(select, 'option', (e) => {
              e.value = i;
              e.text = i;
            });
          }

          select.addEventListener('change', () => {
            for (const notifier of this.#notifiers.changed)
              notifier();
          });
        });
      });
    });

    track.note.update = (number, silent = false) => {
      if (isNull(number) || number < 0 || number > 127)
        return;

      if (!silent) {
        for (const notifier of this.#notifiers.changed)
          notifier();
      }

      track.note.element.value = number;
      range.value = number;

      text.textContent = V2MIDI.Note.getName(number);
      if (V2MIDI.Note.isBlack(number)) {
        text.classList.add('is-dark');
        text.classList.remove('has-background-light');

      } else {
        text.classList.remove('is-dark');
        text.classList.add('has-background-light');
      }
    };

    new V2WebField(this.canvas, (field) => {
      field.addButton((e) => {
        e.classList.add('width-label');
        e.classList.add('has-background-grey-lighter');
        e.classList.add('inactive');
        e.tabIndex = -1;
        e.textContent = 'Note';
      });

      field.addButton((e) => {
        text = e;
        e.classList.add('width-label');
        e.classList.add('inactive');
        e.tabIndex = -1;
      });

      field.addInput('number', (e) => {
        track.note.element = e;
        e.classList.add('width-number');
        e.min = 21;
        e.max = 108;

        e.addEventListener('input', () => {
          track.note.update(e.value);
        });

        e.addEventListener('change', () => {
          if (e.value < 0)
            e.value = 0;

          else if (e.value > 127)
            e.value = 127;

          track.note.update(e.value);
        });
      });

      field.addButton((e) => {
        e.textContent = '-';
        e.style.width = '3rem';
        e.addEventListener('click', () => {
          track.note.update(Number(this.#tracks[trackIndex].note.element.value) - 1);
        });
      });

      field.addButton((e) => {
        e.textContent = '+';
        e.style.width = '3rem';
        e.addEventListener('click', () => {
          track.note.update(Number(track.note.element.value) + 1);
        });
      });
    });

    V2Web.addElement(this.canvas, 'input', (e) => {
      range = e;
      e.classList.add('range');
      e.type = 'range';
      e.min = 21;
      e.max = 108;
      e.value = track.note.element.value;
      e.addEventListener('input', () => {
        track.note.update(e.value);
      });
    });

    track.note.update(60 + trackIndex, true);
    return track;
  }

  reset() {
    let note = 60;
    for (const track of this.#tracks) {
      track.note.update(note, true);
      note++;

      track.channelElement.selectedIndex = 0;

      track.select.setDisconnected();
      track.deviceName = null;
      track.device = null;
    }
  }

  #copyDevice(device) {
    for (const track of this.#tracks) {
      if (track.device)
        continue;

      track.select.select(device);
      track.deviceName = device.name;
      track.device = device.out;
    }
  }

  assignDevices() {
    for (const track of this.#tracks)
      this.#assignDevice(track);
  }

  #assignDevice(track) {
    if (track.device)
      return;

    if (!track.deviceName)
      return;

    for (const device of track.select.getDevices().values()) {
      if (device.name !== track.deviceName)
        continue;

      track.select.select(device);
      track.device = device.out;
      break;
    }
  }

  #getUniqueTracks() {
    const tracks = new Map();

    for (const track of this.#tracks) {
      if (!track.device)
        continue;

      const channel = track.channelElement.selectedIndex;
      tracks.set(track.device.id + ':' + channel, track);
    }

    return tracks.values();
  }

  sendSystemReset() {
    for (const track of this.#getUniqueTracks())
      track.device.send([V2MIDI.Status.systemReset]);
  }

  sendControlChange(number, value = 0) {
    for (const track of this.#getUniqueTracks()) {
      const channel = track.channelElement.selectedIndex;
      track.device.send([V2MIDI.Status.controlChange | channel, number, value]);
    }
  }

  sendNote(trackIndex, velocity, delay) {
    const track = this.#tracks[trackIndex];
    if (!track.device)
      return;

    const channel = track.channelElement.selectedIndex;
    const note = track.note.element.value;
    const timestamp = delay ? performance.now() + delay : undefined;

    if (velocity > 0) {
      track.device.send([V2MIDI.Status.noteOn | channel, note, velocity], timestamp);

    } else
      track.device.send([V2MIDI.Status.noteOff | channel, note, 64], timestamp);
  }

  getConfig() {
    const tracks = [];

    for (const track of this.#tracks) {
      const output = {
        deviceName: track.device ? track.device.name : null,
        channel: track.channelElement.selectedIndex,
        note: Number(track.note.element.value)
      };

      tracks.push(Object.freeze(output));
    }

    return Object.freeze(tracks);
  }

  setConfig(config) {
    for (let track = 0; track < this.#sequencer.nTracks; track++) {
      this.#tracks[track].select.setDisconnected();
      this.#tracks[track].device = null;
      this.#tracks[track].deviceName = config[track].deviceName;
      this.#tracks[track].channelElement.selectedIndex = config[track].channel;
      this.#tracks[track].note.update(config[track].note, true);
    }

    this.assignDevices();
  }
}
