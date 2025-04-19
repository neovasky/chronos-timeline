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
  addIcon,
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

  /** Current zoom level (1.0 is default, higher values = larger cells) */
  zoomLevel: number;

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

  /** Show decade markers */
  showDecadeMarkers: boolean;

  /** Show week markers */
  showWeekMarkers: boolean;

  /** Show month markers */
  showMonthMarkers: boolean;

  /** Show birthday cake marker */
  showBirthdayMarker: boolean;  

  /** Month marker frequency */
  monthMarkerFrequency: "all" | "quarter" | "half-year" | "year";

  /** Enable manual fill mode */
  enableManualFill: boolean;

  /** Enable auto-fill mode */
  enableAutoFill: boolean;

  /** Day of week for auto-fill (0-6, where 0 is Sunday) */
  autoFillDay: number;

  /** Weeks that have been filled */
  filledWeeks: string[];

  /** Start week on Monday (vs Sunday) */
  startWeekOnMonday: boolean;

  // Add to the class properties at the top of ChronosTimelineView
  isSidebarOpen: boolean; 
}

/** Interface for custom event types */
interface CustomEventType {
  /** Name of the custom event type */
  name: string;

  /** Color code for the event type (hex format) */
  color: string;
}

/** Month marker information */
interface MonthMarker {
  /** Week number in the timeline */
  weekIndex: number;
  /** Month name abbreviation */
  label: string;
  /** Whether this is the first month of a year */
  isFirstOfYear: boolean;
  /** Whether this is the birth month */
  isBirthMonth: boolean;
  /** Full label with year (for tooltip) */
  fullLabel: string;
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
  notesFolder: "",
  showDecadeMarkers: true,
  showWeekMarkers: true,
  showMonthMarkers: true,
  showBirthdayMarker: true,
  monthMarkerFrequency: "all",
  enableManualFill: false,
  enableAutoFill: true,
  autoFillDay: 1, // Monday by default
  filledWeeks: [],
  startWeekOnMonday: true,
  zoomLevel: 1.0,
  isSidebarOpen: true, // Default to open sidebar
};

/** SVG icon for the ChronOS Timeline */
const CHRONOS_ICON = `<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="4"/>
  <line x1="50" y1="15" x2="50" y2="50" stroke="currentColor" stroke-width="4"/>
  <line x1="50" y1="50" x2="75" y2="60" stroke="currentColor" stroke-width="4"/>
  <circle cx="50" cy="50" r="5" fill="currentColor"/>
</svg>`;

/** SVG icon for birthday cake */
const CAKE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M12,6C13.11,6 14,5.1 14,4C14,3.62 13.9,3.27 13.71,2.97L12,0L10.29,2.97C10.1,3.27 10,3.62 10,4A2,2 0 0,0 12,6M16.6,16L15.53,14.92L14.45,16C13.15,17.29 10.87,17.3 9.56,16L8.5,14.92L7.4,16C6.75,16.64 5.88,17 4.96,17C4.23,17 3.56,16.77 3,16.39V21A1,1 0 0,0 4,22H20A1,1 0 0,0 21,21V16.39C20.44,16.77 19.77,17 19.04,17C18.12,17 17.25,16.64 16.6,16M18,9H13V7H11V9H6A3,3 0 0,0 3,12V13.54C3,14.62 3.88,15.5 4.96,15.5C5.5,15.5 6,15.3 6.34,14.93L8.5,12.8L10.61,14.93C11.35,15.67 12.64,15.67 13.38,14.93L15.5,12.8L17.65,14.93C18,15.3 18.5,15.5 19.03,15.5C20.12,15.5 21,14.62 21,13.54V12A3,3 0 0,0 18,9Z" />
</svg>`;

// Gap between decades (larger than regular gap)
const DECADE_GAP = 6; // px

// Month names for display
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

    // Check for auto-fill on plugin load
    this.checkAndAutoFill();

    // Register interval to check for auto-fill (check every hour)
    this.registerInterval(
      window.setInterval(() => this.checkAndAutoFill(), 1000 * 60 * 60)
    );
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

    // Initialize new marker settings if they don't exist
    if (this.settings.showDecadeMarkers === undefined) {
      this.settings.showDecadeMarkers = DEFAULT_SETTINGS.showDecadeMarkers;
    }

    if (this.settings.showWeekMarkers === undefined) {
      this.settings.showWeekMarkers = DEFAULT_SETTINGS.showWeekMarkers;
    }

    if (this.settings.showMonthMarkers === undefined) {
      this.settings.showMonthMarkers = DEFAULT_SETTINGS.showMonthMarkers;
    }

    if (this.settings.showBirthdayMarker === undefined) {
      this.settings.showBirthdayMarker = DEFAULT_SETTINGS.showBirthdayMarker;
    }

    if (this.settings.monthMarkerFrequency === undefined) {
      this.settings.monthMarkerFrequency =
        DEFAULT_SETTINGS.monthMarkerFrequency;

    // Initialize new fill settings if they don't exist
    if (this.settings.enableManualFill === undefined) {
      this.settings.enableManualFill = DEFAULT_SETTINGS.enableManualFill;
    }
    if (this.settings.enableAutoFill === undefined) {
      this.settings.enableAutoFill = DEFAULT_SETTINGS.enableAutoFill;
    }
    if (this.settings.autoFillDay === undefined) {
      this.settings.autoFillDay = DEFAULT_SETTINGS.autoFillDay;
    }
    if (this.settings.filledWeeks === undefined) {
      this.settings.filledWeeks = DEFAULT_SETTINGS.filledWeeks;
    }
    if (this.settings.startWeekOnMonday === undefined) {
      this.settings.startWeekOnMonday = DEFAULT_SETTINGS.startWeekOnMonday;
    }
    }
  }


    /**
   * Check if the current week should be auto-filled
   * @returns true if the current week was filled
   */
  checkAndAutoFill(): boolean {
    if (!this.settings.enableAutoFill) {
      return false;
    }
    
    // Get current date and day of week
    const now = new Date();
    const currentDay = now.getDay(); // 0-6, 0 is Sunday
    
    // Only proceed if today is the configured auto-fill day
    if (currentDay !== this.settings.autoFillDay) {
      return false;
    }
    
    // Get current week key
    const currentWeekKey = this.getWeekKeyFromDate(now);
    
    // Check if this week is already filled
    if (this.settings.filledWeeks.includes(currentWeekKey)) {
      return false;
    }
    
    // Add current week to filled weeks
    this.settings.filledWeeks.push(currentWeekKey);
    this.saveSettings();
    
    return true;
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
        if (
          this.settings.notesFolder &&
          this.settings.notesFolder.trim() !== ""
        ) {
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

  /**
   * Get all week keys between two dates
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Array of week keys in YYYY-WXX format
   */
  getWeekKeysBetweenDates(startDate: Date, endDate: Date): string[] {
    const weekKeys: string[] = [];
    const currentDate = new Date(startDate);

    // Ensure dates are in order
    if (startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }

    // Get week key for starting date
    let currentWeekKey = this.getWeekKeyFromDate(currentDate);
    weekKeys.push(currentWeekKey);

    // Advance by one week until we reach or pass the end date
    while (currentDate < endDate) {
      // Move to next week
      currentDate.setDate(currentDate.getDate() + 7);

      // Check if we've gone past the end date
      if (currentDate > endDate) {
        break;
      }

      // Get week key and add to array
      currentWeekKey = this.getWeekKeyFromDate(currentDate);

      // Only add if not already in the array (avoid duplicates)
      if (!weekKeys.includes(currentWeekKey)) {
        weekKeys.push(currentWeekKey);
      }
    }

    // Ensure the end date's week is included
    const endWeekKey = this.getWeekKeyFromDate(endDate);
    if (!weekKeys.includes(endWeekKey)) {
      weekKeys.push(endWeekKey);
    }

    return weekKeys;
  }

  /**
   * Calculate the horizontal position for a given year, accounting for decade gaps
   * @param year - Year to calculate position for (0-based index from birth)
   * @param cellSize - Size of each cell in pixels
   * @param cellGap - Standard gap between cells in pixels
   * @returns Position in pixels
   */
  calculateYearPosition(
    year: number,
    cellSize: number,
    cellGap: number
  ): number {
    // Add extra space for each completed decade
    const decades = Math.floor(year / 10);
    const extraGap = DECADE_GAP - cellGap; // Additional space for each decade

    return year * (cellSize + cellGap) + decades * extraGap;
  }

  /**
   * Calculate month positions for vertical markers based on birth date
   * @param birthdayDate - User's birth date
   * @param totalYears - Total years to display on timeline
   * @param frequency - How often to show month markers ('all', 'quarter', 'half-year', 'year')
   * @returns Array of objects with month marker data
   */
  calculateMonthMarkers(
    birthdayDate: Date,
    totalYears: number,
    frequency: string = "all"
  ): MonthMarker[] {
    const monthMarkers: MonthMarker[] = [];

    // Clone the birthday date to avoid modifying the original
    const startDate = new Date(birthdayDate);

    // Calculate the end date (birthday + total years)
    const endDate = new Date(birthdayDate);
    endDate.setFullYear(endDate.getFullYear() + totalYears);

    // Create a date iterator starting from the birthday
    const currentDate = new Date(startDate);

    // Store birth month and year for special handling
    const birthMonth = startDate.getMonth();
    const birthYear = startDate.getFullYear();

    // Track the last shown month to avoid duplicates
    let lastShownMonth = -1;
    let lastShownYear = -1;

    // Helper to determine if a month should be shown based on frequency
    const shouldShowMonth = (monthNum: number): boolean => {
      // Always show January as the first month of the year
      if (monthNum === 0) return true;

      switch (frequency) {
        case "all":
          return true;
        case "quarter":
          // Show first month of each quarter (Jan, Apr, Jul, Oct)
          return monthNum % 3 === 0;
        case "half-year":
          // Show first month of each half year (Jan, Jul)
          return monthNum % 6 === 0;
        case "year":
          // Only show January
          return monthNum === 0;
        default:
          return true;
      }
    };

    // Iterate through each day until we reach the end date
    while (currentDate < endDate) {
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();

      // Check if this is a new month and should be shown
      if (
        (currentMonth !== lastShownMonth || currentYear !== lastShownYear) &&
        shouldShowMonth(currentMonth)
      ) {
        // Calculate the exact week index based on days since birth
        const daysSinceBirth = Math.floor(
          (currentDate.getTime() - birthdayDate.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const exactWeekIndex = Math.floor(daysSinceBirth / 7);

        // Check if this is the birth month
        const isBirthMonth =
          currentMonth === birthMonth && currentYear === birthYear;

        // Add marker for this month
        monthMarkers.push({
          weekIndex: exactWeekIndex,
          label: MONTH_NAMES[currentMonth],
          isFirstOfYear: currentMonth === 0,
          isBirthMonth: isBirthMonth,
          fullLabel: `${MONTH_NAMES[currentMonth]} ${currentYear}`,
        });

        // Update last shown month/year
        lastShownMonth = currentMonth;
        lastShownYear = currentYear;
      }

      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort markers by week index to ensure proper rendering order
    monthMarkers.sort((a, b) => a.weekIndex - b.weekIndex);

    return monthMarkers;
  }

    /**
   * Calculate date range for a given week key
   * @param weekKey - Week key in YYYY-WXX format
   * @returns String with formatted date range
   */
  getWeekDateRange(weekKey: string): string {
    const parts = weekKey.split("-W");
    if (parts.length !== 2) return "";

    const year = parseInt(parts[0]);
    const week = parseInt(parts[1]);
    
    // Calculate the first day of the week (Monday of that week)
    const firstDayOfWeek = new Date(year, 0, 1);
    const dayOffset = firstDayOfWeek.getDay() || 7; // getDay returns 0 for Sunday
    const dayToAdd = 1 + (week - 1) * 7 - (dayOffset - 1);
    
    firstDayOfWeek.setDate(dayToAdd);
    
    // Calculate the last day of the week (Sunday)
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    
    // Format the dates
    const formatDate = (date: Date): string => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[date.getMonth()]} ${date.getDate()}`;
    };
    
    return `${formatDate(firstDayOfWeek)} - ${formatDate(lastDayOfWeek)}`;
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

  /** Selected end date for range (YYYY-WXX format) */
  selectedEndDate: string = "";

  /** Flag to indicate if using a date range */
  isDateRange: boolean = false;

  /** Selected color for the event */
  selectedColor: string = "#4CAF50";

  /** Description of the event */
  eventDescription: string = "";

  /** Start date input field reference */
  startDateInput!: HTMLInputElement;

  /** End date input field reference */
  endDateInput!: HTMLInputElement;

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
      cls: "chronos-date-picker-container",
    });

    dateContainer.createEl("h3", { text: "Select Date" });

    // Add an option to toggle between single date and date range
    const dateTypeContainer = dateContainer.createDiv({
      cls: "date-type-selector",
    });

    const singleDateOption = dateTypeContainer.createEl("label", {
      cls: "date-option",
    });
    const singleDateRadio = singleDateOption.createEl("input", {
      type: "radio",
      attr: { name: "date-type", value: "single" },
    });

    singleDateRadio.checked = true;
    singleDateOption.createEl("span", { text: "Single Date" });

    const rangeDateOption = dateTypeContainer.createEl("label", {
      cls: "date-option",
    });
    const rangeDateRadio = rangeDateOption.createEl("input", {
      type: "radio",
      attr: { name: "date-type", value: "range" },
    });
    rangeDateOption.createEl("span", { text: "Date Range" });

    // Container for single date input
    const singleDateContainer = contentEl.createDiv({
      cls: "single-date-container",
    });

    const singleDateSetting = new Setting(singleDateContainer)
      .setName("Date")
      .setDesc("Enter the exact date of the event");

    this.startDateInput = singleDateSetting.controlEl.createEl("input", {
      type: "date",
      value: this.selectedDate
        ? this.convertWeekToDate(this.selectedDate)
        : new Date().toISOString().split("T")[0],
    });

    this.startDateInput.addEventListener("change", () => {
      const specificDate = this.startDateInput.value;
      if (specificDate) {
        const date = new Date(specificDate);
        this.selectedDate = this.plugin.getWeekKeyFromDate(date);

        // If using date range, initialize end date to same as start if not set
        if (this.isDateRange && !this.endDateInput.value) {
          this.endDateInput.value = specificDate;
          this.selectedEndDate = this.selectedDate;
        }
      }
    });

    // Container for date range inputs
    const rangeDateContainer = contentEl.createDiv({
      cls: "range-date-container",
    });
    rangeDateContainer.style.display = "none";

    const startDateSetting = new Setting(rangeDateContainer)
      .setName("Start Date")
      .setDesc("Enter the first date of the event range");

    this.startDateInput = startDateSetting.controlEl.createEl("input", {
      type: "date",
      value: this.selectedDate
        ? this.convertWeekToDate(this.selectedDate)
        : new Date().toISOString().split("T")[0],
    });

    this.startDateInput.addEventListener("change", () => {
      const specificDate = this.startDateInput.value;
      if (specificDate) {
        const date = new Date(specificDate);
        this.selectedDate = this.plugin.getWeekKeyFromDate(date);
      }
    });

    const endDateSetting = new Setting(rangeDateContainer)
      .setName("End Date")
      .setDesc("Enter the last date of the event range");

    this.endDateInput = endDateSetting.controlEl.createEl("input", {
      type: "date",
      value: this.selectedEndDate
        ? this.convertWeekToDate(this.selectedEndDate)
        : this.startDateInput.value,
    });

    this.endDateInput.addEventListener("change", () => {
      const specificDate = this.endDateInput.value;
      if (specificDate) {
        const date = new Date(specificDate);
        this.selectedEndDate = this.plugin.getWeekKeyFromDate(date);
      }
    });

    // Add listeners to toggle between single date and range inputs
    singleDateRadio.addEventListener("change", () => {
      if (singleDateRadio.checked) {
        this.isDateRange = false;
        singleDateContainer.style.display = "block";
        rangeDateContainer.style.display = "none";
      }
    });

    rangeDateRadio.addEventListener("change", () => {
      if (rangeDateRadio.checked) {
        this.isDateRange = true;
        singleDateContainer.style.display = "none";
        rangeDateContainer.style.display = "block";
      }
    });

    contentEl.appendChild(singleDateContainer);
    contentEl.appendChild(rangeDateContainer);

    contentEl.createEl("small", {
      text: "Select the date(s) of your event. The system determines the week(s) automatically.",
      cls: "chronos-helper-text",
    });

    if (this.selectedDate) {
      contentEl.createEl("p", {
        text: this.isDateRange
          ? `This event spans from week ${this.selectedDate} to ${
              this.selectedEndDate || this.selectedDate
            }`
          : `This date falls in week: ${this.selectedDate}`,
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
      { name: "Education/Career", color: "#9C27B0" },
    ];

    const typeSettingContainer = new Setting(contentEl)
      .setName("Select Event Type")
      .setDesc("Choose a preset type or create your own");

    const radioContainer = typeSettingContainer.controlEl.createDiv({
      cls: "chronos-radio-container",
    });

    // Create radio buttons for preset event types
    for (const type of presetTypes) {
      const radioLabel = radioContainer.createEl("label", {
        cls: "chronos-radio-label",
      });

      const radioBtn = radioLabel.createEl("input");
      radioBtn.type = "radio";
      radioBtn.name = "eventType";
      radioBtn.value = type.name;

      if (type.name === this.selectedEventType) {
        radioBtn.checked = true;
      }

      const colorBox = radioLabel.createEl("span", {
        cls: "chronos-color-box",
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
      cls: "chronos-radio-label",
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
      cls: "chronos-custom-type-settings",
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
    if (!this.selectedDate && this.startDateInput) {
      new Notice("Please select a date");
      return;
    }

    if (!this.eventDescription) {
      new Notice("Please add a description");
      return;
    }

    // For date range, validate end date
    if (
      this.isDateRange &&
      (!this.selectedEndDate || !this.endDateInput?.value)
    ) {
      new Notice("Please select an end date for the range");
      return;
    }

    // Handle adding custom event type if needed
    if (this.isCustomType && this.customEventName) {
      const existingIndex = this.plugin.settings.customEventTypes.findIndex(
        (type) => type.name === this.customEventName
      );

      if (existingIndex === -1) {
        this.plugin.settings.customEventTypes.push({
          name: this.customEventName,
          color: this.selectedColor,
        });
        this.plugin.settings.customEvents[this.customEventName] = [];
      }

      this.selectedEventType = this.customEventName;
    }

    // If using date range, create events for all weeks in the range
    if (this.isDateRange && this.selectedEndDate) {
      // Get start and end dates
      const startDate = new Date(this.startDateInput.value);
      const endDate = new Date(this.endDateInput.value);

      // Get all week keys in the range
      const weekKeys = this.plugin.getWeekKeysBetweenDates(startDate, endDate);

      // Create filename for the note (use the whole range)
      const startWeekKey = this.plugin.getWeekKeyFromDate(startDate);
      const endWeekKey = this.plugin.getWeekKeyFromDate(endDate);
      const fileName = `${startWeekKey.replace(
        "W",
        "-W"
      )}_to_${endWeekKey.replace("W", "-W")}.md`;

      // Format date range event data with range markers
      const eventData = `${startWeekKey}:${endWeekKey}:${this.eventDescription}`;

      // Add event to appropriate collection
      this.addEventToCollection(eventData);

      // Create a note for the event (for the range)
      this.createEventNote(fileName, startDate, endDate);

      // Save settings
      this.plugin.saveSettings().then(() => {
        new Notice(
          `Event added: ${this.eventDescription} (${weekKeys.length} weeks)`
        );
        this.close();
        this.refreshViews();
      });
    } else {
      // Handle single date event (original functionality)
      const eventDateStr = this.selectedDate || this.startDateInput.value;
      const eventDate = new Date(eventDateStr);
      const weekKey = this.plugin.getWeekKeyFromDate(eventDate);

      // Format event data string
      const eventData = `${weekKey}:${this.eventDescription}`;

      // Add event to appropriate collection
      this.addEventToCollection(eventData);

      // Create note file
      const fileName = `${weekKey.replace("W", "-W")}.md`;
      this.createEventNote(fileName, eventDate);

      // Save settings
      this.plugin.saveSettings().then(() => {
        new Notice(`Event added: ${this.eventDescription}`);
        this.close();
        this.refreshViews();
      });
    }
  }


  /**
   * Add event to the appropriate collection based on event type
   * @param eventData - Event data string
   */
  addEventToCollection(eventData: string): void {
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
        this.plugin.settings.customEvents[this.selectedEventType].push(
          eventData
        );
    }
  }

  

  /**
   * Create a note file for the event
   * @param fileName - Name of the file
   * @param startDate - Start date of the event
   * @param endDate - Optional end date for range events
   */
  async createEventNote(
    fileName: string,
    startDate: Date,
    endDate?: Date
  ): Promise<void> {
    const fullPath = this.plugin.getFullPath(fileName);
    const fileExists =
      this.plugin.app.vault.getAbstractFileByPath(fullPath) instanceof TFile;

    if (!fileExists) {
      // Create folder if needed
      if (
        this.plugin.settings.notesFolder &&
        this.plugin.settings.notesFolder.trim() !== ""
      ) {
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

      // Create event note file with appropriate content
      let content = "";
      if (endDate) {
        // Range event
        const startDateStr = startDate.toISOString().split("T")[0];
        const endDateStr = endDate.toISOString().split("T")[0];
        content = `# Event: ${this.eventDescription}\n\nStart Date: ${startDateStr}\nEnd Date: ${endDateStr}\nType: ${this.selectedEventType}\n\n## Notes\n\n`;
      } else {
        // Single date event
        const dateStr = startDate.toISOString().split("T")[0];
        content = `# Event: ${this.eventDescription}\n\nDate: ${dateStr}\nType: ${this.selectedEventType}\n\n## Notes\n\n`;
      }

      await this.app.vault.create(fullPath, content);
    }
  }

  /**
   * Refresh all timeline views
   */
  refreshViews(): void {
    this.plugin.app.workspace
      .getLeavesOfType(TIMELINE_VIEW_TYPE)
      .forEach((leaf) => {
        const view = leaf.view as ChronosTimelineView;
        view.renderView();
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

    /** Track sidebar open/closed state */
    isSidebarOpen: boolean = true; 

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
    
    // Create main container with flexbox layout
    const mainContainer = contentEl.createEl("div", { cls: "chronos-main-container" });
    
    // Create sidebar
    const sidebarEl = mainContainer.createEl("div", { 
      cls: `chronos-sidebar ${this.isSidebarOpen ? 'expanded' : 'collapsed'}`
    });
    
    // Add sidebar header with title and toggle
    const sidebarHeader = sidebarEl.createEl("div", { cls: "chronos-sidebar-header" });
    
    // Create title in sidebar header
    sidebarHeader.createEl("div", {
      cls: "chronos-title",
      text: "life in weeks",
    });
    
    // Create sidebar toggle as part of the sidebar itself
    const sidebarToggle = sidebarHeader.createEl("button", {
      cls: "chronos-sidebar-toggle",
      attr: { title: this.isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar" }
    });
    
    sidebarToggle.innerHTML = this.isSidebarOpen ? 
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>` : 
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
    
    sidebarToggle.addEventListener("click", () => {
      this.isSidebarOpen = !this.isSidebarOpen;
      sidebarEl.classList.toggle("collapsed");
      sidebarEl.classList.toggle("expanded");
      
      // Update toggle icon
      sidebarToggle.innerHTML = this.isSidebarOpen ? 
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>` : 
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
      
      sidebarToggle.setAttribute("title", this.isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar");
    });
    
    // Controls section
    const controlsSection = sidebarEl.createEl("div", { cls: "chronos-sidebar-section" });
    controlsSection.createEl("h3", { text: "CONTROLS", cls: "section-header" });
    const controlsContainer = controlsSection.createEl("div", { cls: "chronos-controls" });
    
    // Plan future event button
    const planEventBtn = controlsContainer.createEl("button", {
      text: "Plan Event",
      cls: "chronos-btn chronos-btn-primary",
    });
    planEventBtn.addEventListener("click", () => {
      this.showAddEventModal();
    });
    
    // Manage event types button
    const manageTypesBtn = controlsContainer.createEl("button", {
      text: "Manage Event Types",
      cls: "chronos-btn chronos-btn-primary", // Same styling as Plan Event
    });
    manageTypesBtn.addEventListener("click", () => {
      const modal = new ManageEventTypesModal(this.app, this.plugin);
      modal.open();
    });
    
    // Visualization controls section
    const visualSection = sidebarEl.createEl("div", { cls: "chronos-sidebar-section" });
    visualSection.createEl("h3", { text: "VIEW OPTIONS", cls: "section-header" });
    const visualContainer = visualSection.createEl("div", { cls: "chronos-visual-controls" });
    
    // Zoom controls with 3-button layout
    const zoomControlsDiv = visualContainer.createEl("div", { cls: "chronos-zoom-controls" });
    
    // Zoom out button with SVG icon
    const zoomOutBtn = zoomControlsDiv.createEl("button", {
      cls: "chronos-btn chronos-zoom-button",
      attr: { title: "Zoom Out" },
    });
    zoomOutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      <line x1="8" y1="11" x2="14" y2="11"></line>
    </svg>`;
    zoomOutBtn.addEventListener("click", () => {
      this.zoomOut();
    });
    
    // Add zoom level indicator
    const zoomLabel = zoomControlsDiv.createEl("span", {
      text: `${Math.round(this.plugin.settings.zoomLevel * 100)}%`,
      cls: "chronos-zoom-level",
    });
    
    // Zoom in button with SVG icon
    const zoomInBtn = zoomControlsDiv.createEl("button", {
      cls: "chronos-btn chronos-zoom-button",
      attr: { title: "Zoom In" },
    });
    zoomInBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      <line x1="11" y1="8" x2="11" y2="14"></line>
      <line x1="8" y1="11" x2="14" y2="11"></line>
    </svg>`;
    zoomInBtn.addEventListener("click", () => {
      this.zoomIn();
    });
    
    // Fit to screen button
    const fitToScreenBtn = visualContainer.createEl("button", {
      cls: "chronos-btn chronos-fit-to-screen",
      text: "Fit to Screen",
      attr: { title: "Automatically adjust zoom to fit entire grid on screen" }
    });
    fitToScreenBtn.addEventListener("click", () => {
      this.fitToScreen();
    });
    
    // Legend section (vertical)
    const legendSection = sidebarEl.createEl("div", { cls: "chronos-sidebar-section" });
    legendSection.createEl("h3", { text: "LEGEND", cls: "section-header" });
    const legendEl = legendSection.createEl("div", { cls: "chronos-legend" });
    
    // Standard event types for legend
    const legendItems = [
      { text: "Major Life Events", color: "#4CAF50" },
      { text: "Travel", color: "#2196F3" },
      { text: "Relationships", color: "#E91E63" },
      { text: "Education/Career", color: "#9C27B0" },
      {
        text: "Upcoming Planned Event",
        color: this.plugin.settings.futureCellColor,
      },
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
          cls: "chronos-legend-item",
        });
        const customColorEl = customLegendEl.createEl("div", {
          cls: "chronos-legend-color",
        });
        customColorEl.style.backgroundColor = customType.color;
        customLegendEl.createEl("span", { text: customType.name });
      });
    }
    
    // Footer in sidebar
    sidebarEl.createEl("div", {
      cls: "chronos-footer",
      text: this.plugin.settings.quote,
    });
    
    // Create content area
    const contentAreaEl = mainContainer.createEl("div", { cls: "chronos-content-area" });
    
    // Create collapsed sidebar indicator/toggle for when sidebar is collapsed
    if (!this.isSidebarOpen) {
      const collapsedToggle = contentAreaEl.createEl("button", {
        cls: "chronos-collapsed-toggle",
        attr: { title: "Expand Sidebar" }
      });
      collapsedToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
      collapsedToggle.addEventListener("click", () => {
        this.isSidebarOpen = true;
        this.renderView();
      });
    }
    
    // Create the view container
    const viewEl = contentAreaEl.createEl("div", { cls: "chronos-view" });
    
    // Render the weeks grid
    this.renderWeeksGrid(viewEl);
  }

  /**
   * Show modal for adding an event
   */
  showAddEventModal(): void {
    const modal = new ChronosEventModal(this.app, this.plugin);
    modal.open();
  }

  /**
   * Zoom in the grid view
   */
  zoomIn(): void {
    // Increase zoom level by 0.1 (10%), max 3.0
    this.plugin.settings.zoomLevel = Math.min(3.0, this.plugin.settings.zoomLevel + 0.1);
    this.plugin.saveSettings();
    
    // Update only the grid and zoom level indicator without full re-render
    this.updateZoomLevel();
  }

  /**
   * Zoom out the grid view
   */
  zoomOut(): void {
    // Decrease zoom level by 0.1 (10%), min 0.1 (10%)
    this.plugin.settings.zoomLevel = Math.max(0.1, this.plugin.settings.zoomLevel - 0.1);
    this.plugin.saveSettings();
    
    // Update only the grid and zoom level indicator without full re-render
    this.updateZoomLevel();
  }

  /**
   * Update zoom-affected elements without re-rendering the entire view
   */
  updateZoomLevel(): void {
    // Get the container element
    const contentEl = this.containerEl.children[1];
    
    // Update zoom level indicator
    const zoomLabel = contentEl.querySelector('.chronos-zoom-level');
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(this.plugin.settings.zoomLevel * 100)}%`;
    }
    
    // Update cell size CSS variable
    const root = document.documentElement;
    const baseSize = parseInt(getComputedStyle(root).getPropertyValue("--base-cell-size")) || 16;
    const cellSize = Math.round(baseSize * this.plugin.settings.zoomLevel);
    root.style.setProperty("--cell-size", `${cellSize}px`);
    
    // Clear and re-render just the grid
    const viewEl = contentEl.querySelector('.chronos-view');
    if (viewEl instanceof HTMLElement) {
      viewEl.empty();
    }
    
    
    // Update fitToScreen button state if it exists
    const fitButton = contentEl.querySelector('.chronos-fit-to-screen');
    if (fitButton) {
      fitButton.classList.toggle('active', this.isGridFitToScreen());
    }
  }

  /**
   * Automatically adjust zoom level to fit the entire grid on screen
   */
  fitToScreen(): void {
    // Get the view container
    const contentEl = this.containerEl.children[1];
    const viewEl = contentEl.querySelector('.chronos-view');
    
    if (!viewEl) return;
    
    // Get available space
    const viewRect = viewEl.getBoundingClientRect();
    const availableWidth = viewRect.width - parseInt(getComputedStyle(document.documentElement).getPropertyValue("--left-offset"));
    const availableHeight = viewRect.height - parseInt(getComputedStyle(document.documentElement).getPropertyValue("--top-offset"));
    
    // Calculate required width/height for the grid
    const yearsCount = this.plugin.settings.lifespan;
    const weeksCount = 52;
    const cellGap = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--cell-gap")) || 2;
    
    // Calculate the zoom level needed to fit
    const cellWidth = availableWidth / (yearsCount + yearsCount/10); // Account for decade spacing
    const cellHeight = availableHeight / weeksCount;
    const zoomRatio = Math.min(cellWidth, cellHeight) / (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--base-cell-size")) || 16);
    
    // Set the new zoom level (with limits)
    this.plugin.settings.zoomLevel = Math.max(0.1, Math.min(3.0, zoomRatio * 0.95)); // 95% of calculated size for some margin
    this.plugin.saveSettings();
    
    // Update the UI
    this.updateZoomLevel();
  }

  /**
   * Check if the grid is currently fit to screen
   */
  isGridFitToScreen(): boolean {
    // Implementation details would go here - comparing current zoom to calculated ideal zoom
    return false; // Placeholder
  }

/**
 * Render the main weeks grid visualization
 * @param container - Container to render grid in
 */
renderWeeksGrid(container: HTMLElement): void {
  container.empty();

  // Get the CSS variables for positioning and styling
  const root = document.documentElement;
  const baseSize = parseInt(getComputedStyle(root).getPropertyValue("--base-cell-size")) || 16;
  const cellSize = Math.round(baseSize * this.plugin.settings.zoomLevel);
  // Apply the zoomed cell size to the CSS variable
  root.style.setProperty("--cell-size", `${cellSize}px`);
  const cellGap = parseInt(getComputedStyle(root).getPropertyValue("--cell-gap")) || 2;
  const leftOffset = parseInt(getComputedStyle(root).getPropertyValue("--left-offset")) || 70;
  const topOffset = parseInt(getComputedStyle(root).getPropertyValue("--top-offset")) || 50;
  const regularGap = cellGap; // Store the regular gap size

  // Create decade markers container (horizontal markers above the grid)
  if (this.plugin.settings.showDecadeMarkers) {
    const decadeMarkersContainer = container.createEl("div", {
      cls: "chronos-decade-markers",
    });

    // Add decade markers (0, 10, 20, etc.)
    for (let decade = 0; decade <= this.plugin.settings.lifespan; decade += 10) {
      const marker = decadeMarkersContainer.createEl("div", {
        cls: "chronos-decade-marker",
        text: decade.toString(),
      });

      // Position each decade marker using the calculateYearPosition method
      marker.style.position = "absolute";

      // Calculate position with the decade spacing
      const leftPosition = this.plugin.calculateYearPosition(decade, cellSize, regularGap) + cellSize / 2;

      marker.style.left = `${leftPosition}px`;
      marker.style.top = `${topOffset / 2}px`;
      marker.style.transform = "translate(-50%, -50%)";
    }
  }

    // Add birthday cake marker (independent of month markers)
  if (this.plugin.settings.showBirthdayMarker) {
    const birthdayDate = new Date(this.plugin.settings.birthday);
    const birthMonth = birthdayDate.getMonth();
    const birthDay = birthdayDate.getDate();
    const birthYear = birthdayDate.getFullYear();
    const birthMonthName = MONTH_NAMES[birthMonth];
    
    const birthdayMarkerContainer = container.createEl("div", {
      cls: "chronos-birthday-marker-container",
    });

    // Position the container near the grid
    birthdayMarkerContainer.style.position = "absolute";
    birthdayMarkerContainer.style.top = `${topOffset - 2}px`; // Align with the top of the grid
    birthdayMarkerContainer.style.left = `${leftOffset - 22}px`; // Position closer to the grid
    birthdayMarkerContainer.style.zIndex = "15"; // Ensure visibility above other elements

    // Create cake icon for birthday
    const cakeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f48fb1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v2"/><path d="M12 8v2"/><path d="M17 8v2"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>`;

    const cakeEl = birthdayMarkerContainer.createEl("div", {
      cls: "birthday-cake-marker",
    });

    cakeEl.innerHTML = cakeSvg;
    cakeEl.setAttribute("title", `${birthMonthName} ${birthDay}, ${birthYear} (Your Birthday)`);
  }

  // Create vertical markers container with structured layout
  const markersContainer = container.createEl("div", {
    cls: "chronos-vertical-markers",
  });

  // First, create the separate containers for week and month markers
  const weekMarkersContainer = markersContainer.createEl("div", {
    cls: "chronos-week-markers",
  });

  const monthMarkersContainer = markersContainer.createEl("div", {
    cls: "chronos-month-markers",
  });

  

  // Add week markers (10, 20, 30, 40, 50) if enabled
  if (this.plugin.settings.showWeekMarkers) {
    for (let week = 0; week <= 50; week += 10) {
      if (week === 0) continue; // Skip 0 to start with 10

      const marker = weekMarkersContainer.createEl("div", {
        cls: "chronos-week-marker",
        text: week.toString(),
      });

      // Calculate the exact position - align to grid
      const topPosition = week * (cellSize + cellGap) + cellSize / 2 - (cellSize + cellGap);
      
      marker.style.top = `${topPosition}px`;
    }
  }

  // Add month markers if enabled
  if (this.plugin.settings.showMonthMarkers) {
    const birthdayDate = new Date(this.plugin.settings.birthday);
    const birthMonth = birthdayDate.getMonth();
    const birthDay = birthdayDate.getDate();
    const birthYear = birthdayDate.getFullYear();
    const birthMonthName = MONTH_NAMES[birthMonth];
    
    
    // Calculate which week of the month the birthday falls in
    // First, get first day of birth month
    const firstDayOfBirthMonth = new Date(birthYear, birthMonth, 1);
    
    // Calculate days between first of month and birthday
    const daysBetween = (birthdayDate.getTime() - firstDayOfBirthMonth.getTime()) / (1000 * 60 * 60 * 24);
    
    // Calculate which week of the month (0-indexed) the birthday falls in
    const birthWeekOfMonth = Math.floor(daysBetween / 7);
    
    // Now calculate the position for the birth month marker
    // If birthday is in week 3 of the month (0-indexed), place month marker at week 51 (second-to-last row)
    // If birthday is in week 2 of the month, place month marker at week 0 (last row)
    // If birthday is in week 1 of the month, place month marker at week 1 (first row)
    const birthMonthMarkerWeek = (52 - birthWeekOfMonth) % 52;
    
    // Calculate month markers from the plugin
    const monthMarkers = this.plugin.calculateMonthMarkers(
      birthdayDate,
      this.plugin.settings.lifespan,
      this.plugin.settings.monthMarkerFrequency
    );

    // Create a map to store one marker per month 
    const monthMarkersMap = new Map<number, {label: string, weekIndex: number, isFirstOfYear: boolean, fullLabel: string}>();
    
    // Process all markers to find the best one for each month
    for (const marker of monthMarkers) {
      const monthIndex = MONTH_NAMES.indexOf(marker.label);
      if (monthIndex === -1) continue; // Skip if not a valid month
      
      // Skip if this is the birth month - we'll handle it separately
      if (monthIndex === birthMonth) continue;
      
      // Calculate the actual week position within the grid (0-51)
      const weekPosition = marker.weekIndex % 52;
      
      // Only add this month if we haven't seen it yet
      if (!monthMarkersMap.has(monthIndex)) {
        monthMarkersMap.set(monthIndex, {
          label: marker.label,
          weekIndex: weekPosition,
          isFirstOfYear: marker.isFirstOfYear,
          fullLabel: marker.fullLabel
        });
      }
    }
    
    // Manually add the birth month marker at the calculated position
    monthMarkersMap.set(birthMonth, {
      label: birthMonthName,
      weekIndex: birthMonthMarkerWeek, 
      isFirstOfYear: birthMonth === 0, // January = true
      fullLabel: `${birthMonthName} ${birthYear} (Birth Month)`
    });

    // Render all month markers
    for (const [monthIndex, marker] of monthMarkersMap.entries()) {
      // Create marker element
      const markerEl = monthMarkersContainer.createEl("div", {
        cls: `chronos-month-marker ${marker.isFirstOfYear ? "first-of-year" : ""} ${monthIndex === birthMonth ? "birth-month" : ""}`,
      });
      
      // Add month name
      markerEl.textContent = marker.label;
      
      // Add tooltip
      markerEl.setAttribute("title", marker.fullLabel);
      
      // Special styling for birth month
      if (monthIndex === birthMonth && !markerEl.innerHTML.includes("svg")) {
        markerEl.style.color = "#e91e63"; // Pink color
        markerEl.style.fontWeight = "500";
      }
      
      // Position the marker
      markerEl.style.top = `${marker.weekIndex * (cellSize + cellGap) + cellSize / 2}px`;
    }
  }

  // Create the grid container
  const gridEl = container.createEl("div", { cls: "chronos-grid" });
  // Use display block instead of grid, as we'll manually position each cell
  gridEl.style.display = "block";
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

      // Set the title attribute to show the date range on hover
      const dateRange = this.plugin.getWeekDateRange(weekKey);
      cell.setAttribute("title", `Week ${cellWeek}, ${cellYear}\n${dateRange}`);

      // Position the cell with absolute positioning
      cell.style.position = "absolute";

      // Calculate left position with decade spacing
      const leftPos = this.plugin.calculateYearPosition(
        year,
        cellSize,
        regularGap
      );

      // Calculate top position (unchanged)
      const topPos = week * (cellSize + regularGap);

      cell.style.left = `${leftPos}px`;
      cell.style.top = `${topPos}px`;

      // Explicitly set width and height (previously handled by grid)
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;

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

      // Add click and context menu events to the cell
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
          if (
            this.plugin.settings.notesFolder &&
            this.plugin.settings.notesFolder.trim() !== ""
          ) {
            try {
              const folderExists = this.app.vault.getAbstractFileByPath(
                this.plugin.settings.notesFolder
              );
              if (!folderExists) {
                await this.app.vault.createFolder(
                  this.plugin.settings.notesFolder
                );
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

    // Add context menu (right-click) event for manual fill
    cell.addEventListener("contextmenu", (event) => {
      // Only allow manual fill if auto-fill is disabled and for future weeks
      if (this.plugin.settings.enableAutoFill || weekIndex <= ageInWeeks) {
        return;
      }
      
      // Prevent default context menu
      event.preventDefault();
      
      // Toggle filled status
      const filledIndex = this.plugin.settings.filledWeeks.indexOf(weekKey);
      
      if (filledIndex >= 0) {
        // Remove from filled weeks
        this.plugin.settings.filledWeeks.splice(filledIndex, 1);
        cell.removeClass("filled-week");
      } else {
        // Add to filled weeks
        this.plugin.settings.filledWeeks.push(weekKey);
        cell.addClass("filled-week");
        cell.style.backgroundColor = "#8bc34a"; // Light green for filled weeks
      }
      
      // Save settings
      this.plugin.saveSettings();
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
    // Helper to check for range events and apply styling
    const applyEventStyle = (
      events: string[],
      defaultColor: string,
      defaultDesc: string
    ): boolean => {
      // Check for exact match (single date events)
      const singleEvent = events.find(
        (e) => e.startsWith(`${weekKey}:`) && !e.includes(":", 10)
      );

      if (singleEvent) {
        cell.style.backgroundColor = defaultColor;
        cell.addClass("event");
        const description = singleEvent.split(":")[1] || defaultDesc;
        const currentTitle = cell.getAttribute("title") || "";
        cell.setAttribute("title", `${description}\n${currentTitle}`);
        return true;
      }

      // Check for range events (format: startWeek:endWeek:description)
      const rangeEvents = events.filter((e) => {
        const parts = e.split(":");
        return (
          parts.length >= 3 && parts[0].includes("W") && parts[1].includes("W")
        );
      });

      for (const rangeEvent of rangeEvents) {
        const [startWeekKey, endWeekKey, description] = rangeEvent.split(":");

        // Skip if the format is invalid
        if (!startWeekKey || !endWeekKey) continue;

        // Parse the week numbers
        const startYear = parseInt(startWeekKey.split("-W")[0]);
        const startWeek = parseInt(startWeekKey.split("-W")[1]);
        const endYear = parseInt(endWeekKey.split("-W")[0]);
        const endWeek = parseInt(endWeekKey.split("-W")[1]);

        // Parse current cell week
        const cellYear = parseInt(weekKey.split("-W")[0]);
        const cellWeek = parseInt(weekKey.split("-W")[1]);

        // Check if current week falls within the range
        const isInRange =
          (cellYear > startYear ||
            (cellYear === startYear && cellWeek >= startWeek)) &&
          (cellYear < endYear || (cellYear === endYear && cellWeek <= endWeek));

        if (isInRange) {
          cell.style.backgroundColor = defaultColor;
          cell.addClass("event");
          const eventDesc = description || defaultDesc;
          const currentTitle = cell.getAttribute("title") || "";
          cell.setAttribute("title", `${eventDesc} (${startWeekKey} to ${endWeekKey})\n${currentTitle}`);
          return true;
        }
      }

      return false;
    };

    // Apply event styling for each event type
    const hasGreenEvent = applyEventStyle(
      this.plugin.settings.greenEvents,
      "#4CAF50",
      "Major Life Event"
    );
    if (!hasGreenEvent) {
      const hasBlueEvent = applyEventStyle(
        this.plugin.settings.blueEvents,
        "#2196F3",
        "Travel"
      );
      if (!hasBlueEvent) {
        const hasPinkEvent = applyEventStyle(
          this.plugin.settings.pinkEvents,
          "#E91E63",
          "Relationship"
        );
        if (!hasPinkEvent) {
          const hasPurpleEvent = applyEventStyle(
            this.plugin.settings.purpleEvents,
            "#9C27B0",
            "Education/Career"
          );

          // Only check custom events if no built-in event was found
          if (!hasPurpleEvent && this.plugin.settings.customEvents) {
            for (const [typeName, events] of Object.entries(
              this.plugin.settings.customEvents
            )) {
              const customType = this.plugin.settings.customEventTypes.find(
                (type) => type.name === typeName
              );

              if (customType && events.length > 0) {
                applyEventStyle(events, customType.color, typeName);
              }
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

    if (
      cellDate > now &&
      cellDate < new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000) &&
      cell.classList.contains("event")
    ) {
      cell.addClass("future-event-highlight");
    }

        // Apply filled week styling if applicable
    if (this.plugin.settings.filledWeeks.includes(weekKey)) {
      cell.addClass("filled-week");
      // Only change color if no event is on this week
      if (!cell.classList.contains("event")) {
        cell.style.backgroundColor = "#8bc34a"; // Light green for filled weeks
      }
    }
  }
}

// -----------------------------------------------------------------------
// MARKER SETTINGS MODAL
// -----------------------------------------------------------------------

/**
 * Modal for configuring which timeline markers are visible
 */
class MarkerSettingsModal extends Modal {
  /** Reference to the main plugin */
  plugin: ChronosTimelinePlugin;

  /** Callback to refresh views when settings change */
  refreshCallback: () => void;

  /**
   * Create a new marker settings modal
   * @param app - Obsidian App instance
   * @param plugin - ChronosTimelinePlugin instance
   * @param refreshCallback - Callback to refresh views
   */
  constructor(
    app: App,
    plugin: ChronosTimelinePlugin,
    refreshCallback: () => void
  ) {
    super(app);
    this.plugin = plugin;
    this.refreshCallback = refreshCallback;
  }

  /**
   * Build the modal UI when opened
   */
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Timeline Marker Settings" });
    contentEl.createEl("p", {
      text: "Choose which timeline markers are visible",
    });

    // Decade markers setting
    new Setting(contentEl)
      .setName("Decade Markers")
      .setDesc("Show decade markers along the top (0, 10, 20, ...)")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showDecadeMarkers)
          .onChange(async (value) => {
            this.plugin.settings.showDecadeMarkers = value;
            await this.plugin.saveSettings();
            this.refreshCallback();
          });
      });

          // Birthday marker setting
    new Setting(contentEl)
    .setName("Birthday Marker")
    .setDesc("Show birthday cake icon at your birth week")
    .addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.showBirthdayMarker)
        .onChange(async (value) => {
          this.plugin.settings.showBirthdayMarker = value;
          await this.plugin.saveSettings();
          this.refreshCallback();
        })
    );

    // Week markers setting
    new Setting(contentEl)
      .setName("Week Markers")
      .setDesc("Show week markers along the left (10, 20, 30, ...)")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showWeekMarkers)
          .onChange(async (value) => {
            this.plugin.settings.showWeekMarkers = value;
            await this.plugin.saveSettings();
            this.refreshCallback();
          });
      });

    // Month markers setting
    new Setting(contentEl)
      .setName("Month Markers")
      .setDesc("Show month markers along the left side (Jan, Feb, Mar, ...)")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showMonthMarkers)
          .onChange(async (value) => {
            this.plugin.settings.showMonthMarkers = value;
            await this.plugin.saveSettings();
            this.refreshCallback();
          });
      });

    // Month marker frequency dropdown
    const monthMarkerSetting = new Setting(contentEl)
      .setName("Month Marker Frequency")
      .setDesc("Choose how often month markers appear")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "Every Month")
          .addOption("quarter", "Every Quarter (Jan, Apr, Jul, Oct)")
          .addOption("half-year", "Every Half Year (Jan, Jul)")
          .addOption("year", "Every Year (Jan only)")
          .setValue(this.plugin.settings.monthMarkerFrequency)
          .onChange(async (value: string) => {
            this.plugin.settings.monthMarkerFrequency = value as
              | "all"
              | "quarter"
              | "half-year"
              | "year";
            await this.plugin.saveSettings();
            this.refreshCallback();
          });
      });

    // Show or hide frequency dropdown based on month markers toggle
    monthMarkerSetting.setClass("month-marker-frequency");
    if (!this.plugin.settings.showMonthMarkers) {
      monthMarkerSetting.settingEl.style.display = "none";
    }

    // Close button
    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Close")
        .setCta()
        .onClick(() => {
          this.close();
        })
    );
  }

  /**
   * Clean up on modal close
   */
  onClose(): void {
    this.contentEl.empty();
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
      placeholder: "Event Type Name",
    });

    const colorInput = addSection.createEl("input", {
      type: "color",
      value: "#FF9800",
    });

    const addButton = addSection.createEl("button", {
      text: "Add Type",
      cls: "add-type-button",
    });

    addButton.addEventListener("click", () => {
      const name = nameInput.value.trim();

      if (!name) {
        new Notice("Please enter a name for the event type");
        return;
      }

      if (
        this.plugin.settings.customEventTypes.some((type) => type.name === name)
      ) {
        new Notice("An event type with this name already exists");
        return;
      }

      this.plugin.settings.customEventTypes.push({
        name: name,
        color: colorInput.value,
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
      cls: "event-type-existing-section",
    });

    existingSection.createEl("h3", { text: "Existing Event Types" });
    this.renderExistingTypes(existingSection);

    // Close button
    const closeButton = contentEl.createEl("button", {
      text: "Close",
      cls: "close-button",
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
      cls: "built-in-note",
    });

    const builtInTypes = [
      { name: "Major Life", color: "#4CAF50" },
      { name: "Travel", color: "#2196F3" },
      { name: "Relationship", color: "#E91E63" },
      { name: "Education/Career", color: "#9C27B0" },
    ];

    for (const type of builtInTypes) {
      const typeItem = newList.createEl("div", {
        cls: "event-type-item built-in",
      });

      const colorBox = typeItem.createEl("span", { cls: "event-type-color" });
      colorBox.style.backgroundColor = type.color;
      typeItem.createEl("span", { text: type.name, cls: "event-type-name" });
    }

    // Custom types section
    if (this.plugin.settings.customEventTypes.length > 0) {
      newList.createEl("p", {
        text: "Your custom types",
        cls: "custom-types-note",
      });

      for (const type of this.plugin.settings.customEventTypes) {
        const typeItem = newList.createEl("div", {
          cls: "event-type-item custom",
        });

        const colorBox = typeItem.createEl("span", { cls: "event-type-color" });
        colorBox.style.backgroundColor = type.color;
        typeItem.createEl("span", { text: type.name, cls: "event-type-name" });

        // Edit button
        const editButton = typeItem.createEl("button", {
          text: "Edit",
          cls: "edit-type-button",
        });

        editButton.addEventListener("click", () => {
          this.showEditTypeModal(type);
        });

        // Delete button
        const deleteButton = typeItem.createEl("button", {
          text: "Delete",
          cls: "delete-type-button",
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
        cls: "no-custom-types",
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
      cls: "save-edit-button",
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
          color: colorInput.value,
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
      cls: "cancel-edit-button",
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
      text: "Customize your life timeline visualization.",
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

    // Marker visibility section
    containerEl.createEl("h3", { text: "Marker Visibility" });

    // Decade markers setting
    new Setting(containerEl)
      .setName("Decade Markers")
      .setDesc("Show decade markers along the top (0, 10, 20, ...)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showDecadeMarkers)
          .onChange(async (value) => {
            this.plugin.settings.showDecadeMarkers = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );

    // Week markers setting
    new Setting(containerEl)
      .setName("Week Markers")
      .setDesc("Show week markers along the left (10, 20, 30, ...)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showWeekMarkers)
          .onChange(async (value) => {
            this.plugin.settings.showWeekMarkers = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );

    // Month markers setting
    new Setting(containerEl)
      .setName("Month Markers")
      .setDesc("Show month markers along the left side (Jan, Feb, Mar, ...)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showMonthMarkers)
          .onChange(async (value) => {
            this.plugin.settings.showMonthMarkers = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();

            // Show/hide month marker frequency setting based on toggle state
            const freqSetting = containerEl.querySelector(
              ".month-marker-frequency"
            );
            if (freqSetting) {
              (freqSetting as HTMLElement).style.display = value
                ? "flex"
                : "none";
            }
          })
      );

    // Month marker frequency setting
    const freqSetting = new Setting(containerEl)
      .setName("Month Marker Frequency")
      .setDesc("Choose how often month markers appear")
      .setClass("month-marker-frequency")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", "Every Month")
          .addOption("quarter", "Every Quarter (Jan, Apr, Jul, Oct)")
          .addOption("half-year", "Every Half Year (Jan, Jul)")
          .addOption("year", "Every Year (Jan only)")
          .setValue(this.plugin.settings.monthMarkerFrequency)
          .onChange(async (value: string) => {
            this.plugin.settings.monthMarkerFrequency = value as
              | "all"
              | "quarter"
              | "half-year"
              | "year";
            await this.plugin.saveSettings();
            this.refreshAllViews();
          });
      });

    // Hide frequency setting if month markers are disabled
    if (!this.plugin.settings.showMonthMarkers) {
      freqSetting.settingEl.style.display = "none";
    }

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

    // Find the "Week Filling Options" section in your code
    containerEl.createEl("h3", { text: "Week Filling Options" });

    // Replace the existing toggles with this single toggle that handles both modes
    new Setting(containerEl)
      .setName("Enable Auto-Fill")
      .setDesc("When enabled, automatically marks weeks as completed on a specific day. When disabled, you can manually mark weeks by right-clicking them.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoFill)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoFill = value;
            // If auto-fill is enabled, manual fill should be disabled
            this.plugin.settings.enableManualFill = !value;
            await this.plugin.saveSettings();
            
            // Show/hide day selector based on toggle state
            const daySelector = containerEl.querySelector(".auto-fill-day-selector");
            if (daySelector) {
              (daySelector as HTMLElement).style.display = value ? "flex" : "none";
            }
            
            // Add status indicator text
            const statusIndicator = containerEl.querySelector(".fill-mode-status");
            if (statusIndicator) {
              (statusIndicator as HTMLElement).textContent = value 
                ? "Auto-fill is active. Weeks will be filled automatically." 
                : "Manual fill is active. Right-click on future weeks to mark them as filled.";
            } else {
              const statusEl = containerEl.createEl("div", {
                cls: "fill-mode-status",
                text: value 
                  ? "Auto-fill is active. Weeks will be filled automatically." 
                  : "Manual fill is active. Right-click on future weeks to mark them as filled."
              });
              statusEl.style.fontStyle = "italic";
              statusEl.style.marginTop = "5px";
              statusEl.style.color = "var(--text-muted)";
            }
            
            this.refreshAllViews();
          })
      );

    // Auto-fill day selector (keep this)
    const daySelector = new Setting(containerEl)
      .setName("Auto-Fill Day")
      .setDesc("Day of the week when auto-fill should occur")
      .setClass("auto-fill-day-selector")
      .addDropdown((dropdown) => {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        days.forEach((day, index) => {
          dropdown.addOption(index.toString(), day);
        });
        
        dropdown
          .setValue(this.plugin.settings.autoFillDay.toString())
          .onChange(async (value) => {
            this.plugin.settings.autoFillDay = parseInt(value);
            await this.plugin.saveSettings();
          });
      });

    // Hide day selector if auto-fill is disabled
    if (!this.plugin.settings.enableAutoFill) {
      daySelector.settingEl.style.display = "none";
    }

    // Add initial status indicator
    const statusEl = containerEl.createEl("div", {
      cls: "fill-mode-status",
      text: this.plugin.settings.enableAutoFill 
        ? "Auto-fill is active. Weeks will be filled automatically." 
        : "Manual fill is active. Right-click on future weeks to mark them as filled."
    });
    statusEl.style.fontStyle = "italic";
    statusEl.style.marginTop = "5px";
    statusEl.style.color = "var(--text-muted)";
    

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

        // Manual fill toggle
        new Setting(containerEl)
        .setName("Enable Manual Fill")
        .setDesc("Allow manually marking weeks as filled by right-clicking on them")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableManualFill)
            .onChange(async (value) => {
              this.plugin.settings.enableManualFill = value;
              await this.plugin.saveSettings();
              this.refreshAllViews();
            })
        );

        // Auto-fill toggle
        new Setting(containerEl)
        .setName("Enable Auto-Fill")
        .setDesc("Automatically mark the current week as filled on a specific day")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enableAutoFill)
            .onChange(async (value) => {
              this.plugin.settings.enableAutoFill = value;
              await this.plugin.saveSettings();
              
              // Show/hide day selector based on toggle state
              const daySelector = containerEl.querySelector(".auto-fill-day-selector");
              if (daySelector) {
                (daySelector as HTMLElement).style.display = value ? "flex" : "none";
              }
            })
        );

        // Auto-fill day selector
        const daySelector = new Setting(containerEl)
        .setName("Auto-Fill Day")
        .setDesc("Day of the week when auto-fill should occur")
        .setClass("auto-fill-day-selector")
        .addDropdown((dropdown) => {
          const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          days.forEach((day, index) => {
            dropdown.addOption(index.toString(), day);
          });
          
          dropdown
            .setValue(this.plugin.settings.autoFillDay.toString())
            .onChange(async (value) => {
              this.plugin.settings.autoFillDay = parseInt(value);
              await this.plugin.saveSettings();
            });
        });

        // Hide day selector if auto-fill is disabled
        if (!this.plugin.settings.enableAutoFill) {
        daySelector.settingEl.style.display = "none";
        }

        // Week start day setting
        new Setting(containerEl)
        .setName("Start Week On Monday")
        .setDesc("Use Monday as the first day of the week (instead of Sunday)")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.startWeekOnMonday)
            .onChange(async (value) => {
              this.plugin.settings.startWeekOnMonday = value;
              await this.plugin.saveSettings();
              this.refreshAllViews();
            })
        );

        // Clear filled weeks button
        new Setting(containerEl)
        .setName("Clear Filled Weeks")
        .setDesc("Remove all filled week markings")
        .addButton((button) => {
          button.setButtonText("Clear All").onClick(async () => {
            this.plugin.settings.filledWeeks = [];
            await this.plugin.saveSettings();
            this.refreshAllViews();
            new Notice("Cleared all filled weeks");
          });
        });

            // Zoom level setting
      new Setting(containerEl)
      .setName("Default Zoom Level")
      .setDesc("Set the default zoom level for the timeline view (1.0 = 100%)")
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 3.0, 0.25)
          .setValue(this.plugin.settings.zoomLevel)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.zoomLevel = value;
            await this.plugin.saveSettings();
            this.refreshAllViews();
          })
      );

    }

    // Help tips section
    containerEl.createEl("h3", { text: "Tips" });
    containerEl.createEl("p", {
      text: "• Click on any week to create or open a note for that week",
    });
    containerEl.createEl("p", {
      text: "• Shift+Click on a week to add an event",
    });
    containerEl.createEl("p", {
      text: "• Use the 'Plan Event' button to mark significant life events (including date ranges)",
    });
    containerEl.createEl("p", {
      text: "• Create custom event types to personalize your timeline",
    });
    containerEl.createEl("p", {
      text: "• Use the 'Marker Settings' button to customize which timeline markers are visible",
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
