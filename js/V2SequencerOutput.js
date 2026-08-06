class V2SequencerOutput extends V2AppSection {
  #sequencer = null;
  #tracks = null;

  #notifiers = Object.seal({
    changed: [],
  });

  constructor(sequencer) {
    super('output', '--right-from-bracket', 'Output', 'Assign Devices and Notes to Tracks');
    this.#sequencer = sequencer;
    this.addSection();

    new V2AppMenu(this.canvas, (menu) => {
      menu.addElement('button', (e) => {
        e.textContent = 'Reset';
        e.addEventListener('click', () => {
          this.reset();

          for (const notifier of this.#notifiers.changed)
            notifier();
        });
      });
    });

    V2App.addElement(this.canvas, 'ul', (cards) => {
      cards.classList.add('cards', '--grid');

      const tracks = [];
      for (let i = 0; i < this.#sequencer.nTracks; i++)
        tracks[i] = this.#addTrack(cards, i);

      this.#tracks = Object.seal(tracks);
    });

    const devices = this.#sequencer.midi.getDevices('input');
    for (const track of this.#tracks) {
      track.select.update(devices);
    }

    return Object.seal(this);
  }

  addNotifier(type, handler) {
    this.#notifiers[type].push(handler);
  }

  #addTrack(cards, trackIndex) {
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

    V2App.addElement(cards, 'li', (card) => {
      V2App.addElement(card, 'hgroup', (hg) => {
        V2App.addElement(hg, 'h3', (e) => {
          e.innerText = 'Track ' + (trackIndex + 1);
        });
      });

      new V2AppMenu(card, (menu) => {
        menu.addElement('span', (e) => {
          e.textContent = 'Device';
        });

        menu.addItem((li) => {
          track.select = new V2MIDISelect(li);
          track.select.element.classList.add('grow');
        });
      });

      new V2AppMenu(card, (menu) => {
        menu.addElement('span', (e) => {
          e.textContent = 'Channel';
        });

        menu.addElement('select', (select) => {
          track.channelElement = select;
          select.classList.add('grow');

          for (let i = 1; i < 17; i++) {
            V2App.addElement(select, 'option', (e) => {
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

      this.#sequencer.midi.addNotifier('state', (event) => {
        track.select.update(this.#sequencer.midi.getDevices('input'));
        this.#assignDevice(track);
      });

      track.select.addNotifier('select', (device) => {
        if (device) {
          this.#copyDevice(device);

        } else
          track.device = null;

        for (const notifier of this.#notifiers.changed)
          notifier();
      });

      track.select.addNotifier('disconnect', (deviceF) => {
        track.device = null;
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
          text.classList.add('dark');
          text.classList.remove('light');
        } else {
          text.classList.add('light');
          text.classList.remove('dark');
        }
      };

      new V2AppMenu(card, (menu) => {
        menu.element.classList.add('full');

        menu.addElement('span', (e) => {
          e.textContent = 'Note';
          e.classList.add('label');
        });

        menu.addElement('span', (e) => {
          e.classList.add('grow');
          text = e;
        });

        menu.addElement('input', (e) => {
          track.note.element = e;
          e.type = 'number';
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

        menu.addElement('button', (e) => {
          V2App.addElement(e, 'i', (i) => {
            i.classList.add('icon', '--nospace', '--minus');
          });
          e.addEventListener('click', () => {
            track.note.update(Number(this.#tracks[trackIndex].note.element.value) - 1);
          });
        });

        menu.addElement('button', (e) => {
          V2App.addElement(e, 'i', (i) => {
            i.classList.add('icon', '--nospace', '--plus');
          });
          e.addEventListener('click', () => {
            track.note.update(Number(track.note.element.value) + 1);
          });
        });
      });

      V2App.addElement(card, 'input', (e) => {
        range = e;
        e.type = 'range';
        e.min = 21;
        e.max = 108;
        e.value = track.note.element.value;
        e.addEventListener('input', () => {
          track.note.update(e.value);
        });
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

      track.select.selectEntry(device);
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

      track.select.selectEntry(device);
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
