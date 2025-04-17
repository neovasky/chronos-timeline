/**
 * ChronOS Timeline Plugin for Obsidian
 * 
 * A powerful visualization tool to track your life in weeks, inspired by
 * the "Life in Weeks" concept. Allows tracking of major life events,
 * reflections, and plans across multiple time scales.
 */

import {
  App,
  ItemView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  addIcon
} from "obsidian";

// -----------------------------------------------------------------------
// CONSTANTS & TYPE DEFINITIONS
// -----------------------------------------------------------------------

/** Unique identifier for the timeline view */
const TIMELINE_VIEW_TYPE = "chronos-timeline-view";

/** Interface for plugin settings */
interface ChronosSettings {
  /** User's date of birth in YYYY-MM-DD format */
  birthday: string;
  
  /** Maximum age to display on timeline (in years) */
  lifespan: number;
  
  /** Default view mode */
  defaultView: string;
  
  /** Color for past weeks */
  pastCellColor: string;
  
  /** Color for present week */
  presentCellColor: string;
  
  /** Color for future weeks */
  futureCellColor: string;
  
  /** Major life events */
  greenEvents: string[];
  
  /** Travel events */
  blueEvents: string[];
  
  /** Relationship events */
  pinkEvents: string[];
  
  /** Education/Career events */
  purpleEvents: string[];
  
  /** Custom event types defined by user */
  customEventTypes: CustomEventType[];
  
  /** Events organized by custom type */
  customEvents: Record<string, string[]>;
  
  /** Inspirational quote to display at the bottom */
  quote: string;
  
  /** Folder to store week notes (empty for vault root) */
  notesFolder: string;
}

/** Interface for custom event types */
interface CustomEventType {
  /** Name of the custom event type */
  name: string;
  
  /** Color code for the event type (hex format) */
  color: string;
}

/** Default plugin settings */
const DEFAULT_SETTINGS: ChronosSettings = {
  birthday: "2003-07-18",
  lifespan: 90,
  defaultView: "weeks",
  pastCellColor: "#44cf6e",
  presentCellColor: "#a882ff",
  futureCellColor: "#d8e2e6",
  greenEvents: [],
  blueEvents: [],
  pinkEvents: [],
  purpleEvents: [],
  customEventTypes: [],
  customEvents: {},
  quote: "the only true luxury is time.",
  notesFolder: ""
};

/** SVG icon for the ChronOS Timeline */
const CHRONOS_ICON = `<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="4"/>
  <line x1="50" y1="15" x2="50" y2="50" stroke="currentColor" stroke-width="4"/>
  <line x1="50" y1="50" x2="75" y2="60" stroke="currentColor" stroke-width="4"/>
  <circle cx="50" cy="50" r="5" fill="currentColor"/>
</svg>`;

// -----------------------------------------------------------------------
// MAIN PLUGIN CLASS
// -----------------------------------------------------------------------

/**
 * Main plugin class that handles initialization, settings, and view management
 */
export default class ChronosTimelinePlugin extends Plugin {
  /** Plugin settings */
  settings: ChronosSettings = DEFAULT_SETTINGS;

  /**
   * Plugin initialization on load
   */
  async onload(): Promise<void> {
    console.log("Loading ChronOS Timeline Plugin");

    // Register the custom icon
    addIcon("chronos-icon", CHRONOS_ICON);
    
    // Load settings from storage
    await this.loadSettings();
    
    // Register the timeline view
    this.registerView(
      TIMELINE_VIEW_TYPE,
      (leaf) => new ChronosTimelineView(leaf, this)
    );
    
    // Add ribbon icon to open timeline
    this.addRibbonIcon("chronos-icon", "Open ChronOS Timeline", () => {
      this.activateView();
    });
    
    // Add command to open timeline
    this.addCommand({
      id: "open-chronos-timeline",
      name: "Open ChronOS Timeline",
      callback: () => {
        this.activateView();
      },
    });
    
    // Command to create/open weekly note
    this.addCommand({
      id: "create-weekly-note",
      name: "Create/Open Current Week Note",
      callback: () => {
        this.createOrOpenWeekNote();
      },
    });
    
    // Add settings tab
    this.addSettingTab(new ChronosSettingTab(this.app, this));
  }

  /**
   * Clean up on plugin unload
   */
  onunload(): void {
    console.log("Unloading ChronOS Timeline Plugin");
  }

  /**
   * Load settings from storage
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    
    // Initialize empty arrays/objects if they don't exist
    if (!this.settings.customEventTypes) {
      this.settings.customEventTypes = [];
    }
    
    if (!this.settings.customEvents) {
      this.settings.customEvents = {};
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Show or focus the timeline view
   */
  async activateView(): Promise<void> {
    const { workspace } = this.app;
    
    // Check if view is already open
    let leaf = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
    
    if (!leaf) {
      // Create a new leaf in the right sidebar
      leaf = workspace.getLeaf("split", "vertical");
      await leaf.setViewState({
        type: TIMELINE_VIEW_TYPE,
        active: true,
      });
    }
    
    // Reveal and focus the leaf
    workspace.revealLeaf(leaf);
  }

  /**
   * Calculate full weeks between birthday and given date
   * @param birthday - Birth date
   * @param today - Current or target date
   * @returns Number of full weeks between dates
   */
  getFullWeekAge(birthday: Date, today: Date): number {
    const diffMs = today.getTime() - birthday.getTime();
    const msPerWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diffMs / msPerWeek);
  }

  /**
   * Get full path for a note, using settings folder if specified
   * @param fileName - Name of the file
   * @returns Full path including folder if specified
   */
  getFullPath(fileName: string): string {
    if (this.settings.notesFolder && this.settings.notesFolder.trim() !== "") {
      let folderPath = this.settings.notesFolder;
      if (!folderPath.endsWith("/")) {
        folderPath += "/";
      }
      return `${folderPath}${fileName}`;
    }
    return fileName;
  }

  /**
   * Create or open a note for the current week
   */
  async createOrOpenWeekNote(): Promise<void> {
    try {
      const date = new Date();
      const year = date.getFullYear();
      const weekNum = this.getISOWeekNumber(date);
      const fileName = `${year}-W${weekNum.toString().padStart(2, "0")}.md`;
      const fullPath = this.getFullPath(fileName);

      const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
      
      if (existingFile instanceof TFile) {
        // Open existing file
        await this.app.workspace.getLeaf().openFile(existingFile);
      } else {
        // Create folder if needed
        if (this.settings.notesFolder && this.settings.notesFolder.trim() !== "") {
          try {
            const folderExists = this.app.vault.getAbstractFileByPath(
              this.settings.notesFolder
            );
            if (!folderExists) {
              await this.app.vault.createFolder(this.settings.notesFolder);
            }
          } catch (err) {
            console.log("Error checking/creating folder:", err);
          }
        }
        
        // Create new file with template
        const content = `# Week ${weekNum}, ${year}\n\n## Reflections\n\n## Tasks\n\n## Notes\n`;
        const newFile = await this.app.vault.create(fullPath, content);
        await this.app.workspace.getLeaf().openFile(newFile);
      }
    } catch (error) {
      new Notice(`Error creating week note: ${error}`);
    }
  }

  /**
   * Calculate ISO week number for a given date
   * @param date - Date to calculate week number for
   * @returns ISO week number (1-53)
   */
  getISOWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    // Set to nearest Thursday (to match ISO 8601 week start)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    
    // Get first day of the year
    const yearStart = new Date(d.getFullYear(), 0, 1);
    
    // Calculate full weeks between year start and current date
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Get week key in YYYY-WXX format from date
   * @param date - Date to get week key for
   * @returns Week key in YYYY-WXX format
   */
  getWeekKeyFromDate(date: Date): string {
    const year = date.getFullYear();
    const weekNum = this.getISOWeekNumber(date);
    return `${year}-W${weekNum.toString().padStart(2, "0")}`;
  }
}

// -----------------------------------------------------------------------
// EVENT MODAL CLASS
// -----------------------------------------------------------------------

/**
 * Modal dialog for adding life events to the timeline
 */
class ChronosEventModal extends Modal {
  /** Reference to the main plugin */
  plugin: ChronosTimelinePlugin;
  
  /** Selected date/week (YYYY-WXX format) */
  selectedDate: string = "";
  
  /** Selected color for the event */
  selectedColor: string = "#4CAF50";
  
  /** Description of the event */
  eventDescription: string = "";
  
  /** Date input field reference */
  dateInput!: HTMLInputElement;
  
  /** Currently selected event type */
  selectedEventType: string = "Major Life";
  
  /** Name for custom event type */
  customEventName: string = "";
  
  /** Flag if custom type is selected */
  isCustomType: boolean = false;

  /**
   * Create a new event modal
   * @param app - Obsidian App instance
   * @param plugin - ChronosTimelinePlugin instance
   * @param preselectedDate - Optional date to preselect
   */
  constructor(
    app: App,
    plugin: ChronosTimelinePlugin,
    preselectedDate: string | null = null
  ) {
    super(app);
    this.plugin = plugin;
    
    if (preselectedDate) {
      if (preselectedDate.includes("W")) {
        this.selectedDate = preselectedDate;
      } else {
        const date = new Date(preselectedDate);
        if (!isNaN(date.getTime())) {
          this.selectedDate = plugin.getWeekKeyFromDate(date);
        }
      }
    }
  }

  /**
   * Convert a week key (YYYY-WXX) to an approximate date (YYYY-MM-DD)
   * @param weekKey - Week key to convert
   * @returns Date string in YYYY-MM-DD format
   */
  convertWeekToDate(weekKey: string): string {
    const parts = weekKey.split("-W");
    if (parts.length !== 2) return "";
    
    const year = parseInt(parts[0]);
    const week = parseInt(parts[1]);
    const date = new Date(year, 0, 1);
    const dayOfWeek = date.getDay();
    
    let daysToAdd = (week - 1) * 7;
    if (dayOfWeek <= 4) {
      daysToAdd += 1 - dayOfWeek;
    } else {
      daysToAdd += 8 - dayOfWeek;
    }
    
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString().split("T")[0];
  }

  /**
   * Build the modal UI when opened
   */
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Add Life Event" });

    // Date picker section
    const dateContainer = contentEl.createDiv({
      cls: "chronos-date-picker-container"
    });
    
    dateContainer.createEl("h3", { text: "Select Date" });
    
    const dateSetting = new Setting(contentEl)
      .setName("Date")
      .setDesc("Enter the exact date of the event");
      
    this.dateInput = dateSetting.controlEl.createEl("input", {
      type: "date",
      value: this.selectedDate
        ? this.convertWeekToDate(this.selectedDate)
        : new Date().toISOString().split("T")[0]
    });
    
    this.dateInput.addEventListener("change", () => {
      const specificDate = this.dateInput.value;
      if (specificDate) {
        const date = new Date(specificDate);
        this.selectedDate = this.plugin.getWeekKeyFromDate(date);
      }
    });
    
    contentEl.createEl("small", {
      text: "Select the exact date of your event. The system determines its week automatically.",
      cls: "chronos-helper-text"
    });
    
    if (this.selectedDate) {
      contentEl.createEl("p", {
        text: `This date falls in week: ${this.selectedDate}`
      });
    }

    // Event description field
    new Setting(contentEl)
      .setName("Description")
      .setDesc("Brief description of this event")
      .addText((text) =>
        text.setPlaceholder("Event description").onChange((value) => {
          this.eventDescription = value;
        })
      );

    // Event Type Selection using radio buttons
    const eventTypeContainer = contentEl.createDiv();
    eventTypeContainer.createEl("h3", { text: "Event Type" });
    
    const presetTypes = [
      { name: "Major Life", color: "#4CAF50" },
      { name: "Travel", color: "#2196F3" },
      { name: "Relationship", color: "#E91E63" },
      { name: "Education/Career", color: "#9C27B0" }
    ];
    
    const typeSettingContainer = new Setting(contentEl)
      .setName("Select Event Type")
      .setDesc("Choose a preset type or create your own");
      
    const radioContainer = typeSettingContainer.controlEl.createDiv({
      cls: "chronos-radio-container"
    });
    
    // Create radio buttons for preset event types
    for (const type of presetTypes) {
      const radioLabel = radioContainer.createEl("label", {
        cls: "chronos-radio-label"
      });
      
      const radioBtn = radioLabel.createEl("input");
      radioBtn.type = "radio";
      radioBtn.name = "eventType";
      radioBtn.value = type.name;
      
      if (type.name === this.selectedEventType) {
        radioBtn.checked = true;
      }
      
      const colorBox = radioLabel.createEl("span", {
        cls: "chronos-color-box"
      });
      
      colorBox.style.backgroundColor = type.color;
      radioLabel.createEl("span", { text: type.name });
      
      radioBtn.addEventListener("change", () => {
        if (radioBtn.checked) {
          this.selectedEventType = type.name;
          this.selectedColor = type.color;
          this.isCustomType = false;
          this.updateCustomTypeVisibility(contentEl, false);
        }
      });
    }
    
    // Custom event type option
    const customLabel = radioContainer.createEl("label", {
      cls: "chronos-radio-label"
    });
    
    const customRadio = customLabel.createEl("input");
    customRadio.type = "radio";
    customRadio.name = "eventType";
    customRadio.value = "custom";
    customLabel.createEl("span", { text: "Custom Type" });
    
    customRadio.addEventListener("change", () => {
      if (customRadio.checked) {
        this.isCustomType = true;
        this.updateCustomTypeVisibility(contentEl, true);
      }
    });

    // Custom type settings (initially hidden)
    const customTypeSettings = contentEl.createDiv({
      cls: "chronos-custom-type-settings"
    });
    
    customTypeSettings.style.display = "none";
    
    new Setting(customTypeSettings)
      .setName("Custom Type Name")
      .setDesc("Enter a name for your custom event type")
      .addText((text) =>
        text.setPlaceholder("Type name").onChange((value) => {
          this.customEventName = value;
        })
      );
      
    new Setting(customTypeSettings)
      .setName("Custom Color")
      .setDesc("Select a color for this event type")
      .addColorPicker((picker) => {
        picker.setValue("#FF9800").onChange((value) => {
          this.selectedColor = value;
        });
        this.selectedColor = "#FF9800";
      });

    // Append custom settings to content
    contentEl.appendChild(customTypeSettings);

    // Save button
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save Event")
        .setCta()
        .onClick(() => {
          this.saveEvent();
        })
    );
  }

  /**
   * Show or hide custom type settings
   * @param contentEl - Modal content element
   * @param show - Whether to show or hide settings
   */
  updateCustomTypeVisibility(contentEl: HTMLElement, show: boolean): void {
    const customSettings = contentEl.querySelector(
      ".chronos-custom-type-settings"
    );
    
    if (customSettings) {
      (customSettings as HTMLElement).style.display = show ? "block" : "none";
    }
  }

  /**
   * Save the event to settings and create a note
   */
  saveEvent(): void {
    // Validate inputs
    if (!this.selectedDate && this.dateInput) {
      new Notice("Please select a date");
      return;
    }
    
    if (!this.eventDescription) {
      new Notice("Please add a description");
      return;
    }
    
    const eventDateStr = this.selectedDate || this.dateInput.value;
    const eventDate = new Date(eventDateStr);
    const eventYear = eventDate.getFullYear();
    const eventWeek = this.plugin.getISOWeekNumber(eventDate);
    const weekKey = `${eventYear}-W${eventWeek.toString().padStart(2, "0")}`;

    // Add custom event type if needed
    if (this.isCustomType && this.customEventName) {
      const existingIndex = this.plugin.settings.customEventTypes.findIndex(
        (type) => type.name === this.customEventName
      );
      
      if (existingIndex === -1) {
        this.plugin.settings.customEventTypes.push({
          name: this.customEventName,
          color: this.selectedColor
        });
        this.plugin.settings.customEvents[this.customEventName] = [];
      }
      
      this.selectedEventType = this.customEventName;
    }

    // Format event data string
    const eventData = `${this.selectedDate}:${this.eventDescription}`;

    // Add event to appropriate collection
    switch (this.selectedEventType) {
      case "Major Life":
        this.plugin.settings.greenEvents.push(eventData);
        break;
      case "Travel":
        this.plugin.settings.blueEvents.push(eventData);
        break;
      case "Relationship":
        this.plugin.settings.pinkEvents.push(eventData);
        break;
      case "Education/Career":
        this.plugin.settings.purpleEvents.push(eventData);
        break;
      default:
        // Custom event type
        if (!this.plugin.settings.customEvents[this.selectedEventType]) {
          this.plugin.settings.customEvents[this.selectedEventType] = [];
        }
        this.plugin.settings.customEvents[this.selectedEventType].push(eventData);
    }

    // Save settings and create note file
    this.plugin.saveSettings().then(() => {
      new Notice(`Event added: ${this.eventDescription}`);
      
      const fileName = `${weekKey.replace("W", "-W")}.md`;
      const fullPath = this.plugin.getFullPath(fileName);
      const fileExists = this.app.vault.getAbstractFileByPath(fullPath) instanceof TFile;
      
      if (!fileExists) {
        // Create folder if needed
        if (this.plugin.settings.notesFolder &&
            this.plugin.settings.notesFolder.trim() !== "") {
          try {
            const folderExists = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.notesFolder
            );
            if (!folderExists) {
              this.app.vault.createFolder(this.plugin.settings.notesFolder);
            }
          } catch (err) {
            console.log("Error checking/creating folder:", err);
          }
        }
        
        // Create event note file
        const content = `# Event: ${this.eventDescription}\n\nDate: ${this.selectedDate}\nType: ${this.selectedEventType}\n\n## Notes\n\n`;
        this.app.vault.create(fullPath, content);
      }
      
      this.close();
      
      // Refresh all timeline views
      this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).forEach((leaf) => {
        const view = leaf.view as ChronosTimelineView;
        view.renderView();
      });
    });
  }

  /**
   * Clean up on modal close
   */
  onClose(): void {
    this.contentEl.empty();
  }
}

// -----------------------------------------------------------------------
// TIMELINE VIEW CLASS
// -----------------------------------------------------------------------

/**
 * Main timeline view that shows the life grid and events
 */
class ChronosTimelineView extends ItemView {
  /** Reference to the main plugin */
  plugin: ChronosTimelinePlugin;

  /**
   * Create a new timeline view
   * @param leaf - Workspace leaf to attach to
   * @param plugin - ChronosTimelinePlugin instance
   */
  constructor(leaf: WorkspaceLeaf, plugin: ChronosTimelinePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  /**
   * Get the unique view type
   */
  getViewType(): string {
    return TIMELINE_VIEW_TYPE;
  }

  /**
   * Get display name for the view
   */
  getDisplayText(): string {
    return "ChronOS Timeline";
  }

  /**
   * Get icon for the view
   */
  getIcon(): string {
    return "calendar-days";
  }

  /**
   * Initialize the view when opened
   */
  async onOpen(): Promise<void> {
    const contentEl = this.containerEl.children[1];
    contentEl.empty();
    contentEl.addClass("chronos-timeline-container");
    this.renderView();
  }

  /**
   * Clean up when view is closed
   */
  async onClose(): Promise<void> {
    const contentEl = this.containerEl.children[1];
    contentEl.empty();
  }

  /**
   * Render the timeline view with all components
   */
  renderView(): void {
    // Clear content
    const contentEl = this.containerEl.children[1];
    contentEl.empty();
    
    // Create title in cursive style
    contentEl.createEl("div", {
      cls: "chronos-title",
      text: "life in weeks"
    });
    
    // Create controls
    const controlsEl = contentEl.createEl("div", { cls: "chronos-controls" });
    
    // Add button to add event
    const addEventBtn = controlsEl.createEl("button", { text: "Add Event" });
    addEventBtn.addEventListener("click", () => {
      this.showAddEventModal();
    });
    
    // Today button
    const todayBtn = controlsEl.createEl("button", { text: "Today" });
    todayBtn.addEventListener("click", () => {
      // Scroll to today's cell
      const todayCell = contentEl.querySelector(".chronos-grid-cell.present");
      if (todayCell) {
        todayCell.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    
    // Plan future event button
    const futureEventBtn = controlsEl.createEl("button", {
      text: "Plan Future Event"
    });
    futureEventBtn.addEventListener("click", () => {
      this.showAddEventModal();
    });
    
    // Manage event types button
    const manageTypesBtn = controlsEl.createEl("button", {
      text: "Manage Event Types"
    });
    manageTypesBtn.addEventListener("click", () => {
      const modal = new ManageEventTypesModal(this.app, this.plugin);
      modal.open();
    });
    
    // Add a button to show settings
    const settingsBtn = controlsEl.createEl("button", { text: "Settings" });
    settingsBtn.addEventListener("click", () => {
      // Open settings directly
      new ChronosSettingTab(this.app, this.plugin).display();
    });
    
    // Create the view container
    const viewEl = contentEl.createEl("div", { cls: "chronos-view" });
    
    // Render the weeks grid
    this.renderWeeksGrid(viewEl);
    
    // Create legend
    const legendEl = contentEl.createEl("div", { cls: "chronos-legend" });
    
    // Standard event types for legend
    const legendItems = [
      { text: "Major Life Events", color: "#4CAF50" },
      { text: "Travel", color: "#2196F3" },
      { text: "Relationships", color: "#E91E63" },
      { text: "Education/Career", color: "#9C27B0" },
      {
        text: "Upcoming Planned Event",
        color: this.plugin.settings.futureCellColor
      }
    ];
    
    // Add standard legend items
    legendItems.forEach((item) => {
      const itemEl = legendEl.createEl("div", { cls: "chronos-legend-item" });
      const colorEl = itemEl.createEl("div", { cls: "chronos-legend-color" });
      colorEl.style.backgroundColor = item.color;
      itemEl.createEl("span", { text: item.text });
    });
    
    // Render custom event type legends
    if (this.plugin.settings.customEventTypes) {
      this.plugin.settings.customEventTypes.forEach((customType) => {
        const customLegendEl = legendEl.createEl("div", {
          cls: "chronos-legend-item"
        });
        const customColorEl = customLegendEl.createEl("div", {
          cls: "chronos-legend-color"
        });
        customColorEl.style.backgroundColor = customType.color;
        customLegendEl.createEl("span", { text: customType.name });
      });
    }
    
    // Add quote at the bottom
    contentEl.createEl("div", {
      cls: "chronos-footer",
      text: this.plugin.settings.quote
    });
  }

  /**
   * Show modal for adding an event
   */
  showAddEventModal(): void {
    const modal = new ChronosEventModal(this.app, this.plugin);
    modal.open();
  }

  /**
   * Render the main weeks grid visualization
   * @param container - Container to render grid in
   */
  renderWeeksGrid(container: HTMLElement): void {
    container.empty();

    // Get the CSS variables for positioning and styling
    const root = document.documentElement;
    const cellSize = parseInt(getComputedStyle(root).getPropertyValue("--cell-size")) || 16;
    const cellGap = parseInt(getComputedStyle(root).getPropertyValue("--cell-gap")) || 2;
    const leftOffset = parseInt(getComputedStyle(root).getPropertyValue("--left-offset")) || 50;
    const topOffset = parseInt(getComputedStyle(root).getPropertyValue("--top-offset")) || 50;

    // Create decade markers container (horizontal markers above the grid)
    const decadeMarkersContainer = container.createEl("div", {
      cls: "chronos-decade-markers"
    });

    // Add decade markers (0, 10, 20, etc.)
    for (let decade = 0; decade <= this.plugin.settings.lifespan; decade += 10) {
      const marker = decadeMarkersContainer.createEl("div", {
        cls: "chronos-decade-marker",
        text: decade.toString()
      });

      // Position each decade marker
      marker.style.position = "absolute";

      // Special adjustment for the last marker (90 years)
      let leftPosition = decade * (cellSize + cellGap) + cellSize / 2;
      if (decade === 90) {
        // Adjust the 90-year marker position
        leftPosition -= 18; 
      }

      marker.style.left = `${leftPosition}px`;
      marker.style.top = `${topOffset / 2}px`;
      marker.style.transform = "translate(-50%, -50%)";
    }

    // Create week markers container (vertical markers to the left of the grid)
    const weekMarkersContainer = container.createEl("div", {
      cls: "chronos-week-markers"
    });

    // Add week markers (10, 20, 30, 40, 50)
    for (let week = 0; week <= 50; week += 10) {
      if (week === 0) continue; // Skip 0 to start with 10
      
      const marker = weekMarkersContainer.createEl("div", {
        cls: "chronos-week-marker",
        text: week.toString()
      });

      // Position each week marker
      marker.style.position = "absolute";
      marker.style.right = "10px";

      // Move up by 1 block by subtracting (cellSize + cellGap)
      marker.style.top = `${
        week * (cellSize + cellGap) + cellSize / 2 - (cellSize + cellGap)
      }px`;
      marker.style.transform = "translateY(-50%)";
      marker.style.textAlign = "right";
    }

    // Create the grid with absolute positioning
    const gridEl = container.createEl("div", { cls: "chronos-grid" });
    gridEl.style.display = "grid";
    gridEl.style.gridGap = "var(--cell-gap)";
    gridEl.style.gridTemplateColumns = `repeat(${this.plugin.settings.lifespan}, var(--cell-size))`;
    gridEl.style.gridTemplateRows = `repeat(52, var(--cell-size))`;
    gridEl.style.position = "absolute";
    gridEl.style.top = `${topOffset}px`;
    gridEl.style.left = `${leftOffset}px`;

    const now = new Date();
    const birthdayDate = new Date(this.plugin.settings.birthday);
    const ageInWeeks = this.plugin.getFullWeekAge(birthdayDate, now);

    // For each year, create a column of weeks
    for (let week = 0; week < 52; week++) {
      for (let year = 0; year < this.plugin.settings.lifespan; year++) {
        const weekIndex = year * 52 + week;
        const cell = gridEl.createEl("div", { cls: "chronos-grid-cell" });

        // Calculate cell date
        const cellDate = new Date(birthdayDate);
        cellDate.setDate(cellDate.getDate() + weekIndex * 7);
        const cellYear = cellDate.getFullYear();
        const cellWeek = this.plugin.getISOWeekNumber(cellDate);
        const weekKey = `${cellYear}-W${cellWeek.toString().padStart(2, "0")}`;
        cell.dataset.weekKey = weekKey;

        // Color coding (past, present, future)
        if (weekIndex < ageInWeeks) {
          cell.addClass("past");
          cell.style.backgroundColor = this.plugin.settings.pastCellColor;
        } else if (Math.floor(weekIndex) === Math.floor(ageInWeeks)) {
          cell.addClass("present");
          cell.style.backgroundColor = this.plugin.settings.presentCellColor;
        } else {
          cell.addClass("future");
          cell.style.backgroundColor = this.plugin.settings.futureCellColor;
        }

        // Apply event styling
        this.applyEventStyling(cell, weekKey);

        // Add click event to create/open the corresponding weekly note
        cell.addEventListener("click", async (event) => {
          // If shift key is pressed, add an event
          if (event.shiftKey) {
            const modal = new ChronosEventModal(this.app, this.plugin, weekKey);
            modal.open();
            return;
          }
          
          // Otherwise open/create the weekly note
          const fileName = `${weekKey.replace("W", "-W")}.md`;
          const fullPath = this.plugin.getFullPath(fileName);
          const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
          
          if (existingFile instanceof TFile) {
            // Open existing file
            await this.app.workspace.getLeaf().openFile(existingFile);
          } else {
            // Create new file with template
            if (this.plugin.settings.notesFolder &&
                this.plugin.settings.notesFolder.trim() !== "") {
              try {
                const folderExists = this.app.vault.getAbstractFileByPath(
                  this.plugin.settings.notesFolder
                );
                if (!folderExists) {
                  await this.app.vault.createFolder(this.plugin.settings.notesFolder);
                }
              } catch (err) {
                console.log("Error checking/creating folder:", err);
              }
            }
            
            const content = `# Week ${cellWeek}, ${cellYear}\n\n## Reflections\n\n## Tasks\n\n## Notes\n`;
            const newFile = await this.app.vault.create(fullPath, content);
            await this.app.workspace.getLeaf().openFile(newFile);
          }
        });
      }
    }
  }

  /**
   * Apply styling for events to a cell
   * @param cell - Cell element to style
   * @param weekKey - Week key to check for events (YYYY-WXX)
   */
  applyEventStyling(cell: HTMLElement, weekKey: string): void {
    // Helper to apply preset event styling
    const applyPreset = (
      arr: string[],
      defaultColor: string,
      defaultDesc: string
    ) => {
      if (arr.some((event) => event.startsWith(weekKey))) {
        cell.style.backgroundColor = defaultColor;
        cell.addClass("event");
        const event = arr.find((e) => e.startsWith(weekKey));
        if (event) {
          const description = event.split(":")[1] || defaultDesc;
          cell.setAttribute("title", description);
        }
      }
    };

    // Apply preset event types
    applyPreset(this.plugin.settings.greenEvents, "#4CAF50", "Major Life Event");
    applyPreset(this.plugin.settings.blueEvents, "#2196F3", "Travel");
    applyPreset(this.plugin.settings.pinkEvents, "#E91E63", "Relationship");
    applyPreset(this.plugin.settings.purpleEvents, "#9C27B0", "Education/Career");

    // For custom events, loop through each event type
    if (this.plugin.settings.customEvents) {
      for (const [typeName, events] of Object.entries(this.plugin.settings.customEvents)) {
        if (events.some((event) => event.startsWith(weekKey))) {
          const customType = this.plugin.settings.customEventTypes.find(
            (type) => type.name === typeName
          );
          
          if (customType) {
            cell.style.backgroundColor = customType.color;
            cell.addClass("event");
            const event = events.find((e) => e.startsWith(weekKey));
            
            if (event) {
              const description = event.split(":")[1] || typeName;
              cell.setAttribute("title", `${description} (${typeName})`);
            }
          }
        }
      }
    }

    // Highlight future events within next 6 months
    const now = new Date();
    const cellDate = new Date();
    const [cellYearStr, weekNumStr] = weekKey.split("-W");
    cellDate.setFullYear(parseInt(cellYearStr));
    cellDate.setDate(1 + (parseInt(weekNumStr) - 1) * 7);
    
    if (cellDate > now &&
        cellDate < new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000) &&
        cell.classList.contains("event")) {
      cell.addClass("future-event-highlight");
    }
  }
}

// -----------------------------------------------------------------------
// EVENT TYPES MODAL CLASS
// -----------------------------------------------------------------------

/**
 * Modal for managing custom event types
 */
class ManageEventTypesModal extends Modal {
  /** Reference to the main plugin */
  plugin: ChronosTimelinePlugin;

  /**
   * Create a new event types modal
   * @param app - Obsidian App instance
   * @param plugin - ChronosTimelinePlugin instance
   */
  constructor(app: App, plugin: ChronosTimelinePlugin) {
    super(app);
    this.plugin = plugin;
  }

  /**
   * Build the modal UI when opened
   */
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Manage Event Types" });

    // Section for adding a new event type
    const addSection = contentEl.createDiv({ cls: "event-type-add-section" });
    addSection.createEl("h3", { text: "Add New Event Type" });
    
    const nameInput = addSection.createEl("input", {
      type: "text",
      placeholder: "Event Type Name"
    });
    
    const colorInput = addSection.createEl("input", {
      type: "color",
      value: "#FF9800"
    });
    
    const addButton = addSection.createEl("button", {
      text: "Add Type",
      cls: "add-type-button"
    });
    
    addButton.addEventListener("click", () => {
      const name = nameInput.value.trim();
      
      if (!name) {
        new Notice("Please enter a name for the event type");
        return;
      }
      
      if (this.plugin.settings.customEventTypes.some((type) => type.name === name)) {
        new Notice("An event type with this name already exists");
        return;
      }
      
      this.plugin.settings.customEventTypes.push({
        name: name,
        color: colorInput.value
      });
      
      this.plugin.settings.customEvents[name] = [];
      
      this.plugin.saveSettings().then(() => {
        new Notice(`Event type "${name}" added`);
        this.renderExistingTypes(contentEl);
        nameInput.value = "";
      });
    });

    // Section for listing existing custom types
    const existingSection = contentEl.createDiv({
      cls: "event-type-existing-section"
    });
    
    existingSection.createEl("h3", { text: "Existing Event Types" });
    this.renderExistingTypes(existingSection);

    // Close button
    const closeButton = contentEl.createEl("button", {
      text: "Close",
      cls: "close-button"
    });
    
    closeButton.addEventListener("click", () => {
      this.close();
      this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).forEach((leaf) => {
        const view = leaf.view as ChronosTimelineView;
        view.renderView();
      });
    });
  }

  /**
   * Render list of existing event types
   * @param container - Container element
   */
  renderExistingTypes(container: HTMLElement): void {
    // Remove existing list if present
    const typesList = container.querySelector(".existing-types-list");
    if (typesList) typesList.remove();
    
    const newList = container.createEl("div", { cls: "existing-types-list" });
    
    // Built-in types section
    newList.createEl("p", {
      text: "Built-in types (cannot be edited)",
      cls: "built-in-note"
    });
    
    const builtInTypes = [
      { name: "Major Life", color: "#4CAF50" },
      { name: "Travel", color: "#2196F3" },
      { name: "Relationship", color: "#E91E63" },
      { name: "Education/Career", color: "#9C27B0" }
    ];
    
    for (const type of builtInTypes) {
      const typeItem = newList.createEl("div", {
        cls: "event-type-item built-in"
      });
      
      const colorBox = typeItem.createEl("span", { cls: "event-type-color" });
      colorBox.style.backgroundColor = type.color;
      typeItem.createEl("span", { text: type.name, cls: "event-type-name" });
    }
    
    // Custom types section
    if (this.plugin.settings.customEventTypes.length > 0) {
      newList.createEl("p", {
        text: "Your custom types",
        cls: "custom-types-note"
      });
      
      for (const type of this.plugin.settings.customEventTypes) {
        const typeItem = newList.createEl("div", {
          cls: "event-type-item custom"
        });
        
        const colorBox = typeItem.createEl("span", { cls: "event-type-color" });
        colorBox.style.backgroundColor = type.color;
        typeItem.createEl("span", { text: type.name, cls: "event-type-name" });
        
        // Edit button
        const editButton = typeItem.createEl("button", {
          text: "Edit",
          cls: "edit-type-button"
        });
        
        editButton.addEventListener("click", () => {
          this.showEditTypeModal(type);
        });
        
        // Delete button
        const deleteButton = typeItem.createEl("button", {
          text: "Delete",
          cls: "delete-type-button"
        });
        
        deleteButton.addEventListener("click", () => {
          if (
            confirm(
              `Are you sure you want to delete the event type "${type.name}"? All events of this type will also be deleted.`
            )
          ) {
            this.plugin.settings.customEventTypes =
              this.plugin.settings.customEventTypes.filter(
                (t) => t.name !== type.name
              );
              
            delete this.plugin.settings.customEvents[type.name];
            
            this.plugin.saveSettings().then(() => {
              new Notice(`Event type "${type.name}" deleted`);
              this.renderExistingTypes(container);
            });
          }
        });
      }
    } else {
      newList.createEl("p", {
        text: "You haven't created any custom event types yet",
        cls: "no-custom-types"
      });
    }
  }

  /**
   * Show modal for editing an event type
   * @param type - Custom event type to edit
   */
  showEditTypeModal(type: CustomEventType): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText(`Edit Event Type: ${type.name}`);
    
    const contentEl = modal.contentEl;
    
    // Name field
    const nameContainer = contentEl.createDiv({ cls: "edit-name-container" });
    const nameLabel = nameContainer.createEl("label");
    nameLabel.textContent = "Name";
    nameLabel.htmlFor = "edit-type-name";
    
    const nameInput = nameContainer.createEl("input");
    nameInput.type = "text";
    nameInput.value = type.name;
    nameInput.id = "edit-type-name";
    
    // Color field
    const colorContainer = contentEl.createDiv({ cls: "edit-color-container" });
    const colorLabel = colorContainer.createEl("label");
    colorLabel.textContent = "Color";
    colorLabel.htmlFor = "edit-type-color";
    
    const colorInput = colorContainer.createEl("input");
    colorInput.type = "color";
    colorInput.value = type.color;
    colorInput.id = "edit-type-color";
    
    // Save button
    const saveButton = contentEl.createEl("button", {
      text: "Save Changes",
      cls: "save-edit-button"
    });
    
    saveButton.addEventListener("click", () => {
      const newName = nameInput.value.trim();
      
      if (!newName) {
        new Notice("Please enter a name for the event type");
        return;
      }
      
      if (
        newName !== type.name &&
        this.plugin.settings.customEventTypes.some((t) => t.name === newName)
      ) {
        new Notice("An event type with this name already exists");
        return;
      }
      
      // Update name reference in events if changed
      if (newName !== type.name) {
        this.plugin.settings.customEvents[newName] =
          this.plugin.settings.customEvents[type.name] || [];
        delete this.plugin.settings.customEvents[type.name];
      }
      
      // Update event type
      const typeIndex = this.plugin.settings.customEventTypes.findIndex(
        (t) => t.name === type.name
      );
      
      if (typeIndex !== -1) {
        this.plugin.settings.customEventTypes[typeIndex] = {
          name: newName,
          color: colorInput.value
        };
        
        this.plugin.saveSettings().then(() => {
          new Notice(`Event type updated to "${newName}"`);
          modal.close();
          this.renderExistingTypes(this.contentEl);
        });
      }
    });
    
    // Cancel button
    const cancelButton = contentEl.createEl("button", {
      text: "Cancel",
      cls: "cancel-edit-button"
    });
    
    cancelButton.addEventListener("click", () => {
      modal.close();
    });
    
    modal.open();
  }

  /**
   * Clean up on modal close
   */
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// -----------------------------------------------------------------------
// SETTINGS TAB CLASS
// -----------------------------------------------------------------------

/**
 * Settings tab for configuring the plugin
 */
class ChronosSettingTab extends PluginSettingTab {
  /** Reference to the main plugin */
  plugin: ChronosTimelinePlugin;

  /**
   * Create a new settings tab
   * @param app - Obsidian App instance
   * @param plugin - ChronosTimelinePlugin instance
   */
  constructor(app: App, plugin: ChronosTimelinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Build the settings UI
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h1", { text: "ChronOS Timeline Settings" });
    containerEl.createEl("p", {
      text: "Customize your life timeline visualization."
    });
    
    // Birthday setting
    new Setting(containerEl)
      .setName("Birthday")
      .setDesc("Your date of birth (YYYY-MM-DD)")
      .addText((text) =>
        text
          .setPlaceholder("1990-01-01")
          .setValue(this.plugin.settings.birthday)
          .onChange(async (value) => {
            this.plugin.settings.birthday = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );
      
    // Lifespan setting
    new Setting(containerEl)
      .setName("Lifespan")
      .setDesc("Maximum age in years to display")
      .addSlider((slider) =>
        slider
          .setLimits(50, 120, 5)
          .setValue(this.plugin.settings.lifespan)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.lifespan = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );

    // Notes folder setting
    new Setting(containerEl)
      .setName("Notes Folder")
      .setDesc("Where to store week notes (leave empty for vault root)")
      .addText((text) =>
        text
          .setPlaceholder("ChronOS Notes")
          .setValue(this.plugin.settings.notesFolder || "")
          .onChange(async (value) => {
            this.plugin.settings.notesFolder = value;
            await this.plugin.saveSettings();
          })
      );

    // Quote setting
    new Setting(containerEl)
      .setName("Footer Quote")
      .setDesc("Inspirational quote to display at the bottom")
      .addText((text) =>
        text
          .setPlaceholder("the only true luxury is time.")
          .setValue(this.plugin.settings.quote)
          .onChange(async (value) => {
            this.plugin.settings.quote = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );
      
    // Color settings section
    containerEl.createEl("h3", { text: "Colors" });
    
    // Past cells color
    new Setting(containerEl)
      .setName("Past Weeks Color")
      .setDesc("Color for weeks that have passed")
      .addColorPicker((colorPicker) =>
        colorPicker
          .setValue(this.plugin.settings.pastCellColor)
          .onChange(async (value) => {
            this.plugin.settings.pastCellColor = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );
      
    // Present cell color
    new Setting(containerEl)
      .setName("Current Week Color")
      .setDesc("Color for the current week")
      .addColorPicker((colorPicker) =>
        colorPicker
          .setValue(this.plugin.settings.presentCellColor)
          .onChange(async (value) => {
            this.plugin.settings.presentCellColor = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );
      
    // Future cells color
    new Setting(containerEl)
      .setName("Future Weeks Color")
      .setDesc("Color for weeks in the future")
      .addColorPicker((colorPicker) =>
        colorPicker
          .setValue(this.plugin.settings.futureCellColor)
          .onChange(async (value) => {
            this.plugin.settings.futureCellColor = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );

    // Event types management section
    containerEl.createEl("h3", { text: "Event Types" });
    new Setting(containerEl)
      .setName("Manage Event Types")
      .setDesc("Create, edit, or delete custom event types")
      .addButton((button) => {
        button.setButtonText("Manage Types").onClick(() => {
          const modal = new ManageEventTypesModal(this.app, this.plugin);
          modal.open();
        });
      });

    // Clear event data section
    containerEl.createEl("h3", { text: "Clear Event Data" });
    
    // Green events (Major Life Events)
    new Setting(containerEl)
      .setName("Major Life Events")
      .setDesc("Weeks marked as Major Life Events")
      .addButton((button) => {
        button.setButtonText("Clear All").onClick(async () => {
          this.plugin.settings.greenEvents = [];
          await this.plugin.saveSettings();
          this.refreshAllViews();
          new Notice("Cleared all Major Life Events");
        });
      });
      
    // Blue events (Travel)
    new Setting(containerEl)
      .setName("Travel Events")
      .setDesc("Weeks marked as Travel")
      .addButton((button) => {
        button.setButtonText("Clear All").onClick(async () => {
          this.plugin.settings.blueEvents = [];
          await this.plugin.saveSettings();
          this.refreshAllViews();
          new Notice("Cleared all Travel Events");
        });
      });
      
    // Pink events (Relationships)
    new Setting(containerEl)
      .setName("Relationship Events")
      .setDesc("Weeks marked as Relationships")
      .addButton((button) => {
        button.setButtonText("Clear All").onClick(async () => {
          this.plugin.settings.pinkEvents = [];
          await this.plugin.saveSettings();
          this.refreshAllViews();
          new Notice("Cleared all Relationship Events");
        });
      });
      
    // Purple events (Education/Career)
    new Setting(containerEl)
      .setName("Education/Career Events")
      .setDesc("Weeks marked as Education/Career")
      .addButton((button) => {
        button.setButtonText("Clear All").onClick(async () => {
          this.plugin.settings.purpleEvents = [];
          await this.plugin.saveSettings();
          this.refreshAllViews();
          new Notice("Cleared all Education/Career Events");
        });
      });

    // Custom events clear button (only if there are custom event types)
    if (
      this.plugin.settings.customEventTypes &&
      this.plugin.settings.customEventTypes.length > 0
    ) {
      new Setting(containerEl)
        .setName("Custom Events")
        .setDesc("Clear events for custom event types")
        .addButton((button) => {
          button.setButtonText("Clear All Custom Events").onClick(async () => {
            this.plugin.settings.customEvents = {};
            for (const type of this.plugin.settings.customEventTypes) {
              this.plugin.settings.customEvents[type.name] = [];
            }
            await this.plugin.saveSettings();
            this.refreshAllViews();
            new Notice("Cleared all custom events");
          });
        });
    }

    // Help tips section
    containerEl.createEl("h3", { text: "Tips" });
    containerEl.createEl("p", {
      text: "• Click on any week to create or open a note for that week"
    });
    containerEl.createEl("p", {
      text: "• Shift+Click on a week to add an event"
    });
    containerEl.createEl("p", {
      text: "• Use the 'Add Event' button to mark significant life events"
    });
    containerEl.createEl("p", {
      text: "• Use the 'Plan Future Event' button to add events in the future"
    });
    containerEl.createEl("p", {
      text: "• Create custom event types to personalize your timeline"
    });
  }

  /**
   * Refresh all timeline views
   */
  refreshAllViews(): void {
    this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view as ChronosTimelineView;
      view.renderView();
    });
  }
}