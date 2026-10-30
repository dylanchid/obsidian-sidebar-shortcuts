"use strict";

const { Notice, Plugin, PluginSettingTab, Setting, setIcon } = require("obsidian");

const SHORTCUTS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "canvas", label: "Canvas", icon: "layout-dashboard" },
  { id: "draw", label: "Draw", icon: "pencil-ruler" },
  { id: "base", label: "Base", icon: "database" },
  { id: "spaced-repetition", label: "Spaced repetition", icon: "brain" },
];

const DEFAULT_SETTINGS = {
  homePath: "",
  visible: { home: true, canvas: true, draw: false, base: true, "spaced-repetition": false },
};

class SidebarShortcutsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Home note path")
      .setDesc("Vault-relative path to the note opened by Home. Leave blank to hide Home.")
      .addText((text) => text.setPlaceholder("Home.md").setValue(this.plugin.settings.homePath)
        .onChange(async (value) => {
          this.plugin.settings.homePath = value.trim();
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl).setName("Destinations").setHeading();
    for (const shortcut of SHORTCUTS) {
      if (shortcut.id === "home") continue;
      new Setting(containerEl)
        .setName(shortcut.label)
        .setDesc("Show this destination above the file explorer.")
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.visible[shortcut.id])
          .onChange(async (value) => {
            this.plugin.settings.visible[shortcut.id] = value;
            await this.plugin.saveSettings();
          }));
    }
  }
}

class SidebarShortcutsPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData() ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      visible: { ...DEFAULT_SETTINGS.visible, ...(saved.visible ?? {}) },
    };
    this.addSettingTab(new SidebarShortcutsSettingTab(this.app, this));
    for (const shortcut of SHORTCUTS) {
      this.addCommand({
        id: `open-${shortcut.id}`,
        name: `Open ${shortcut.label}`,
        callback: () => this.openShortcut(shortcut.id),
      });
    }

    this.app.workspace.onLayoutReady(() => {
      this.render();

      this.observer = new MutationObserver(() => this.scheduleRender());
      this.observer.observe(document.body, { childList: true, subtree: true });
      this.register(() => this.observer?.disconnect());

      this.registerEvent(
        this.app.workspace.on("active-leaf-change", () => this.updateActiveState())
      );
    });
  }

  onunload() {
    document.querySelectorAll(".sidebar-shortcuts").forEach((el) => el.remove());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    document.querySelectorAll(".sidebar-shortcuts").forEach((el) => el.remove());
    this.render();
  }

  visibleShortcuts() {
    return SHORTCUTS.filter((shortcut) =>
      this.settings.visible[shortcut.id] && (shortcut.id !== "home" || this.settings.homePath));
  }

  scheduleRender() {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 50);
  }

  render() {
    const leaves = this.app.workspace.getLeavesOfType("file-explorer");

    for (const leaf of leaves) {
      const container = leaf.view?.containerEl;
      const fileTree = container?.querySelector(".nav-files-container");
      if (!fileTree || container.querySelector(".sidebar-shortcuts")) continue;

      const section = document.createElement("section");
      section.className = "sidebar-shortcuts";
      section.setAttribute("aria-label", "Shortcuts");

      const heading = document.createElement("div");
      heading.className = "sidebar-shortcuts__heading";
      heading.textContent = "Shortcuts";
      section.appendChild(heading);

      const list = document.createElement("div");
      list.className = "sidebar-shortcuts__list";
      section.appendChild(list);

      for (const shortcut of this.visibleShortcuts()) {
        const button = document.createElement("button");
        button.className = "sidebar-shortcuts__item";
        button.type = "button";
        button.dataset.shortcut = shortcut.id;
        button.setAttribute("aria-label", `Open ${shortcut.label}`);

        const icon = document.createElement("span");
        icon.className = "sidebar-shortcuts__icon";
        setIcon(icon, shortcut.icon);

        const label = document.createElement("span");
        label.className = "sidebar-shortcuts__label";
        label.textContent = shortcut.label;

        button.append(icon, label);
        button.addEventListener("click", () => this.openShortcut(shortcut.id));
        list.appendChild(button);
      }

      fileTree.parentElement.insertBefore(section, fileTree);
    }

    this.updateActiveState();
  }

  updateActiveState() {
    const active = this.activeShortcut();
    document.querySelectorAll(".sidebar-shortcuts__item").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.shortcut === active);
    });
  }

  activeShortcut() {
    const leaf = this.app.workspace.activeLeaf;
    const type = leaf?.view?.getViewType?.();
    const file = leaf?.view?.file?.path ?? leaf?.getViewState?.().state?.file;

    if (this.settings.homePath && file === this.settings.homePath) return "home";
    if (type === "canvas") return "canvas";
    if (type === "excalidraw") return "draw";
    if (type === "bases" || type === "base") return "base";
    return null;
  }

  async openShortcut(id) {
    if (id === "home") {
      if (!this.settings.homePath) return new Notice("Set a Home note path in Sidebar Shortcuts settings.");
      return this.openFile(this.settings.homePath);
    }
    if (id === "canvas") return this.openViewOrCommand(["canvas"], ["canvas:new-file"], /create new canvas/i);
    if (id === "draw") {
      return this.openViewOrCommand(
        ["excalidraw"],
        ["obsidian-excalidraw-plugin:excalidraw-autocreate-newtab"],
        /create new drawing.*new tab/i,
        false
      );
    }
    if (id === "base") return this.openViewOrCommand(["bases", "base"], ["bases:new-file", "bases:create-new"], /create new base/i);
    if (id === "spaced-repetition") {
      return this.runCommand(
        ["obsidian-spaced-repetition:srs-review-flashcards"],
        /review flashcards from all notes/i
      );
    }
  }

  async openFile(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice(`Shortcut file not found: ${path}`);
      return;
    }

    const existing = this.findLeaf((leaf) => {
      const openPath = leaf.view?.file?.path ?? leaf.getViewState?.().state?.file;
      return openPath === path;
    });

    if (existing) return this.activateLeaf(existing);

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  async openViewOrCommand(viewTypes, commandIds, titlePattern, prepareTab = true) {
    const existing = this.findLeaf((leaf) => viewTypes.includes(leaf.view?.getViewType?.()));
    if (existing) return this.activateLeaf(existing);

    if (prepareTab) {
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: "empty", active: true });
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    }

    return this.runCommand(commandIds, titlePattern);
  }

  runCommand(commandIds, titlePattern) {
    const commands = this.app.commands?.commands ?? {};
    const id = commandIds.find((candidate) => commands[candidate])
      ?? Object.values(commands).find((command) => titlePattern.test(command.name ?? command.title ?? ""))?.id;

    if (!id || !this.app.commands.executeCommandById(id)) {
      new Notice("That shortcut is not available. Check that its Obsidian plugin is enabled.");
    }
  }

  findLeaf(predicate) {
    let match = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!match && predicate(leaf)) match = leaf;
    });
    return match;
  }

  activateLeaf(leaf) {
    this.app.workspace.revealLeaf?.(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }
}

module.exports = SidebarShortcutsPlugin;
