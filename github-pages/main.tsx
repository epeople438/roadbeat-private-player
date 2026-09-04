import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MusicApp from "../app/MusicApp";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("RoadBeat root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <MusicApp />
  </StrictMode>,
);
