// © Kay Sievers <kay@versioduo.com>, 2023
// SPDX-License-Identifier: Apache-2.0

class V2SequencerLibrary extends V2WebModule {
  #sequencer = null;

  #addButton = null;
  #deleteButton = null;

  #list = null;

  constructor(sequencer) {
    super('library', 'Library', 'Store and load patterns');

    this.#sequencer = sequencer;

    V2Web.addButtons(this.canvas, (buttons) => {
      V2Web.addButton(buttons, (e) => {
        this.#addButton = e;
        e.disabled = true;
        e.textContent = 'Add';

        e.addEventListener('click', () => {
          const entry = this.#addEntry(this.#sequencer.getConfig());
          this.#selectEntry(entry);

          V2SequencerDatabase.add(entry.config, (id) => {
            entry.config.id = id;
          });
        });
      });

      V2Web.addButton(buttons, (e) => {
        this.#deleteButton = e;
        e.disabled = true;
        e.textContent = 'Delete';

        e.addEventListener('click', () => {
          if (!this.#list.selected)
            return;

          V2SequencerDatabase.delete(this.#list.selected.config.id);
          this.#list.selected.element.remove();

          this.#list.entries = this.#list.entries.filter((entry) => {
            return entry !== this.#list.selected;
          });

          this.#list.selected = null;
          this.#deleteButton.disabled = true;
        });
      });
    });

    V2Web.addElement(this.canvas, 'ul', (e) => {
      this.#list = Object.seal({
        element: e,
        entries: [],
        selected: null
      });
    });

    this.#sequencer.addNotifier('changed', () => {
      this.#addButton.disabled = false;
      this.#selectEntry();
    });

    V2SequencerDatabase.forEach((entries) => {
      for (const entry of entries)
        this.#addEntry(entry);
    });

    this.attach();
    return Object.seal(this);
  }

  #selectEntry(e) {
    this.#list.selected = null;

    for (const entry of this.#list.entries) {
      if (e === entry) {
        this.#list.selected = e;
        entry.element.style.opacity = '100%';

      } else
        entry.element.style.opacity = '50%';
    }
  }

  #addEntry(config) {
    const entry = Object.seal({
      element: document.createElement('li'),
      id: null,
      config: config
    });

    entry.element.classList.add('library-entry');
    entry.element.style.opacity = '50%';
    entry.element.addEventListener('click', () => {
      this.#selectEntry(entry);
      this.#sequencer.setConfig(this.#list.selected.config);
      this.#addButton.disabled = true;
      this.#deleteButton.disabled = false;
    });

    for (let track = 0; track < this.#sequencer.nTracks; track++) {
      V2Web.addElement(entry.element, 'div', (row) => {
        row.style.width = '100%';
        row.style.height = '0.5rem';
        row.style.clear = 'left';

        for (let quarter = 0; quarter < this.#sequencer.nQuarters; quarter++) {
          V2Web.addElement(row, 'div', (e) => {
            e.style.float = 'left';
            e.style.width = '6.25%';
            e.style.height = '100%';
            if (entry.config.tracks[track][quarter] > 0)
              e.style.backgroundColor = V2Sequencer.getVelocityHSL(entry.config.tracks[track][quarter]);
          });;
        }
      });
    }


    this.#list.element.insertAdjacentElement('afterbegin', entry.element);
    this.#list.entries.push(entry);

    this.#addButton.disabled = true;
    this.#deleteButton.disabled = false;

    return entry;
  }
}
