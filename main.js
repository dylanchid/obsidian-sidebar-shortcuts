"use strict";

const { Notice, Plugin, setIcon } = require("obsidian");

const SHORTCUTS = [
  { id: "home", label: "Home", key: "1", icon: "home" },
  { id: "canvas", label: "Canvas", key: "2", icon: "layout-dashboard" },
  { id: "draw", label: "Draw", key: "3", icon: "pencil-ruler" },
  { id: "base", label: "Base", key: "4", icon: "database" },
  { id: "spaced-repetition", label: "Spaced repetition", key: "5", icon: "brain" },
];

class SidebarShortcutsPlugin extends Plugin {
  async onload() {
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

      for (const shortcut of SHORTCUTS) {
        const button = document.createElement("button");
        button.className = "sidebar-shortcuts__item";
        button.type = "button";
        button.dataset.shortcut = shortcut.id;
        button.setAttribute("aria-label", `${shortcut.label}, Command ${shortcut.key}`);

        const icon = document.createElement("span");
        icon.className = "sidebar-shortcuts__icon";
        setIcon(icon, shortcut.icon);

        const label = document.createElement("span");
        label.className = "sidebar-shortcuts__label";
        label.textContent = shortcut.label;

        const key = document.createElement("kbd");
        key.className = "sidebar-shortcuts__key";
        key.textContent = `⌘${shortcut.key}`;

        button.append(icon, label, key);
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

    if (file === "Home/Home.md") return "home";
    if (type === "canvas") return "canvas";
    if (type === "excalidraw") return "draw";
    if (type === "bases" || type === "base") return "base";
    return null;
  }

  async openShortcut(id) {
    if (id === "home") return this.openFile("Home/Home.md");
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
