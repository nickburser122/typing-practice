import "./fonts.css";
import "./styles.css";
import { boot } from "./app.js";
import { showSelfTest } from "./dev/selftest.js";

boot();
if (/[?&]selftest/.test(window.location.search)) showSelfTest();
