import DefaultTheme from "vitepress/theme";
import "./custom.css";
import { installThemeBehavior } from "./theme-behavior";

if (typeof window !== "undefined") {
  installThemeBehavior();
}

export default DefaultTheme;
