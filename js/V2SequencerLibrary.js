class V2SequencerLibrary extends V2AppSection {
  #notify = null;
  #addButton = null;
  #deleteButton = null;
  #copyButton = null;
  #pasteButton = null;
  #list = null;

  constructor(app) {
    super(app, 'library', '--book-open-reader', 'Library', 'Store and Load Patterns');
    Object.seal(this);
    this.addSection();

    this.#notify = new V2AppNotify(this.canvas);

    new V2AppMenu(this.canvas, (menu) => {
      menu.addElement('button', (e) => {
        this.#addButton = e;
        e.classList.add('primary');
        e.disabled = true;
        e.textContent = 'Add';

        e.addEventListener('click', () => {
          this.#notify.clear();

          const entry = this.#addEntry(this.app.main.getConfig());
          this.#selectEntry(entry);

          V2SequencerDatabase.add(entry.config, (id) => {
            entry.config.id = id;
          });
        });
      });

      menu.addElement('button', (e) => {
        this.#deleteButton = e;
        e.disabled = true;
        e.textContent = 'Delete';

        e.addEventListener('click', () => {
          this.#notify.clear();

          if (!this.#list.selected)
            return;

          V2SequencerDatabase.delete(this.#list.selected.config.id);
          this.#list.selected.element.remove();

          this.#list.entries = this.#list.entries.filter((entry) => {
            return entry !== this.#list.selected;
          });

          this.#selectEntry();
        });
      });

      menu.addElement('button', (e) => {
        this.#copyButton = e;
        e.disabled = true;
        e.textContent = 'Copy';

        e.addEventListener('click', () => {
          this.#notify.clear();

          const config = {
            'com.versioduo.sequencer.pattern': this.app.main.getConfig()
          };

          navigator.clipboard.writeText(JSON.stringify(config)).then(() => {
            this.#notify.info("Pattern copied to clipboard.");

          }, () => {
            this.#notify.warn("Failed to copy pattern to clipboard.");
          });
        });
      });

      menu.addElement('button', (e) => {
        this.#pasteButton = e;
        e.textContent = 'Paste';

        e.addEventListener('click', () => {
          this.#notify.clear();

          navigator.clipboard.readText().then((data) => {
            let jsonObject;

            try {
              jsonObject = JSON.parse(data);

            } catch (error) {
              this.#notify.warn("No pattern found in clipboard.");
              return;
            }

            const entry = jsonObject['com.versioduo.sequencer.pattern'];
            if (!entry) {
              this.#notify.warn("No valid pattern found in clipboard.");
              return;
            }

            V2SequencerDatabase.add(entry, (id) => {
              entry.id = id;
            });

            this.#addEntry(entry);
          });
        });
      });
    });

    V2App.addElement(this.canvas, 'ul', (e) => {
      this.#list = Object.seal({
        element: e,
        entries: [],
        selected: null
      });
    });

    this.app.main.addNotifier('changed', () => {
      this.#notify.clear();
      this.#selectEntry();
    });

    V2SequencerDatabase.forEach((entries) => {
      for (const entry of entries)
        this.#addEntry(entry);
    });
  }

  #selectEntry(e) {
    this.#list.selected = null;

    for (const entry of this.#list.entries) {
      if (e === entry) {
        this.#list.selected = e;
        entry.element.style.opacity = 1;

      } else
        entry.element.style.opacity = 0.5;
    }

    this.#addButton.disabled = this.#list.selected !== null;
    this.#deleteButton.disabled = this.#list.selected === null;
    this.#copyButton.disabled = this.#list.selected === null;
  }

  #addEntry(config) {
    const entry = Object.seal({
      element: document.createElement('li'),
      id: null,
      config: config
    });

    entry.element.style.marginLeft = 'auto';
    entry.element.style.marginRight = 'auto';
    entry.element.style.width = 'calc(100% - 1rem)';
    entry.element.style.opacity = 0.6;
    entry.element.style.backgroundColor = 'var(--colour-background-light)';
    entry.element.style.marginBottom = '0.5rem';
    entry.element.addEventListener('click', () => {
      this.#selectEntry(entry);
      this.app.main.setConfig(this.#list.selected.config);
    });

    for (let track = 0; track < this.app.main.nTracks; track++) {
      V2App.addElement(entry.element, 'div', (row) => {
        row.style.width = '100%';
        row.style.height = '0.5rem';
        row.style.clear = 'left';

        for (let quarter = 0; quarter < this.app.main.nQuarters; quarter++) {
          V2App.addElement(row, 'div', (e) => {
            e.style.float = 'left';
            e.style.width = '6.25%';
            e.style.height = '100%';
            if (entry.config.tracks[track][quarter] > 0)
              e.style.backgroundColor = 'hsl(0, 0%, ' + this.app.main.getBrightness(entry.config.tracks[track][quarter]) + '%)';
          });
        }
      });
    }

    this.#list.element.insertAdjacentElement('afterbegin', entry.element);
    this.#list.entries.push(entry);
    return entry;
  }
}
