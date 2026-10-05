import { loadContract } from "../lib/contract.js";
import { startApp } from "./app.js";

try {
  const [contract, response] = await Promise.all([
    loadContract(),
    fetch(new URL("../model/example-scenarios.json", import.meta.url)),
  ]);
  if (!response.ok) throw new Error("Could not load the example scenarios.");
  startApp(contract, await response.json());
} catch (error) {
  const panel = document.getElementById("panel");
  const heading = document.createElement("h2");
  heading.textContent = "Project setup could not load";
  const detail = document.createElement("p");
  detail.textContent = error.message;
  panel.replaceChildren(heading, detail);
  console.error(error);
}
