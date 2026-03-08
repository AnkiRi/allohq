export interface PopupConfig {
  popupId: string;
  formHtml: string;
  formCss: string;
  trigger: "exit_intent" | "scroll" | "timer" | "page_load";
  triggerConfig: {
    scrollPercent?: number;
    delayMs?: number;
    pageUrl?: string;
  };
  styling: {
    position?: "center" | "bottom-left" | "bottom-right" | "top-bar";
    overlayColor?: string;
    width?: string;
    animation?: "fade" | "slide-up" | "slide-down" | "scale";
  };
}

export interface PopupWidgetConfig {
  storeId: string;
  apiUrl: string;
  popupIds: string[];
  debug?: boolean;
}
