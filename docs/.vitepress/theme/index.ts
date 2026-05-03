import DefaultTheme from "vitepress/theme";
import StoreRegistry from "../components/StoreRegistry.vue";
import "./custom.css";
import { installThemeBehavior } from "./theme-behavior";

if (typeof window !== "undefined") {
  installThemeBehavior();
}

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component("StoreRegistry", StoreRegistry);
  },
};
